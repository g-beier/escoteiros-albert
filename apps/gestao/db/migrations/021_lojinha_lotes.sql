-- 021 — Lojinha por lote: o que fica à venda é o lote (não o material inteiro), com preço próprio.
--
-- Ex.: anéis de lenço de couro (R$ 15) e de metal (R$ 20) como lotes do mesmo material; os lenços da prateleira da
-- Lojinha à venda e os em uso na patrulha não.
-- * `inventory_lots.for_sale` e `sale_price_cents` (substituem as colunas do material, 019): fazem parte da chave do lote
--   (como a variação): lote à venda só soma com lote à venda do mesmo preço (`inventory_matching_lot`).
-- * `inventory_set_lot_sale` (Editor): põe ou tira da venda o lote inteiro ou parte dele (separa um lote novo, como a
--   troca de condição); `inventory_add_lot` aceita entrar já à venda (Editor); a ação em lote `venda` (020) passa a valer
--   para os lotes da linha (material × divisão), mantendo o preço de cada lote.
-- * Item vendido no Financeiro = lote (`entry_sale_items.lot_id`): a baixa sai exatamente dele e editar/excluir devolve a
--   ele. Catálogo `finance_sale_lots` no lugar de `finance_sale_materials`.
-- * Material e lista mostram "à venda" derivado dos lotes (`inventory_material_rows`, `inventory_stock_by_location`).

-- Lotes ------------------------------------------------------------------------------------------------------------

alter table public.inventory_lots
  add column for_sale boolean not null default false,
  add column sale_price_cents bigint check (sale_price_cents >= 0);

-- Os materiais marcados (019) passam a marca e o preço aos lotes com saldo.
update public.inventory_lots l set for_sale = true, sale_price_cents = m.sale_price_cents
from public.inventory_materials m where m.id = l.material_id and m.for_sale and l.quantity > 0;

-- Chave do lote: material, divisão, condição, validade, variação e, agora, à venda + preço.
create function public.inventory_matching_lot(p_material_id uuid, p_location_id uuid, p_condition public.inventory_condition, p_expires_on date,
  p_variant text, p_except uuid, p_for_sale boolean, p_sale_price_cents bigint) returns public.inventory_lots
  language sql security definer set search_path to '' as $$
  select * from public.inventory_lots
  where material_id = p_material_id and location_id = p_location_id and condition is not distinct from p_condition
    and expires_on is not distinct from p_expires_on and variant is not distinct from public.inventory_clean(p_variant)
    and for_sale = coalesce(p_for_sale, false)
    and (not coalesce(p_for_sale, false) or sale_price_cents is not distinct from p_sale_price_cents)
    and id is distinct from p_except
  order by quantity desc, created_at
  limit 1
  for update;
$$;
revoke all on function public.inventory_matching_lot(uuid, uuid, public.inventory_condition, date, text, uuid, boolean, bigint) from public;

/** Move `p_quantity` do lote para a divisão/condição/venda pedidas: soma num lote igual, muda o próprio lote ou cria um. */
create function public.inventory_split_lot(p_lot public.inventory_lots, p_quantity integer, p_location_id uuid, p_condition public.inventory_condition,
  p_for_sale boolean, p_sale_price_cents bigint) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare target public.inventory_lots; new_id uuid; price bigint := case when p_for_sale then p_sale_price_cents end;
begin
  target := public.inventory_matching_lot(p_lot.material_id, p_location_id, p_condition, p_lot.expires_on, p_lot.variant, p_lot.id, p_for_sale, price);
  if target.id is not null then
    update public.inventory_lots set quantity = quantity - p_quantity, updated_at = now() where id = p_lot.id;
    update public.inventory_lots set quantity = quantity + p_quantity,
      unit_value_cents = public.inventory_merged_value(unit_value_cents, quantity, p_lot.unit_value_cents, p_quantity), updated_at = now()
    where id = target.id;
    return target.id;
  end if;
  if p_quantity = p_lot.quantity then
    update public.inventory_lots set location_id = p_location_id, condition = p_condition, for_sale = p_for_sale, sale_price_cents = price, updated_at = now()
    where id = p_lot.id;
    return p_lot.id;
  end if;
  update public.inventory_lots set quantity = quantity - p_quantity, updated_at = now() where id = p_lot.id;
  insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier,
    invoice, notes, variant, for_sale, sale_price_cents)
  values (p_lot.group_id, p_lot.material_id, p_location_id, p_quantity, p_condition, p_lot.unit_value_cents, p_lot.expires_on, p_lot.acquired_on, p_lot.origin,
    p_lot.supplier, p_lot.invoice, p_lot.notes, p_lot.variant, p_for_sale, price)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.inventory_split_lot(public.inventory_lots, integer, uuid, public.inventory_condition, boolean, bigint) from public;

-- Transferência e condição: o lote leva a marca e o preço junto.
create or replace function public.inventory_split_lot(p_lot public.inventory_lots, p_quantity integer, p_location_id uuid, p_condition public.inventory_condition)
  returns uuid language sql security definer set search_path to '' as $$
  select public.inventory_split_lot(p_lot, p_quantity, p_location_id, p_condition, p_lot.for_sale, p_lot.sale_price_cents);
$$;

drop function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text, text);
create function public.inventory_add_lot(p_material_id uuid, p_location_id uuid, p_quantity integer, p_condition public.inventory_condition,
  p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text,
  p_variant text default null, p_for_sale boolean default false, p_sale_price_cents bigint default null) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare m public.inventory_materials; target public.inventory_lots; result uuid; merged boolean := false;
  sale boolean := coalesce(p_for_sale, false); price bigint := case when coalesce(p_for_sale, false) then p_sale_price_cents end;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_edit_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if m.tracking <> 'lot' then raise exception 'Este material é controlado por peça: cadastre as peças'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'A quantidade deve ser positiva'; end if;
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  if sale and not public.can_manage_inventory(m.group_id) then raise exception 'Só o Editor do Inventário põe lotes à venda'; end if;
  if price is not null and price < 0 then raise exception 'O preço de venda não pode ser negativo'; end if;
  perform public.inventory_check_location(m.group_id, p_location_id);
  target := public.inventory_matching_lot(m.id, p_location_id, p_condition, p_expires_on, p_variant, null, sale, price);
  if target.id is not null then
    update public.inventory_lots set quantity = quantity + p_quantity,
      unit_value_cents = public.inventory_merged_value(unit_value_cents, quantity, p_unit_value_cents, p_quantity), updated_at = now()
    where id = target.id;
    result := target.id; merged := true;
  else
    insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier,
      invoice, notes, variant, for_sale, sale_price_cents)
    values (m.group_id, m.id, p_location_id, p_quantity, p_condition, p_unit_value_cents, p_expires_on, p_acquired_on, coalesce(p_origin, 'nao_informada'),
      public.inventory_clean(p_supplier), public.inventory_clean(p_invoice), public.inventory_clean(p_notes), public.inventory_clean(p_variant), sale, price)
    returning id into result;
  end if;
  perform public.inventory_log(m.group_id, 'entrada', m.id, result, null, p_quantity, null, p_location_id, null, p_condition, null, p_notes,
    jsonb_strip_nulls(jsonb_build_object('origin', coalesce(p_origin, 'nao_informada'), 'unit_value_cents', p_unit_value_cents, 'expires_on', p_expires_on,
      'acquired_on', p_acquired_on, 'supplier', public.inventory_clean(p_supplier), 'invoice', public.inventory_clean(p_invoice),
      'variant', public.inventory_clean(p_variant), 'merged', merged, 'for_sale', case when sale then true end, 'sale_price_cents', price,
      'from', case when merged then target.quantity end, 'to', case when merged then target.quantity + p_quantity end)));
  return result;
end;
$$;
revoke all on function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text, text, boolean, bigint) from public;
grant execute on function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text, text, boolean, bigint) to authenticated;

drop function public.inventory_matching_lot(uuid, uuid, public.inventory_condition, date, text, uuid);

/**
 * Editor: põe à venda (com preço) ou tira da venda o lote inteiro ou só `p_quantity` dele, que vira um lote separado
 * (ou soma num lote igual). Mudar só o preço de um lote à venda também passa por aqui.
 */
create function public.inventory_set_lot_sale(p_lot_id uuid, p_for_sale boolean, p_sale_price_cents bigint, p_quantity integer default null)
  returns uuid language plpgsql security definer set search_path to '' as $$
declare
  lot public.inventory_lots := public.inventory_lock_lot(p_lot_id);
  qty integer := coalesce(p_quantity, lot.quantity);
  sale boolean := coalesce(p_for_sale, false);
  price bigint := case when coalesce(p_for_sale, false) then p_sale_price_cents end;
  target uuid;
begin
  if not public.can_manage_inventory(lot.group_id) then raise exception 'Só o Editor do Inventário põe lotes à venda'; end if;
  if price is not null and price < 0 then raise exception 'O preço de venda não pode ser negativo'; end if;
  if lot.for_sale = sale and lot.sale_price_cents is not distinct from price then raise exception 'O lote já está assim'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  target := public.inventory_split_lot(lot, qty, lot.location_id, lot.condition, sale, price);
  perform public.inventory_log(lot.group_id, 'edicao', lot.material_id, target, null, qty, null, null, null, null, null, null,
    jsonb_build_object('action', 'lot_sale', 'source_lot_id', lot.id,
      'before', jsonb_build_object('for_sale', lot.for_sale, 'sale_price_cents', lot.sale_price_cents),
      'after', jsonb_build_object('for_sale', sale, 'sale_price_cents', price)));
  return target;
end;
$$;
revoke all on function public.inventory_set_lot_sale(uuid, boolean, bigint, integer) from public;
grant execute on function public.inventory_set_lot_sale(uuid, boolean, bigint, integer) to authenticated;

-- Em lote (020): "à venda" vale para os lotes da linha (material × divisão); cada lote mantém o seu preço.
do $$
declare
  def text := pg_get_functiondef('public.inventory_bulk(uuid,text,jsonb,jsonb,text)'::regprocedure);
  per_material constant text := 'if p_action in (''familia'', ''consumivel'', ''venda'') then';
  sale_branch constant text := 'if p_action = ''venda'' then
        -- Lojinha (020): só por quantidade; o preço de venda continua o do cadastro
        if material.tracking <> ''lot'' or material.for_sale = (p_args->>''value'')::boolean then continue; end if;
        perform public.inventory_set_material_sale(material.id, (p_args->>''value'')::boolean, material.sale_price_cents);
      elsif ';
  lot_loop constant text := 'for lot in select id, condition from public.inventory_lots
               where material_id = material.id and location_id = (target->>''location_id'')::uuid and quantity > 0 order by id loop
      if p_action = ''transferir'' then';
  unit_loop constant text := 'for unit in select id, condition from public.inventory_units';
begin
  if position(per_material in def) = 0 or position(sale_branch in def) = 0 or position(lot_loop in def) = 0 or position(unit_loop in def) = 0 then
    raise exception 'inventory_bulk mudou: revisar 021';
  end if;
  def := replace(def, per_material, 'if p_action in (''familia'', ''consumivel'') then');
  def := replace(def, sale_branch, 'if ');
  def := replace(def, lot_loop, 'for lot in select id, condition, for_sale, sale_price_cents from public.inventory_lots
               where material_id = material.id and location_id = (target->>''location_id'')::uuid and quantity > 0 order by id loop
      if p_action = ''venda'' then
        -- Lojinha (021): cada lote da linha, com o preço que já tem
        if lot.for_sale = (p_args->>''value'')::boolean then continue; end if;
        perform public.inventory_set_lot_sale(lot.id, (p_args->>''value'')::boolean, lot.sale_price_cents, null);
      elsif p_action = ''transferir'' then');
  -- peças não vão à venda: a ação passa direto por elas
  def := replace(def, unit_loop, 'if p_action = ''venda'' then continue; end if;
    ' || unit_loop);
  execute def;
end;
$$;

-- Visões: "à venda" derivado dos lotes com saldo --------------------------------------------------------------------

create or replace view public.inventory_material_rows with (security_invoker = true) as
 SELECT m.id,
    m.group_id,
    m.name,
    m.tracking,
    m.consumable,
    m.minimum_quantity,
    m.description,
    m.active,
    m.family_id,
    f.name AS family_name,
    f.code AS family_code,
        CASE
            WHEN (m.tracking = 'lot'::inventory_tracking) THEN COALESCE(l.quantity, 0)
            ELSE COALESCE(u.quantity, 0)
        END AS quantity,
    COALESCE(l.lots, 0) AS lots,
    (COALESCE(l.value_cents, (0)::bigint) + COALESCE(u.value_cents, (0)::bigint)) AS estimated_value_cents,
    l.next_expiry,
    ((m.minimum_quantity IS NOT NULL) AND ((COALESCE(l.quantity, 0) + COALESCE(u.quantity, 0)) < m.minimum_quantity)) AS below_minimum,
    m.updated_at,
    inventory_search_normalize(concat_ws(' '::text, m.name, m.description, f.name, f.code, l.search_text, u.search_text)) AS search_text,
    COALESCE(l.for_sale, false) AS for_sale,
    l.sale_price_cents
   FROM (((inventory_materials m
     LEFT JOIN inventory_families f ON ((f.id = m.family_id)))
     LEFT JOIN LATERAL ( SELECT (sum(inventory_lots.quantity))::integer AS quantity,
            (count(*) FILTER (WHERE (inventory_lots.quantity > 0)))::integer AS lots,
            (sum((inventory_lots.quantity * COALESCE(inventory_lots.unit_value_cents, (0)::bigint))))::bigint AS value_cents,
            min(inventory_lots.expires_on) FILTER (WHERE (inventory_lots.quantity > 0)) AS next_expiry,
            string_agg(concat_ws(' '::text, inventory_lots.notes, inventory_lots.supplier), ' '::text) FILTER (WHERE (inventory_lots.quantity > 0)) AS search_text,
            bool_or(inventory_lots.for_sale) FILTER (WHERE (inventory_lots.quantity > 0)) AS for_sale,
            min(inventory_lots.sale_price_cents) FILTER (WHERE (inventory_lots.for_sale AND (inventory_lots.quantity > 0))) AS sale_price_cents
           FROM inventory_lots
          WHERE (inventory_lots.material_id = m.id)) l ON (true))
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS quantity,
            (sum(COALESCE(inventory_units.unit_value_cents, (0)::bigint)))::bigint AS value_cents,
            string_agg(concat_ws(' '::text, inventory_units.tag, inventory_units.legacy_code, inventory_units.description, inventory_units.notes), ' '::text) AS search_text
           FROM inventory_units
          WHERE ((inventory_units.material_id = m.id) AND (inventory_units.written_off_at IS NULL))) u ON (true));

create or replace view public.inventory_stock_by_location with (security_invoker = true) as
 WITH stock AS (
         SELECT inventory_lots.group_id,
            inventory_lots.material_id,
            inventory_lots.location_id,
            inventory_lots.quantity,
            (inventory_lots.quantity * COALESCE(inventory_lots.unit_value_cents, (0)::bigint)) AS value_cents,
            inventory_lots.expires_on,
            inventory_lots.condition,
            inventory_lots.unit_value_cents,
            inventory_lots.for_sale,
            inventory_lots.sale_price_cents
           FROM inventory_lots
          WHERE (inventory_lots.quantity > 0)
        UNION ALL
         SELECT inventory_units.group_id,
            inventory_units.material_id,
            inventory_units.location_id,
            1,
            COALESCE(inventory_units.unit_value_cents, (0)::bigint) AS "coalesce",
            NULL::date AS date,
            inventory_units.condition,
            inventory_units.unit_value_cents,
            false,
            NULL::bigint
           FROM inventory_units
          WHERE (inventory_units.written_off_at IS NULL)
        ), by_condition AS (
         SELECT c_1.group_id,
            c_1.material_id,
            c_1.location_id,
            jsonb_object_agg(c_1.condition, c_1.quantity) AS conditions
           FROM ( SELECT stock.group_id,
                    stock.material_id,
                    stock.location_id,
                    stock.condition,
                    (sum(stock.quantity))::integer AS quantity
                   FROM stock
                  WHERE (stock.condition IS NOT NULL)
                  GROUP BY stock.group_id, stock.material_id, stock.location_id, stock.condition) c_1
          GROUP BY c_1.group_id, c_1.material_id, c_1.location_id
        )
 SELECT s.group_id,
    s.material_id,
    s.location_id,
    (sum(s.quantity))::integer AS quantity,
    (sum(s.value_cents))::bigint AS value_cents,
    min(s.expires_on) AS next_expiry,
    (array_agg(s.condition ORDER BY (inventory_condition_rank(s.condition)) DESC NULLS LAST))[1] AS worst_condition,
    COALESCE(c.conditions, '{}'::jsonb) AS conditions,
    min(s.unit_value_cents) AS min_unit_cents,
    max(s.unit_value_cents) AS max_unit_cents,
    (sum(s.quantity) FILTER (WHERE s.for_sale))::integer AS sale_quantity,
    min(s.sale_price_cents) FILTER (WHERE s.for_sale) AS min_sale_cents,
    max(s.sale_price_cents) FILTER (WHERE s.for_sale) AS max_sale_cents
   FROM (stock s
     LEFT JOIN by_condition c USING (group_id, material_id, location_id))
  GROUP BY s.group_id, s.material_id, s.location_id, c.conditions;

-- Sem marca no material ----------------------------------------------------------------------------------------------

drop function public.inventory_set_material_sale(uuid, boolean, bigint);
alter table public.inventory_materials drop constraint inventory_materials_for_sale_lot, drop column for_sale, drop column sale_price_cents;

-- Itens vendidos por lote -------------------------------------------------------------------------------------------

alter table public.entry_sale_items add column lot_id uuid references public.inventory_lots(id);
-- Vendas já gravadas (019): o lote de onde a venda saiu primeiro (ou um lote do material).
update public.entry_sale_items i set lot_id = coalesce(
  (select d.lot_id from public.entry_sale_draws d where d.entry_id = i.entry_id and d.material_id = i.material_id order by d.id limit 1),
  (select l.id from public.inventory_lots l where l.material_id = i.material_id order by l.quantity desc, l.created_at limit 1));
alter table public.entry_sale_items alter column lot_id set not null;
create index entry_sale_items_lot on public.entry_sale_items(lot_id);

drop function public.finance_sale_materials(uuid);

/**
 * Lotes que o formulário do lançamento oferece: os à venda com saldo e os já vendidos em algum lançamento (para editar
 * os antigos), com material, variação, divisão, condição, validade e preço. Para quem lê o Financeiro.
 */
create function public.finance_sale_lots(p_group_id uuid)
  returns table(id uuid, material_id uuid, material_name text, variant text, location_path text, condition public.inventory_condition,
    expires_on date, for_sale boolean, sale_price_cents bigint, quantity integer)
  language sql stable security definer set search_path to '' as $$
  select l.id, l.material_id, m.name, l.variant, p.path, l.condition, l.expires_on, l.for_sale, l.sale_price_cents, l.quantity
  from public.inventory_lots l
  join public.inventory_materials m on m.id = l.material_id
  left join public.inventory_location_paths p on p.id = l.location_id
  where l.group_id = p_group_id and public.can_read_finance(p_group_id)
    and ((l.for_sale and l.quantity > 0) or exists (select 1 from public.entry_sale_items i where i.lot_id = l.id))
  order by m.name, l.variant nulls first, p.path, l.sale_price_cents;
$$;
revoke all on function public.finance_sale_lots(uuid) from public;
grant execute on function public.finance_sale_lots(uuid) to authenticated;

-- Rateios: itens = [{lot_id, quantity, unit_price_cents}].
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
  item_lot public.inventory_lots;
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
        item_lot := null;
        select * into item_lot from public.inventory_lots l
        where l.id = nullif(item->>'lot_id', '')::uuid and l.group_id = p_group_id
          and (l.for_sale or exists (select 1 from public.entry_sale_draws d where d.entry_id = p_entry_id and d.lot_id = l.id));
        if item_lot.id is null then raise exception 'Lote à venda inválido'; end if;
        item_quantity := (item->>'quantity')::integer;
        item_price := (item->>'unit_price_cents')::bigint;
        if item_quantity is null or item_quantity <= 0 then raise exception 'Informe a quantidade de cada item vendido'; end if;
        if item_price is null or item_price < 0 then raise exception 'Informe o preço de cada item vendido'; end if;
        insert into public.entry_sale_items(group_id, entry_id, split_id, material_id, lot_id, quantity, unit_price_cents, position)
        values (p_group_id, p_entry_id, split_id, item_lot.material_id, item_lot.id, item_quantity, item_price, item_position);
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

/**
 * Acerta o estoque com os itens vendidos, lote a lote: baixa no lote vendido o que passou a ser vendido e devolve a ele o
 * que deixou de ser. Sem itens, devolve tudo. Só pelas funções de lançamento (sem grant).
 */
create or replace function public.sync_entry_sales(p_entry_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare
  entry public.ledger_entries;
  r record;
  lot public.inventory_lots;
  material_name text;
  previous_channel text := coalesce(current_setting('inventory.channel', true), '');
begin
  select * into entry from public.ledger_entries where id = p_entry_id;
  if entry.id is null then return; end if;
  perform set_config('inventory.channel', 'financeiro', true);
  -- Vendas antigas (019) baixavam do lote que vencia antes: as tiragens em outros lotes voltam e saem do lote do item.
  for r in
    with sold as (select lot_id, sum(quantity)::int as q from public.entry_sale_items where entry_id = p_entry_id group by lot_id),
      drawn as (select lot_id, sum(quantity)::int as q from public.entry_sale_draws where entry_id = p_entry_id group by lot_id)
    select coalesce(so.lot_id, dn.lot_id) as lot_id, coalesce(so.q, 0) as sold, coalesce(dn.q, 0) as drawn
    from sold so full join drawn dn on dn.lot_id = so.lot_id
    order by (coalesce(dn.q, 0) > coalesce(so.q, 0)) desc, 1  -- devoluções antes das baixas
  loop
    continue when r.sold = r.drawn;
    select * into lot from public.inventory_lots where id = r.lot_id for update;
    if r.drawn > r.sold then
      update public.inventory_lots set quantity = quantity + (r.drawn - r.sold), updated_at = now() where id = lot.id;
      perform public.inventory_log(entry.group_id, 'entrada', lot.material_id, lot.id, null, r.drawn - r.sold, null, lot.location_id, null, null, null,
        'Devolução da venda: ' || entry.name,
        jsonb_build_object('sale_return', true, 'entry_id', p_entry_id, 'from', lot.quantity, 'to', lot.quantity + r.drawn - r.sold));
    else
      if lot.quantity < r.sold - r.drawn then
        select name into material_name from public.inventory_materials where id = lot.material_id;
        raise exception 'Estoque insuficiente de %: faltam % (há % no lote)', material_name || coalesce(' · ' || lot.variant, ''),
          r.sold - r.drawn - lot.quantity, lot.quantity;
      end if;
      update public.inventory_lots set quantity = quantity - (r.sold - r.drawn), updated_at = now() where id = lot.id;
      perform public.inventory_log(entry.group_id, 'baixa', lot.material_id, lot.id, null, r.sold - r.drawn, lot.location_id, null, null, null, 'venda',
        'Venda: ' || entry.name, jsonb_build_object('entry_id', p_entry_id, 'from', lot.quantity, 'to', lot.quantity - (r.sold - r.drawn)));
    end if;
    delete from public.entry_sale_draws where entry_id = p_entry_id and lot_id = r.lot_id;
    if r.sold > 0 then
      insert into public.entry_sale_draws(group_id, entry_id, material_id, lot_id, quantity) values (entry.group_id, p_entry_id, lot.material_id, lot.id, r.sold);
    end if;
  end loop;
  perform set_config('inventory.channel', previous_channel, true);
end;
$$;
