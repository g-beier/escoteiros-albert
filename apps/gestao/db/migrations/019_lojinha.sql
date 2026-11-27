-- 019 — Lojinha: itens vendidos no lançamento financeiro dão baixa no Inventário.
--
-- * Rubrica de receita marcada "venda de itens" (`categories.sells_items`; vale também para as filhas): o rateio pode
--   listar os itens vendidos (material, quantidade, preço unitário), cuja soma tem de dar o valor do rateio.
-- * Material à venda (`inventory_materials.for_sale`, só controlado por quantidade) com preço de venda opcional, que o
--   formulário do lançamento sugere.
-- * O estoque acompanha o lançamento: ao criar, editar ou excluir, `sync_entry_sales` compara os itens vendidos com o
--   que já saiu (`entry_sale_draws`, por lote) e baixa (motivo "venda", lote que vence antes primeiro) ou devolve a
--   diferença ao mesmo lote. Movimentos no canal `financeiro`; ficam "para revisar" para quem não é Editor do Inventário.
-- * Ações que mudariam o lançamento de um item vendido por fora do formulário (rubrica em lote para uma que não vende,
--   agrupar, desagrupar, excluir sem devolver) são recusadas por gatilhos.

alter type public.inventory_write_off_reason add value if not exists 'venda';

alter table public.inventory_movements drop constraint inventory_movements_channel_check;
alter table public.inventory_movements add constraint inventory_movements_channel_check
  check (channel in ('web', 'rapido', 'importacao', 'financeiro'));

create or replace function public.inventory_log(p_group_id uuid, p_kind public.inventory_movement_kind, p_material_id uuid, p_lot_id uuid,
  p_unit_id uuid, p_quantity integer, p_from_location uuid, p_to_location uuid, p_from_condition public.inventory_condition,
  p_to_condition public.inventory_condition, p_reason public.inventory_write_off_reason, p_notes text, p_details jsonb) returns bigint
  language plpgsql security definer set search_path to '' as $$
declare
  new_id bigint;
  source text := case current_setting('inventory.channel', true)
    when 'rapido' then 'rapido' when 'importacao' then 'importacao' when 'financeiro' then 'financeiro' else 'web' end;
  reviewed boolean := source <> 'rapido' and public.can_manage_inventory(p_group_id);
begin
  insert into public.inventory_movements(group_id, kind, material_id, lot_id, unit_id, quantity, from_location_id, to_location_id,
    from_condition, to_condition, write_off_reason, notes, details, review_status, reviewed_by, reviewed_at, created_by, channel)
  values (p_group_id, p_kind, p_material_id, p_lot_id, p_unit_id, p_quantity, p_from_location, p_to_location,
    p_from_condition, p_to_condition, p_reason, public.inventory_clean(p_notes), coalesce(p_details, '{}'::jsonb),
    case when reviewed then 'revisado'::public.inventory_review_status else 'para_revisar' end,
    case when reviewed then auth.uid() end, case when reviewed then now() end, auth.uid(), source)
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'inventory.' || p_kind, case when p_unit_id is not null then 'inventory_unit' when p_lot_id is not null then 'inventory_lot' else 'inventory_material' end,
    coalesce(p_unit_id, p_lot_id, p_material_id)::text, jsonb_build_object('movement_id', new_id, 'channel', source) || coalesce(p_details, '{}'::jsonb));
  return new_id;
end;
$$;

-- Rubricas ---------------------------------------------------------------------------------------------------------

alter table public.categories add column sells_items boolean not null default false;

/** A rubrica ou alguma acima dela vende itens do inventário. */
create function public.category_sells_items(p_category_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  with recursive up as (
    select id, parent_id, sells_items, 0 as depth from public.categories where id = p_category_id
    union all
    select c.id, c.parent_id, c.sells_items, up.depth + 1 from public.categories c join up on c.id = up.parent_id where up.depth < 10
  )
  select coalesce(bool_or(sells_items), false) from up;
$$;
revoke all on function public.category_sells_items(uuid) from public;
grant execute on function public.category_sells_items(uuid) to authenticated;

create or replace function public.category_snapshot(p_category_id uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('code', c.code, 'name', c.name, 'ledger_code', c.ledger_code, 'active', c.active, 'parent_id', c.parent_id,
    'sells_items', c.sells_items)
  from public.categories c where c.id = p_category_id;
$$;

-- save_category_tree (036) grava também a marca e confere: só receitas vendem; rubrica com itens vendidos continua vendendo.
do $$
declare
  def text := pg_get_functiondef('public.save_category_tree(uuid,jsonb,jsonb)'::regprocedure);
  set_active constant text := 'active = coalesce((node->>''active'')::boolean, true)';
  audit constant text := '-- 6. auditoria';
begin
  if position(set_active in def) = 0 or position(audit in def) = 0 then raise exception 'save_category_tree mudou: revisar 019'; end if;
  def := replace(def, set_active, set_active || ',
      sells_items = coalesce((node->>''sellsItems'')::boolean, false)');
  def := replace(def, audit, '-- 5b. Lojinha (019): só receitas vendem itens; rubrica com itens vendidos continua vendendo
  select c.code, c.name into bad from public.categories c
  where c.group_id = p_group_id and c.sells_items and c.kind is distinct from ''receita'' limit 1;
  if found then raise exception ''A rubrica % % é de despesa: só receitas vendem itens do inventário'', bad.code, bad.name; end if;
  select c.code, c.name into bad from public.entry_sale_items i join public.entry_splits s on s.id = i.split_id
    join public.categories c on c.id = s.category_id
  where i.group_id = p_group_id and not public.category_sells_items(c.id) limit 1;
  if found then raise exception ''A rubrica % % tem lançamentos com itens vendidos: continue marcando "venda de itens"'', bad.code, bad.name; end if;

  ' || audit);
  execute def;
end;
$$;

-- Materiais à venda ------------------------------------------------------------------------------------------------

alter table public.inventory_materials
  add column for_sale boolean not null default false,
  add column sale_price_cents bigint check (sale_price_cents >= 0),
  add constraint inventory_materials_for_sale_lot check (not for_sale or tracking = 'lot');

/** Editor do Inventário: material à venda na Lojinha e preço sugerido (centavos; vazio = sem preço). */
create function public.inventory_set_material_sale(p_material_id uuid, p_for_sale boolean, p_sale_price_cents bigint) returns void
  language plpgsql security definer set search_path to '' as $$
declare old public.inventory_materials;
begin
  select * into old from public.inventory_materials where id = p_material_id for update;
  if old.id is null or not public.can_manage_inventory(old.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if coalesce(p_for_sale, false) and old.tracking <> 'lot' then raise exception 'Só material controlado por quantidade pode ser vendido'; end if;
  if p_sale_price_cents is not null and p_sale_price_cents < 0 then raise exception 'O preço de venda não pode ser negativo'; end if;
  if old.for_sale = coalesce(p_for_sale, false) and old.sale_price_cents is not distinct from p_sale_price_cents then return; end if;
  update public.inventory_materials set for_sale = coalesce(p_for_sale, false), sale_price_cents = p_sale_price_cents, updated_at = now()
  where id = p_material_id;
  perform public.inventory_log(old.group_id, 'edicao', p_material_id, null, null, null, null, null, null, null, null, null,
    jsonb_build_object('action', 'material_updated',
      'before', jsonb_build_object('for_sale', old.for_sale, 'sale_price_cents', old.sale_price_cents),
      'after', jsonb_build_object('for_sale', coalesce(p_for_sale, false), 'sale_price_cents', p_sale_price_cents)));
end;
$$;
revoke all on function public.inventory_set_material_sale(uuid, boolean, bigint) from public;
grant execute on function public.inventory_set_material_sale(uuid, boolean, bigint) to authenticated;

-- Itens vendidos e o que saiu do estoque ---------------------------------------------------------------------------

create table public.entry_sale_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  split_id uuid not null references public.entry_splits(id) on delete cascade,
  material_id uuid not null references public.inventory_materials(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index entry_sale_items_entry on public.entry_sale_items(entry_id);
create index entry_sale_items_split on public.entry_sale_items(split_id);
create index entry_sale_items_material on public.entry_sale_items(material_id);

/** Quanto saiu de cada lote por causa do lançamento (líquido): base para devolver ao mesmo lote. */
create table public.entry_sale_draws (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  material_id uuid not null references public.inventory_materials(id),
  lot_id uuid not null references public.inventory_lots(id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index entry_sale_draws_entry on public.entry_sale_draws(entry_id);

alter table public.entry_sale_items enable row level security;
alter table public.entry_sale_draws enable row level security;
create policy "members read sale items" on public.entry_sale_items for select using (public.can_read_finance(group_id));
create policy "members read sale draws" on public.entry_sale_draws for select using (public.can_read_finance(group_id));
grant select on public.entry_sale_items, public.entry_sale_draws to authenticated;

/**
 * Materiais que o formulário do lançamento oferece: os à venda e os já vendidos em algum lançamento (para editar os
 * antigos), com o saldo somado dos lotes. Para quem lê o Financeiro, mesmo sem acesso ao Inventário.
 */
create function public.finance_sale_materials(p_group_id uuid)
  returns table(id uuid, name text, for_sale boolean, sale_price_cents bigint, stock integer)
  language sql stable security definer set search_path to '' as $$
  select m.id, m.name, m.for_sale, m.sale_price_cents, coalesce((select sum(l.quantity) from public.inventory_lots l where l.material_id = m.id), 0)::int
  from public.inventory_materials m
  where m.group_id = p_group_id and public.can_read_finance(p_group_id) and m.tracking = 'lot'
    and (m.for_sale or exists (select 1 from public.entry_sale_items i where i.material_id = m.id))
  order by m.name;
$$;
revoke all on function public.finance_sale_materials(uuid) from public;
grant execute on function public.finance_sale_materials(uuid) to authenticated;

/**
 * Acerta o estoque com os itens vendidos do lançamento: devolve ao lote o que deixou de ser vendido (do último lote
 * baixado para o primeiro) e baixa o que passou a ser vendido (lote que vence antes primeiro). Sem itens, devolve tudo.
 * Só pelas funções de lançamento (sem grant), que já conferiram a permissão no Financeiro.
 */
create function public.sync_entry_sales(p_entry_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare
  entry public.ledger_entries;
  r record;
  d record;
  lot public.inventory_lots;
  need integer;
  take integer;
  available integer;
  material_name text;
  previous_channel text := coalesce(current_setting('inventory.channel', true), '');
begin
  select * into entry from public.ledger_entries where id = p_entry_id;
  if entry.id is null then return; end if;
  perform set_config('inventory.channel', 'financeiro', true);
  for r in
    with sold as (select material_id, sum(quantity)::int as q from public.entry_sale_items where entry_id = p_entry_id group by material_id),
      drawn as (select material_id, sum(quantity)::int as q from public.entry_sale_draws where entry_id = p_entry_id group by material_id)
    select coalesce(so.material_id, dn.material_id) as material_id, coalesce(so.q, 0) as sold, coalesce(dn.q, 0) as drawn
    from sold so full join drawn dn on dn.material_id = so.material_id
    order by 1
  loop
    if r.drawn > r.sold then
      need := r.drawn - r.sold;
      for d in select * from public.entry_sale_draws where entry_id = p_entry_id and material_id = r.material_id order by id desc loop
        exit when need = 0;
        take := least(need, d.quantity);
        select * into lot from public.inventory_lots where id = d.lot_id for update;
        update public.inventory_lots set quantity = quantity + take, updated_at = now() where id = lot.id;
        perform public.inventory_log(entry.group_id, 'entrada', r.material_id, lot.id, null, take, null, lot.location_id, null, null, null,
          'Devolução da venda: ' || entry.name,
          jsonb_build_object('sale_return', true, 'entry_id', p_entry_id, 'from', lot.quantity, 'to', lot.quantity + take));
        if take = d.quantity then delete from public.entry_sale_draws where id = d.id;
        else update public.entry_sale_draws set quantity = quantity - take where id = d.id; end if;
        need := need - take;
      end loop;
    elsif r.sold > r.drawn then
      need := r.sold - r.drawn;
      select coalesce(sum(quantity), 0) into available from public.inventory_lots where material_id = r.material_id and quantity > 0;
      if available < need then
        select name into material_name from public.inventory_materials where id = r.material_id;
        raise exception 'Estoque insuficiente de %: faltam % (há % no inventário)', material_name, need - available, available;
      end if;
      for lot in
        select * from public.inventory_lots where material_id = r.material_id and quantity > 0
        order by expires_on nulls last, created_at, id for update
      loop
        exit when need = 0;
        take := least(need, lot.quantity);
        update public.inventory_lots set quantity = quantity - take, updated_at = now() where id = lot.id;
        perform public.inventory_log(entry.group_id, 'baixa', r.material_id, lot.id, null, take, lot.location_id, null, null, null, 'venda',
          'Venda: ' || entry.name, jsonb_build_object('entry_id', p_entry_id, 'from', lot.quantity, 'to', lot.quantity - take));
        insert into public.entry_sale_draws(group_id, entry_id, material_id, lot_id, quantity) values (entry.group_id, p_entry_id, r.material_id, lot.id, take);
        need := need - take;
      end loop;
    end if;
  end loop;
  perform set_config('inventory.channel', previous_channel, true);
end;
$$;
revoke all on function public.sync_entry_sales(uuid) from public;

-- Rateios: os itens de cada rateio vêm em `items` ([{material_id, quantity, unit_price_cents}]), só em rubrica que vende.
create or replace function public.write_entry_splits(p_entry_id uuid, p_group_id uuid, p_splits jsonb, p_previous_splits jsonb default '[]'::jsonb)
  returns void language plpgsql security definer set search_path to '' as $$
declare
  split jsonb;
  item jsonb;
  split_id uuid;
  split_category uuid;
  split_associate uuid;
  split_amount bigint;
  category_kind public.category_kind;
  item_material uuid;
  item_quantity integer;
  item_price bigint;
  items_total bigint;
  item_position integer;
begin
  for split in select value from jsonb_array_elements(p_splits)
  loop
    split_category := (split->>'category_id')::uuid;
    split_amount := (split->>'amount_cents')::bigint;
    select c.kind into category_kind from public.categories c
    where c.id = split_category and c.group_id = p_group_id
      and (c.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where (prev->>'category_id')::uuid = split_category));
    if not found then raise exception 'Rubrica inválida'; end if;
    if category_kind = 'receita' and split_amount < 0 then raise exception 'Rubrica de receita exige valor de entrada'; end if;
    if category_kind = 'despesa' and split_amount > 0 then raise exception 'Rubrica de despesa exige valor de saída'; end if;

    split_associate := nullif(split->>'associate_id', '')::uuid;
    if split_associate is not null and not exists (
      select 1 from public.associates a where a.id = split_associate and a.group_id = p_group_id
        and (a.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where nullif(prev->>'associate_id', '')::uuid = split_associate))
    ) then raise exception 'Associado inválido'; end if;

    insert into public.entry_splits (entry_id, category_id, amount_cents, description, associate_id)
    values (p_entry_id, split_category, split_amount, trim(split->>'description'), split_associate)
    returning id into split_id;

    if jsonb_typeof(split->'items') = 'array' and jsonb_array_length(split->'items') > 0 then
      if not public.category_sells_items(split_category) then
        raise exception 'A rubrica do rateio “%” não vende itens do inventário', trim(split->>'description');
      end if;
      items_total := 0;
      item_position := 0;
      for item in select value from jsonb_array_elements(split->'items') loop
        item_material := nullif(item->>'material_id', '')::uuid;
        item_quantity := (item->>'quantity')::integer;
        item_price := (item->>'unit_price_cents')::bigint;
        if item_material is null or not exists (
          select 1 from public.inventory_materials m where m.id = item_material and m.group_id = p_group_id and m.tracking = 'lot'
            and (m.for_sale or exists (select 1 from public.entry_sale_draws d where d.entry_id = p_entry_id and d.material_id = m.id))
        ) then raise exception 'Material à venda inválido'; end if;
        if item_quantity is null or item_quantity <= 0 then raise exception 'Informe a quantidade de cada item vendido'; end if;
        if item_price is null or item_price < 0 then raise exception 'Informe o preço de cada item vendido'; end if;
        insert into public.entry_sale_items(group_id, entry_id, split_id, material_id, quantity, unit_price_cents, position)
        values (p_group_id, p_entry_id, split_id, item_material, item_quantity, item_price, item_position);
        items_total := items_total + item_quantity * item_price;
        item_position := item_position + 1;
      end loop;
      if items_total <> split_amount then
        raise exception 'A soma dos itens vendidos não confere com o valor do rateio “%”', trim(split->>'description');
      end if;
    end if;
  end loop;
end;
$$;

-- Lançamentos: o estoque acompanha ao criar, editar e excluir.
do $$
declare
  fn text;
  def text;
  marker text;
begin
  foreach fn in array array['public.create_ledger_entry(uuid,date,text,uuid,text,boolean,bigint,jsonb,uuid,text)',
    'public.update_ledger_entry(uuid,date,text,uuid,text,boolean,bigint,jsonb,uuid,text)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    marker := case when fn like '%create%' then 'perform public.write_entry_splits(new_entry_id, p_group_id, p_splits);'
      else 'perform public.write_entry_splits(p_entry_id, entry_group, p_splits, before_state->''splits'');' end;
    if position(marker in def) = 0 then raise exception '% mudou: revisar 019', fn; end if;
    execute replace(def, marker, marker || '
  perform public.sync_entry_sales(' || case when fn like '%create%' then 'new_entry_id' else 'p_entry_id' end || ');');
  end loop;

  def := pg_get_functiondef('public.delete_ledger_entry(uuid)'::regprocedure);
  marker := 'delete from public.ledger_entries where id = p_entry_id;';
  if position(marker in def) = 0 then raise exception 'delete_ledger_entry mudou: revisar 019'; end if;
  execute replace(def, marker, '-- itens vendidos voltam ao estoque (019)
  delete from public.entry_sale_items where entry_id = p_entry_id;
  perform public.sync_entry_sales(p_entry_id);
  ' || marker);
end;
$$;

-- Travas: só o formulário do lançamento mexe em itens vendidos.
create function public.entry_sale_split_guard() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if exists (select 1 from public.entry_sale_items where split_id = old.id)
    and (new.entry_id <> old.entry_id or (new.category_id <> old.category_id and not public.category_sells_items(new.category_id))) then
    raise exception 'O rateio “%” tem itens vendidos: altere pelo formulário do lançamento', old.description;
  end if;
  return new;
end;
$$;
create trigger entry_splits_sale_guard before update of entry_id, category_id on public.entry_splits
  for each row execute function public.entry_sale_split_guard();

create function public.entry_sale_delete_guard() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if exists (select 1 from public.entry_sale_draws where entry_id = old.id) then
    raise exception 'O lançamento “%” tem itens vendidos: exclua pelo formulário do lançamento, que devolve os itens ao estoque', old.name;
  end if;
  return old;
end;
$$;
create trigger ledger_entries_sale_guard before delete on public.ledger_entries
  for each row execute function public.entry_sale_delete_guard();
