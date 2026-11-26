-- 024 — Conta a receber por associado: tudo o que ele deve são linhas (`debts`, uma rubrica cada), pagas por rateios
-- ligados (023), com pagamento parcial livre.
--
-- * O acordo passa da linha para a conta (`debt_accounts`, `set_debt_agreement`); `debts.agreement` sai.
-- * Linhas de dívida no lançamento: `p_splits` aceita `{"kind":"divida", category_id, description, associate_id,
--   amount_cents, debt_id?}`, que não entram no caixa (nem no total): criam ou atualizam linhas com `origin_entry_id`.
--   Substituem o `due_cents` (023). Itens vendidos = rateio + linhas de dívida do lançamento na mesma rubrica e associado.
-- * Só dívida (nada entrou): `create_debt_lines` (formulário com total zero e "Nova dívida" de Devedores), com itens
--   vendidos opcionais; substitui `create_sale_debt` (022).
-- * Editar uma linha: `update_debt_line` (substitui `save_debt`).

-- Conta (acordo) ------------------------------------------------------------------------------------------------------

create table public.debt_accounts (
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  agreement text check (char_length(agreement) <= 300),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (associate_id)
);
alter table public.debt_accounts enable row level security;
create policy "editors read debt accounts" on public.debt_accounts for select using (public.can_edit_group(group_id));
grant select on public.debt_accounts to authenticated;

insert into public.debt_accounts(group_id, associate_id, agreement)
select distinct on (associate_id) group_id, associate_id, agreement from public.debts where agreement is not null order by associate_id, updated_at desc;

/** Acordo de pagamento da conta do associado (Editor); vazio apaga. */
create function public.set_debt_agreement(p_group_id uuid, p_associate_id uuid, p_agreement text) returns void
  language plpgsql security definer set search_path to '' as $$
declare clean text := nullif(trim(p_agreement), ''); before text;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para anotar dívidas'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id) then raise exception 'Associado não encontrado'; end if;
  if char_length(clean) > 300 then raise exception 'Acordo: no máximo 300 caracteres'; end if;
  select agreement into before from public.debt_accounts where associate_id = p_associate_id;
  insert into public.debt_accounts(group_id, associate_id, agreement, updated_by) values (p_group_id, p_associate_id, clean, auth.uid())
  on conflict (associate_id) do update set agreement = excluded.agreement, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'debt_account.updated', 'associate', p_associate_id::text, jsonb_build_object('before', before, 'after', clean));
end;
$$;
revoke all on function public.set_debt_agreement(uuid, uuid, text) from public;
grant execute on function public.set_debt_agreement(uuid, uuid, text) to authenticated;

drop function public.save_debt(uuid, uuid, uuid, date, bigint, uuid, text, text);
drop function public.create_sale_debt(uuid, uuid, date, uuid, text, text, jsonb);
drop function public.debt_rows(uuid);

create or replace function public.debt_snapshot(p_id uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('associate_id', d.associate_id, 'debt_date', d.debt_date, 'amount_cents', d.amount_cents,
    'description', d.description, 'category_id', d.category_id, 'origin', d.origin,
    'origin_entry_id', d.origin_entry_id, 'fee_record_id', d.fee_record_id,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('split_id', s.id, 'entry_id', s.entry_id, 'amount_cents', s.amount_cents) order by s.id)
      from public.entry_splits s where s.debt_id = d.id), '[]'::jsonb))
  from public.debts d where d.id = p_id;
$$;

alter table public.debts drop column agreement;

-- Linhas: criar sem lançamento (nada entrou), editar ---------------------------------------------------------------------

/**
 * Lança linhas na conta de associados sem lançamento no caixa (nada entrou agora): cada linha
 * `{associate_id, category_id, description, amount_cents | items: [{lot_id, quantity, unit_price_cents}]}`. Com itens,
 * a rubrica tem de vender itens, o valor é a soma deles e o estoque baixa na hora. Quem lança no Financeiro.
 */
create function public.create_debt_lines(p_group_id uuid, p_debt_date date, p_lines jsonb) returns uuid[]
  language plpgsql security definer set search_path to '' as $$
declare
  line jsonb;
  item jsonb;
  item_lot public.inventory_lots;
  line_id uuid;
  line_associate uuid;
  line_category uuid;
  line_description text;
  line_amount bigint;
  has_items boolean;
  total bigint;
  position_ integer;
  result uuid[] := '{}';
begin
  if not public.can_write_finance(p_group_id) then raise exception 'Sem permissão para lançar no Financeiro'; end if;
  if p_debt_date is null then raise exception 'Informe a data'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Informe ao menos uma linha de dívida'; end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    line_associate := nullif(line->>'associate_id', '')::uuid;
    line_category := nullif(line->>'category_id', '')::uuid;
    line_description := nullif(trim(line->>'description'), '');
    has_items := jsonb_typeof(line->'items') = 'array' and jsonb_array_length(line->'items') > 0;
    if not exists (select 1 from public.associates where id = line_associate and group_id = p_group_id and active) then
      raise exception 'Escolha o associado de cada linha de dívida';
    end if;
    if not exists (select 1 from public.categories where id = line_category and group_id = p_group_id and active and kind = 'receita') then
      raise exception 'Escolha a rubrica de receita de cada linha de dívida';
    end if;
    if line_description is null or char_length(line_description) not between 2 and 200 then raise exception 'Descrição: de 2 a 200 caracteres'; end if;
    if has_items and not public.category_sells_items(line_category) then raise exception 'A rubrica da linha “%” não vende itens do inventário', line_description; end if;
    line_amount := coalesce(nullif(line->>'amount_cents', '')::bigint, 0);
    if not has_items and line_amount <= 0 then raise exception 'Informe o valor da linha “%”', line_description; end if;

    perform 1 from public.debts where associate_id = line_associate for update;
    insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, category_id, origin, created_by, updated_by)
    values (p_group_id, line_associate, p_debt_date, greatest(line_amount, 1), line_description, line_category,
      case when has_items then 'venda'::public.debt_origin else 'manual' end, auth.uid(), auth.uid())
    returning id into line_id;
    if has_items then
      total := 0;
      position_ := 0;
      for item in select value from jsonb_array_elements(line->'items') loop
        item_lot := null;
        select * into item_lot from public.inventory_lots where id = nullif(item->>'lot_id', '')::uuid and group_id = p_group_id and for_sale;
        if item_lot.id is null then raise exception 'Lote à venda inválido'; end if;
        if coalesce((item->>'quantity')::integer, 0) <= 0 then raise exception 'Informe a quantidade de cada item vendido'; end if;
        if (item->>'unit_price_cents')::bigint is null or (item->>'unit_price_cents')::bigint < 0 then raise exception 'Informe o preço de cada item vendido'; end if;
        insert into public.entry_sale_items(group_id, debt_id, material_id, lot_id, quantity, unit_price_cents, position)
        values (p_group_id, line_id, item_lot.material_id, item_lot.id, (item->>'quantity')::integer, (item->>'unit_price_cents')::bigint, position_);
        total := total + (item->>'quantity')::integer * (item->>'unit_price_cents')::bigint;
        position_ := position_ + 1;
      end loop;
      if total <= 0 then raise exception 'A venda precisa de valor maior que zero'; end if;
      update public.debts set amount_cents = total where id = line_id;
      perform public.sync_sales(null, line_id);
    end if;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'debt.created', 'debt', line_id::text, jsonb_build_object('after', public.debt_snapshot(line_id)));
    result := result || line_id;
  end loop;
  return result;
end;
$$;
revoke all on function public.create_debt_lines(uuid, date, jsonb) from public;
grant execute on function public.create_debt_lines(uuid, date, jsonb) to authenticated;

/**
 * Edita uma linha (Editor): data, valor, rubrica e descrição. Linha de venda ou de mensalidade tem valor e rubrica da
 * origem; com pagamento, a rubrica não muda; o valor não fica abaixo do pago.
 */
create function public.update_debt_line(p_id uuid, p_debt_date date, p_amount_cents bigint, p_category_id uuid, p_description text) returns void
  language plpgsql security definer set search_path to '' as $$
declare old public.debts; before_state jsonb; clean_description text := nullif(trim(p_description), '');
begin
  select * into old from public.debts where id = p_id for update;
  if old.id is null or not public.can_edit_group(old.group_id) then raise exception 'Dívida não encontrada ou sem permissão'; end if;
  if p_debt_date is null then raise exception 'Informe a data da dívida'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if not exists (select 1 from public.categories where id = p_category_id and group_id = old.group_id and kind = 'receita') then
    raise exception 'Escolha a rubrica de receita da dívida';
  end if;
  if clean_description is null or char_length(clean_description) not between 2 and 200 then raise exception 'Descrição: de 2 a 200 caracteres'; end if;
  if (old.fee_record_id is not null or old.origin = 'venda') and (old.amount_cents <> p_amount_cents or old.category_id <> p_category_id) then
    raise exception 'Dívida de %: valor e rubrica vêm da origem', case when old.fee_record_id is not null then 'mensalidade' else 'venda' end;
  end if;
  if old.category_id <> p_category_id and exists (select 1 from public.entry_splits where debt_id = p_id) then
    raise exception 'A dívida já tem pagamento: a rubrica não muda';
  end if;
  if p_amount_cents < public.debt_paid_cents(p_id) then raise exception 'O valor não pode ficar abaixo do que já foi pago'; end if;
  before_state := public.debt_snapshot(p_id);
  update public.debts set debt_date = p_debt_date, amount_cents = p_amount_cents, category_id = p_category_id, description = clean_description,
    updated_by = auth.uid(), updated_at = now()
  where id = p_id;
  perform public.debt_settle_fee(p_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (old.group_id, auth.uid(), 'debt.updated', 'debt', p_id::text, jsonb_build_object('before', before_state, 'after', public.debt_snapshot(p_id)));
end;
$$;
revoke all on function public.update_debt_line(uuid, date, bigint, uuid, text) from public;
grant execute on function public.update_debt_line(uuid, date, bigint, uuid, text) to authenticated;

-- Lançamento: linhas de dívida fora do caixa ---------------------------------------------------------------------------

create or replace function public.validate_entry_totals(p_total_cents bigint, p_splits jsonb) returns void
  language plpgsql immutable set search_path to '' as $$
declare split_total bigint;
begin
  if p_total_cents = 0 then raise exception 'O total não pode ser zero'; end if;
  if jsonb_typeof(p_splits) <> 'array'
    or not exists (select 1 from jsonb_array_elements(p_splits) where coalesce(value->>'kind', 'rateio') <> 'divida') then
    raise exception 'Informe ao menos uma rubrica';
  end if;
  if exists (select 1 from jsonb_array_elements(p_splits) where coalesce(value->>'kind', 'rateio') <> 'divida'
      and coalesce((value->>'amount_cents')::bigint, 0) = 0) then
    raise exception 'O valor de cada rubrica não pode ser zero';
  end if;
  select coalesce(sum((value->>'amount_cents')::bigint), 0) into split_total from jsonb_array_elements(p_splits)
  where coalesce(value->>'kind', 'rateio') <> 'divida';
  if split_total <> p_total_cents then raise exception 'A soma das rubricas deve ser igual ao total'; end if;
end;
$$;

create or replace function public.write_entry_splits(p_entry_id uuid, p_group_id uuid, p_splits jsonb, p_previous_splits jsonb default '[]'::jsonb)
  returns void language plpgsql security definer set search_path to '' as $$
declare
  split jsonb;
  item jsonb;
  split_id uuid;
  split_category uuid;
  split_associate uuid;
  split_amount bigint;
  split_debt uuid;
  category_kind public.category_kind;
  item_lot public.inventory_lots;
  item_quantity integer;
  item_price bigint;
  items_total bigint;
  item_position integer;
  has_items boolean;
  entry_date date;
  line public.debts;
  kept uuid[];
begin
  select e.entry_date into entry_date from public.ledger_entries e where e.id = p_entry_id;

  -- 1. Linhas de dívida do lançamento (fora do caixa): as que saíram do formulário somem (sem pagamento); as outras são
  --    atualizadas ou criadas. Vêm antes dos rateios para a conferência dos itens vendidos.
  select coalesce(array_agg(nullif(value->>'debt_id', '')::uuid) filter (where nullif(value->>'debt_id', '') is not null), '{}') into kept
  from jsonb_array_elements(p_splits) where value->>'kind' = 'divida';
  for line in select * from public.debts where origin_entry_id = p_entry_id and not (id = any(kept)) loop
    if exists (select 1 from public.entry_splits where debt_id = line.id) then
      raise exception 'A dívida “%” deste lançamento já tem pagamento: não sai', line.description;
    end if;
    delete from public.debts where id = line.id;
  end loop;
  for split in select value from jsonb_array_elements(p_splits) where value->>'kind' = 'divida' loop
    split_category := nullif(split->>'category_id', '')::uuid;
    split_associate := nullif(split->>'associate_id', '')::uuid;
    split_amount := coalesce(nullif(split->>'amount_cents', '')::bigint, 0);
    split_debt := nullif(split->>'debt_id', '')::uuid;
    if not exists (select 1 from public.categories c where c.id = split_category and c.group_id = p_group_id and c.kind = 'receita') then
      raise exception 'A linha de dívida precisa de uma rubrica de receita';
    end if;
    if split_associate is null or not exists (select 1 from public.associates a where a.id = split_associate and a.group_id = p_group_id) then
      raise exception 'A linha de dívida precisa do associado que fica devendo';
    end if;
    if split_amount <= 0 then raise exception 'Informe o valor de cada linha de dívida'; end if;
    if char_length(trim(coalesce(split->>'description', ''))) not between 2 and 200 then raise exception 'Descreva cada linha de dívida'; end if;
    if split_debt is null then
      insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, category_id, origin, origin_entry_id, created_by, updated_by)
      values (p_group_id, split_associate, entry_date, split_amount, trim(split->>'description'), split_category, 'lancamento', p_entry_id, auth.uid(), auth.uid());
    else
      select * into line from public.debts where id = split_debt and origin_entry_id = p_entry_id for update;
      if line.id is null then raise exception 'Linha de dívida não encontrada neste lançamento'; end if;
      if (line.category_id <> split_category or line.associate_id <> split_associate) and exists (select 1 from public.entry_splits where debt_id = line.id) then
        raise exception 'A dívida “%” já tem pagamento: rubrica e associado não mudam', line.description;
      end if;
      if split_amount < public.debt_paid_cents(line.id) then raise exception 'A dívida “%” não pode ficar abaixo do que já foi pago', line.description; end if;
      update public.debts set category_id = split_category, associate_id = split_associate, amount_cents = split_amount,
        description = trim(split->>'description'), debt_date = entry_date, updated_by = auth.uid(), updated_at = now()
      where id = line.id;
    end if;
  end loop;

  -- 2. Rateios do caixa.
  for split in select value from jsonb_array_elements(p_splits) where coalesce(value->>'kind', 'rateio') <> 'divida'
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

    split_debt := nullif(split->>'debt_id', '')::uuid;
    has_items := jsonb_typeof(split->'items') = 'array' and jsonb_array_length(split->'items') > 0;
    if split_debt is not null and has_items then raise exception 'Rateio que paga dívida não tem itens vendidos (já saíram na venda)'; end if;

    insert into public.entry_splits (entry_id, category_id, amount_cents, description, associate_id, debt_id)
    values (p_entry_id, split_category, split_amount, trim(split->>'description'), split_associate, split_debt)
    returning id into split_id;

    if has_items then
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
      if items_total <> split_amount + coalesce((select sum(d.amount_cents) from public.debts d where d.origin_entry_id = p_entry_id
          and d.category_id = split_category and d.associate_id is not distinct from split_associate), 0) then
        raise exception 'A soma dos itens vendidos não confere com o valor do rateio “%” (mais as linhas de dívida da mesma rubrica)', trim(split->>'description');
      end if;
    end if;
  end loop;

  -- 3. Origem das linhas: venda quando o rateio da mesma rubrica e associado tem itens.
  update public.debts d set origin = case when exists (
      select 1 from public.entry_splits s join public.entry_sale_items i on i.split_id = s.id
      where s.entry_id = p_entry_id and s.category_id = d.category_id and s.associate_id = d.associate_id)
    then 'venda'::public.debt_origin else 'lancamento' end
  where d.origin_entry_id = p_entry_id;
end;
$$;

-- Leitura de Devedores --------------------------------------------------------------------------------------------------

create function public.debt_rows(p_group_id uuid)
  returns table(id uuid, debt_date date, amount_cents bigint, paid_cents bigint, description text, agreement text, associate_id uuid,
    associate_name text, debtor_number integer, payments jsonb, category_id uuid, category_label text, origin public.debt_origin,
    origin_entry_id uuid, fee_year integer, fee_month integer, updated_at timestamptz)
  language sql stable security definer set search_path to '' as $$
  with access as (select public.can_read_finance(p_group_id) as member, public.can_edit_group(p_group_id) as editor),
  debtors as (
    select associate_id, dense_rank() over (order by min(created_at), min(debt_date), associate_id)::integer as debtor_number
    from public.debts where group_id = p_group_id group by associate_id
  )
  select d.id, d.debt_date, d.amount_cents, public.debt_paid_cents(d.id), d.description, acc.agreement,
    case when access.editor then d.associate_id end,
    case when access.editor then a.name end,
    debtors.debtor_number,
    case when access.editor then coalesce((
      select jsonb_agg(jsonb_build_object('entryId', e.id, 'entryDate', e.entry_date, 'entryName', e.name, 'splitId', s.id, 'amountCents', s.amount_cents)
        order by e.entry_date, e.id)
      from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id where s.debt_id = d.id), '[]'::jsonb) end,
    d.category_id, concat_ws(' ', c.code, c.name), d.origin,
    case when access.editor then d.origin_entry_id end,
    r.year, r.month, d.updated_at
  from public.debts d
  cross join access
  join public.associates a on a.id = d.associate_id
  join debtors on debtors.associate_id = d.associate_id
  join public.categories c on c.id = d.category_id
  left join public.fee_records r on r.id = d.fee_record_id
  left join public.debt_accounts acc on acc.associate_id = d.associate_id
  where d.group_id = p_group_id and access.member
  order by d.debt_date desc, d.created_at desc;
$$;
revoke all on function public.debt_rows(uuid) from public;
grant execute on function public.debt_rows(uuid) to authenticated;

/**
 * Linhas de dívida geradas por um lançamento (024), para o formulário de edição: quem lê o Financeiro vê (o Colaborador
 * edita o lançamento sem ler `debts`, e sem elas salvar apagaria as linhas).
 */
create function public.entry_debt_lines(p_entry_id uuid)
  returns table(id uuid, category_id uuid, description text, associate_id uuid, amount_cents bigint, paid_cents bigint)
  language sql stable security definer set search_path to '' as $$
  select d.id, d.category_id, d.description, d.associate_id, d.amount_cents, public.debt_paid_cents(d.id)
  from public.debts d join public.ledger_entries e on e.id = d.origin_entry_id
  where d.origin_entry_id = p_entry_id and public.can_read_finance(e.group_id)
  order by d.created_at, d.id;
$$;
revoke all on function public.entry_debt_lines(uuid) from public;
grant execute on function public.entry_debt_lines(uuid) to authenticated;
