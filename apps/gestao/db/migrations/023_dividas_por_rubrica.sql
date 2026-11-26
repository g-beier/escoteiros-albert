-- 023 — Dívidas como "conta a receber por rubrica" do associado.
--
-- * Toda dívida diz do que é: rubrica de receita (`debts.category_id`, obrigatória) e origem (`debt_origin`: manual,
--   lançamento, venda, mensalidade).
-- * Só é paga por rateios ligados a ela (`entry_splits.debt_id`), na rubrica e no associado dela; nunca por rateios
--   avulsos. Sai o modelo de alocação por lançamento (038/039: `debt_payments`, `pay_debts`, `check_debt_allocations`,
--   `debt_payment_cents`) e o `receive_debt` (022): "Receber" é um lançamento com o rateio já ligado.
-- * Lançamento novo: `due_cents` num rateio de receita com associado vira dívida da diferença (o rateio fica com o que
--   entrou); itens vendidos = rateio + dívidas que o lançamento gerou na mesma rubrica e associado.
-- * Mensalidade: "Não pago" cria a dívida do mês (rubrica de mensalidade, valor do mês); quitada pelos rateios ligados,
--   o mês vira Pago ligado a eles (e volta a Não pago se o pagamento sai).
-- Não havia dívidas: as colunas novas já nascem obrigatórias.

create type public.debt_origin as enum ('manual', 'lancamento', 'venda', 'mensalidade');

-- Fora o modelo de alocação ---------------------------------------------------------------------------------------------

drop function public.pay_debts(uuid, uuid, uuid, jsonb);
drop function public.check_debt_allocations(uuid, uuid[], uuid[]);
drop function public.receive_debt(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid, text);
drop function public.debt_rows(uuid);
drop function public.save_debt(uuid, uuid, uuid, date, bigint, text, text, jsonb);

do $$
declare
  merge_def text := pg_get_functiondef('public.merge_ledger_entries(uuid,uuid[],jsonb)'::regprocedure);
  merge_marker constant text := '  insert into public.debt_payments(debt_id, entry_id, amount_cents)
    select debt_id, target_id, sum(amount_cents) from public.debt_payments where entry_id = any(entry_ids) group by debt_id
    on conflict (debt_id, entry_id) do update set amount_cents = excluded.amount_cents;
  delete from public.debt_payments where entry_id = any(sources);
';
  split_def text := pg_get_functiondef('public.split_ledger_entry_splits(uuid,uuid[])'::regprocedure);
  split_marker constant text := 'if exists (select 1 from public.debt_payments where entry_id = any(entry_ids)) then
    raise exception ''Há lançamento que paga dívida: desagrupe-o no próprio lançamento'';';
  assoc_def text := pg_get_functiondef('public.set_splits_associate(uuid,uuid[],uuid)'::regprocedure);
  assoc_marker constant text := 'if exists (select 1 from public.entry_splits s join public.debt_payments p on p.entry_id = s.entry_id
             where s.id = any(ids) and s.associate_id is distinct from p_associate_id) then
    raise exception ''Há lançamentos que pagam dívidas: troque o associado no próprio lançamento'';';
  cat_def text := pg_get_functiondef('public.set_splits_category(uuid,uuid[],uuid)'::regprocedure);
  cat_marker constant text := 'if not (target.id = any(fees)) and exists';
begin
  if position(merge_marker in merge_def) = 0 or position(split_marker in split_def) = 0 or position(assoc_marker in assoc_def) = 0
    or position(cat_marker in cat_def) = 0 then
    raise exception 'merge/split/set_splits mudaram: revisar 023';
  end if;
  -- agrupar: os rateios (com a dívida que pagam) mudam de lançamento juntos; nada a copiar
  execute replace(merge_def, merge_marker, '');
  execute replace(split_def, split_marker, 'if exists (select 1 from public.entry_splits where entry_id = any(entry_ids) and debt_id is not null)
    or exists (select 1 from public.debts where origin_entry_id = any(entry_ids)) then
    raise exception ''Há lançamento que paga ou gerou dívida: desagrupe-o no próprio lançamento'';');
  execute replace(assoc_def, assoc_marker, 'if exists (select 1 from public.entry_splits s where s.id = any(ids) and s.debt_id is not null and s.associate_id is distinct from p_associate_id) then
    raise exception ''Há rateios que pagam dívidas: o associado deles é o da dívida'';');
  execute replace(cat_def, cat_marker, 'if exists (select 1 from public.entry_splits where id = any(ids) and debt_id is not null and category_id <> p_category_id) then
    raise exception ''Há rateios que pagam dívidas: a rubrica deles é a da dívida'';
  end if;
  ' || cat_marker);
end;
$$;

drop table public.debt_payments;
drop function public.debt_payment_cents(uuid, uuid);

-- Dívida: rubrica, origem, lançamento que gerou, mês da mensalidade ------------------------------------------------------

alter table public.debts
  alter column category_id set not null,
  add column origin public.debt_origin not null default 'manual',
  add column origin_entry_id uuid references public.ledger_entries(id) on delete set null,
  add column fee_record_id uuid unique references public.fee_records(id) on delete set null;
create index debts_origin_entry on public.debts(origin_entry_id);

alter table public.entry_splits add column debt_id uuid references public.debts(id);
create index entry_splits_debt on public.entry_splits(debt_id);

create or replace function public.debt_snapshot(p_id uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('associate_id', d.associate_id, 'debt_date', d.debt_date, 'amount_cents', d.amount_cents,
    'description', d.description, 'agreement', d.agreement, 'category_id', d.category_id, 'origin', d.origin,
    'origin_entry_id', d.origin_entry_id, 'fee_record_id', d.fee_record_id,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('split_id', s.id, 'entry_id', s.entry_id, 'amount_cents', s.amount_cents) order by s.id)
      from public.entry_splits s where s.debt_id = d.id), '[]'::jsonb))
  from public.debts d where d.id = p_id;
$$;

/** Quanto já foi pago da dívida (rateios ligados). */
create function public.debt_paid_cents(p_debt_id uuid) returns bigint
  language sql stable security definer set search_path to '' as $$
  select coalesce(sum(amount_cents), 0)::bigint from public.entry_splits where debt_id = p_debt_id;
$$;
revoke all on function public.debt_paid_cents(uuid) from public;
grant execute on function public.debt_paid_cents(uuid) to authenticated;

/** Mensalidade (023): dívida do mês quitada → mês Pago ligado aos rateios; senão volta a Não pago. Sem grant. */
create function public.debt_settle_fee(p_debt_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare debt public.debts; record_ public.fee_records;
begin
  select * into debt from public.debts where id = p_debt_id;
  if debt.fee_record_id is null then return; end if;
  select * into record_ from public.fee_records where id = debt.fee_record_id for update;
  if record_.id is null then return; end if;
  if public.debt_paid_cents(debt.id) >= debt.amount_cents then
    update public.fee_records set status = 'pago', updated_by = auth.uid(), updated_at = now() where id = record_.id;
    delete from public.fee_record_splits where fee_record_id = record_.id;
    insert into public.fee_record_splits(fee_record_id, split_id) select record_.id, id from public.entry_splits where debt_id = debt.id;
  elsif record_.status = 'pago' then
    update public.fee_records set status = 'nao_pago', updated_by = auth.uid(), updated_at = now() where id = record_.id;
    delete from public.fee_record_splits where fee_record_id = record_.id;
  end if;
end;
$$;
revoke all on function public.debt_settle_fee(uuid) from public;

/** Rateio que paga dívida: mesma rubrica e associado, entrada, sem passar do valor; acerta o mês da mensalidade. */
create function public.entry_split_debt_guard() returns trigger
  language plpgsql security definer set search_path to '' as $$
declare debt public.debts; entry_group uuid;
begin
  if tg_op <> 'DELETE' and new.debt_id is not null then
    select * into debt from public.debts where id = new.debt_id;
    select group_id into entry_group from public.ledger_entries where id = new.entry_id;
    if debt.id is null or debt.group_id <> entry_group then raise exception 'Dívida não encontrada'; end if;
    if new.category_id <> debt.category_id then raise exception 'O rateio que paga “%” tem de ser na rubrica da dívida', debt.description; end if;
    if new.associate_id is distinct from debt.associate_id then raise exception 'O rateio que paga “%” tem de ser do associado da dívida', debt.description; end if;
    if new.amount_cents <= 0 then raise exception 'O rateio que paga “%” tem de ser uma entrada', debt.description; end if;
    if public.debt_paid_cents(debt.id) > debt.amount_cents then
      raise exception 'O pagamento passa do que falta de “%” (R$ %)', debt.description,
        to_char((debt.amount_cents - (public.debt_paid_cents(debt.id) - new.amount_cents)) / 100.0, 'FM999G990D00');
    end if;
  end if;
  if tg_op <> 'INSERT' and old.debt_id is not null then perform public.debt_settle_fee(old.debt_id); end if;
  if tg_op <> 'DELETE' and new.debt_id is not null and (tg_op = 'INSERT' or new.debt_id is distinct from old.debt_id or new.amount_cents <> old.amount_cents) then
    perform public.debt_settle_fee(new.debt_id);
  end if;
  return null;
end;
$$;
create trigger entry_splits_debt_guard after insert or update of debt_id, amount_cents, category_id, associate_id or delete on public.entry_splits
  for each row execute function public.entry_split_debt_guard();

-- Rateios: `debt_id` (paga a dívida) e `due_cents` (só ao criar: a diferença vira dívida) --------------------------------

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
  split_due bigint;
  category_kind public.category_kind;
  item_lot public.inventory_lots;
  item_quantity integer;
  item_price bigint;
  items_total bigint;
  item_position integer;
  has_items boolean;
  entry_date date;
begin
  select e.entry_date into entry_date from public.ledger_entries e where e.id = p_entry_id;
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

    split_debt := nullif(split->>'debt_id', '')::uuid;
    split_due := coalesce(nullif(split->>'due_cents', '')::bigint, 0);
    has_items := jsonb_typeof(split->'items') = 'array' and jsonb_array_length(split->'items') > 0;
    if split_due < 0 then raise exception 'Valor a pagar inválido'; end if;
    if split_due > 0 then
      if jsonb_array_length(p_previous_splits) > 0 then raise exception 'A diferença só vira dívida ao criar o lançamento'; end if;
      if split_debt is not null then raise exception 'Um rateio que paga dívida não gera outra'; end if;
      if category_kind <> 'receita' or split_associate is null then raise exception 'A dívida da diferença precisa de rubrica de receita e associado'; end if;
    end if;
    if split_debt is not null and has_items then raise exception 'Rateio que paga dívida não tem itens vendidos (já saíram na venda)'; end if;

    insert into public.entry_splits (entry_id, category_id, amount_cents, description, associate_id, debt_id)
    values (p_entry_id, split_category, split_amount, trim(split->>'description'), split_associate, split_debt)
    returning id into split_id;

    if split_due > 0 then
      insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, category_id, origin, origin_entry_id, created_by, updated_by)
      values (p_group_id, split_associate, entry_date, split_due, trim(split->>'description'), split_category,
        case when has_items then 'venda'::public.debt_origin else 'lancamento' end, p_entry_id, auth.uid(), auth.uid());
    end if;

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
      -- o que ficou a pagar (dívidas que este lançamento gerou nesta rubrica e associado) também é parte da venda
      if items_total <> split_amount + coalesce((select sum(d.amount_cents) from public.debts d where d.origin_entry_id = p_entry_id
          and d.category_id = split_category and d.associate_id is not distinct from split_associate), 0) then
        raise exception 'A soma dos itens vendidos não confere com o valor do rateio “%” (mais o que ficou a pagar)', trim(split->>'description');
      end if;
    end if;
  end loop;
end;
$$;

-- Excluir lançamento: as dívidas que ele gerou saem junto, se ninguém pagou nada delas.
do $$
declare
  def text := pg_get_functiondef('public.delete_ledger_entry(uuid)'::regprocedure);
  marker constant text := '  -- itens vendidos voltam ao estoque (019)';
begin
  if position(marker in def) = 0 then raise exception 'delete_ledger_entry mudou: revisar 023'; end if;
  execute replace(def, marker, '  -- dívidas geradas pela diferença (023): saem junto se não tiverem pagamento
  if exists (select 1 from public.debts d join public.entry_splits s on s.debt_id = d.id where d.origin_entry_id = p_entry_id and s.entry_id <> p_entry_id) then
    raise exception ''Este lançamento gerou dívida que já tem pagamento: exclua ou troque os pagamentos antes'';
  end if;
  delete from public.debts where origin_entry_id = p_entry_id;
' || marker);
end;
$$;

-- Venda a pagar (022): origem "venda".
do $$
declare
  def text := pg_get_functiondef('public.create_sale_debt(uuid,uuid,date,uuid,text,text,jsonb)'::regprocedure);
  marker constant text := 'update public.debts set amount_cents = total where id = result;';
begin
  if position(marker in def) = 0 then raise exception 'create_sale_debt mudou: revisar 023'; end if;
  execute replace(def, marker, 'update public.debts set amount_cents = total, origin = ''venda'' where id = result;');
end;
$$;

-- Devedores: anotar / editar (manual) -----------------------------------------------------------------------------------

/**
 * Anota (sem `p_id`) ou edita uma dívida: associado, data, valor, rubrica de receita, descrição e acordo. Dívida de
 * venda (com itens) ou de mensalidade não muda valor, associado nem rubrica; o valor não fica abaixo do já pago.
 */
create function public.save_debt(p_group_id uuid, p_id uuid, p_associate_id uuid, p_debt_date date, p_amount_cents bigint, p_category_id uuid,
  p_description text, p_agreement text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare
  result uuid := p_id;
  old public.debts;
  before_state jsonb;
  clean_description text := nullif(trim(p_description), '');
  clean_agreement text := nullif(trim(p_agreement), '');
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para anotar dívidas'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id) then raise exception 'Associado não encontrado'; end if;
  if p_debt_date is null then raise exception 'Informe a data da dívida'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if not exists (select 1 from public.categories where id = p_category_id and group_id = p_group_id and kind = 'receita') then
    raise exception 'Escolha a rubrica de receita da dívida';
  end if;
  if clean_description is null or char_length(clean_description) not between 2 and 200 then raise exception 'Descrição: de 2 a 200 caracteres'; end if;
  if char_length(clean_agreement) > 300 then raise exception 'Acordo: no máximo 300 caracteres'; end if;

  if p_id is null then
    insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, agreement, category_id, origin, created_by, updated_by)
    values (p_group_id, p_associate_id, p_debt_date, p_amount_cents, clean_description, clean_agreement, p_category_id, 'manual', auth.uid(), auth.uid())
    returning id into result;
  else
    select * into old from public.debts where id = p_id and group_id = p_group_id for update;
    if old.id is null then raise exception 'Dívida não encontrada'; end if;
    if (old.fee_record_id is not null or exists (select 1 from public.entry_sale_items where debt_id = p_id))
      and (old.amount_cents <> p_amount_cents or old.associate_id <> p_associate_id or old.category_id <> p_category_id) then
      raise exception 'Dívida de % : valor, associado e rubrica vêm da origem', case when old.fee_record_id is not null then 'mensalidade' else 'venda' end;
    end if;
    if exists (select 1 from public.entry_splits where debt_id = p_id) and (old.associate_id <> p_associate_id or old.category_id <> p_category_id) then
      raise exception 'A dívida já tem pagamento: associado e rubrica não mudam';
    end if;
    if p_amount_cents < public.debt_paid_cents(p_id) then raise exception 'O valor não pode ficar abaixo do que já foi pago'; end if;
    before_state := public.debt_snapshot(p_id);
    update public.debts set associate_id = p_associate_id, debt_date = p_debt_date, amount_cents = p_amount_cents, category_id = p_category_id,
      description = clean_description, agreement = clean_agreement, updated_by = auth.uid(), updated_at = now()
    where id = p_id;
    perform public.debt_settle_fee(p_id);
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'debt.created' else 'debt.updated' end, 'debt', result::text,
    jsonb_build_object('before', before_state, 'after', public.debt_snapshot(result)));
  return result;
end;
$$;
revoke all on function public.save_debt(uuid, uuid, uuid, date, bigint, uuid, text, text) from public;
grant execute on function public.save_debt(uuid, uuid, uuid, date, bigint, uuid, text, text) to authenticated;

-- Excluir: não com pagamento; mensalidade se desfaz na grade.
do $$
declare
  def text := pg_get_functiondef('public.delete_debt(uuid)'::regprocedure);
  marker constant text := 'before_state := public.debt_snapshot(p_id);';
begin
  if position(marker in def) = 0 then raise exception 'delete_debt mudou: revisar 023'; end if;
  execute replace(def, marker, 'if exists (select 1 from public.entry_splits where debt_id = p_id) then
    raise exception ''A dívida tem pagamento: exclua ou troque os rateios que a pagam antes'';
  end if;
  if exists (select 1 from public.debts where id = p_id and fee_record_id is not null) then
    raise exception ''Dívida de mensalidade: mude o mês na grade de Mensalidades'';
  end if;
  ' || marker);
end;
$$;

-- Leitura de Devedores ----------------------------------------------------------------------------------------------

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
  select d.id, d.debt_date, d.amount_cents, public.debt_paid_cents(d.id), d.description, d.agreement,
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
  where d.group_id = p_group_id and access.member
  order by d.debt_date desc, d.created_at desc;
$$;
revoke all on function public.debt_rows(uuid) from public;
grant execute on function public.debt_rows(uuid) to authenticated;

-- Mensalidade: "Não pago" cria a dívida do mês --------------------------------------------------------------------------

create or replace function public.set_fee_record(p_associate_id uuid, p_year integer, p_month integer, p_status public.fee_status, p_note text, p_split_ids uuid[])
  returns void language plpgsql security definer set search_path to '' as $$
declare
  associate_group uuid;
  record_id uuid;
  before_state jsonb;
  categories uuid[];
  debt public.debts;
  fee_category uuid;
  month_cents bigint;
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_month not between 3 and 12 then raise exception 'Mês inválido (março a dezembro)'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if char_length(p_note) > 200 then raise exception 'Nota: no máximo 200 caracteres'; end if;

  select id into record_id from public.fee_records where associate_id = p_associate_id and year = p_year and month = p_month for update;
  before_state := case when record_id is null then null else public.fee_record_snapshot(record_id) end;
  if record_id is not null then select * into debt from public.debts where fee_record_id = record_id for update; end if;

  -- Dívida do mês (023): com pagamento, só pode continuar Não pago ou Pago; sem pagamento, sai ao deixar Não pago.
  if debt.id is not null and coalesce(p_status::text, '') <> 'nao_pago' then
    if exists (select 1 from public.entry_splits where debt_id = debt.id) then
      if p_status is distinct from 'pago' then
        raise exception 'Este mês tem dívida com pagamento: exclua ou troque o rateio que a paga antes de mudar';
      end if;
    else
      delete from public.debts where id = debt.id;
      debt := null;
    end if;
  end if;

  if p_status is null then
    if record_id is not null then delete from public.fee_records where id = record_id; end if;
  else
    categories := public.fee_category_ids(associate_group);
    if exists (
      select 1 from unnest(coalesce(p_split_ids, '{}')) x
      where not exists (select 1 from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id
        where s.id = x and e.group_id = associate_group and s.associate_id = p_associate_id and s.category_id = any(categories))
    ) then raise exception 'Rateio inválido: use um rateio de mensalidade deste associado'; end if;

    insert into public.fee_records(group_id, associate_id, year, month, status, note, updated_by)
    values (associate_group, p_associate_id, p_year, p_month, p_status, nullif(trim(p_note), ''), auth.uid())
    on conflict (associate_id, year, month) do update
      set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
    returning id into record_id;
    if debt.id is null or p_status <> 'pago' then
      delete from public.fee_record_splits where fee_record_id = record_id;
      insert into public.fee_record_splits(fee_record_id, split_id)
      select record_id, x from (select distinct unnest(coalesce(p_split_ids, '{}')) as x) d;
    end if;

    -- A dívida do mês precisa da rubrica de mensalidade e do valor do mês; sem eles, o mês fica Não pago sem dívida.
    if p_status = 'nao_pago' and debt.id is null then
      select category_id into fee_category from public.fee_settings where group_id = associate_group;
      select coalesce(
        (select monthly_cents from public.fee_associate_prices where associate_id = p_associate_id and year = p_year),
        (select monthly_cents from public.fee_year_settings where group_id = associate_group and year = p_year)) into month_cents;
    end if;
    if p_status = 'nao_pago' and debt.id is null and fee_category is not null and coalesce(month_cents, 0) > 0 then
      insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, category_id, origin, fee_record_id, created_by, updated_by)
      values (associate_group, p_associate_id, make_date(p_year, p_month, 1), month_cents,
        'Mensalidade ' || (array['jan.','fev.','mar.','abr.','mai.','jun.','jul.','ago.','set.','out.','nov.','dez.'])[p_month] || '/' || p_year,
        fee_category, 'mensalidade', record_id, auth.uid(), auth.uid());
    end if;
  end if;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'fee.recorded', 'associate', p_associate_id::text,
    jsonb_build_object('year', p_year, 'month', p_month, 'before', before_state,
      'after', case when p_status is null then null else public.fee_record_snapshot(record_id) end));
end;
$$;

/**
 * Dívidas em aberto para o formulário de lançamento ("Pagar dívida" no rateio): quem lança no Financeiro (Colaborador+)
 * vê o associado, a rubrica e o que falta; os demais, nada.
 */
create function public.open_debts(p_group_id uuid)
  returns table(id uuid, associate_id uuid, category_id uuid, description text, debt_date date, amount_cents bigint, open_cents bigint)
  language sql stable security definer set search_path to '' as $$
  select d.id, d.associate_id, d.category_id, d.description, d.debt_date, d.amount_cents, d.amount_cents - public.debt_paid_cents(d.id)
  from public.debts d
  where d.group_id = p_group_id and public.can_write_finance(p_group_id) and d.amount_cents > public.debt_paid_cents(d.id)
  order by d.debt_date, d.created_at;
$$;
revoke all on function public.open_debts(uuid) from public;
grant execute on function public.open_debts(uuid) to authenticated;
