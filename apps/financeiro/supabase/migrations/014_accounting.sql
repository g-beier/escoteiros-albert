-- Contabilidade: conta contábil nas rubricas e nas contas, campos do OFX nas linhas do extrato,
-- reconhecimento da conta pelo arquivo e o ID OFX (FITID) nas visões de lançamentos.
-- Rubricas e formas de pagamento passam a ser gravadas só por funções auditadas, como as contas.

-- Conta contábil: código do plano de contas do sistema contábil de destino (ex.: 3.1.2.1.0005).
-- A máscara vive só aqui e em lib/ledger-code.ts.
create domain public.ledger_code as text
  check (value ~ '^[0-9]\.[0-9]\.[0-9]\.[0-9]\.[0-9]{4}$');

-- Várias rubricas podem apontar para a mesma conta contábil.
alter table public.categories add column ledger_code public.ledger_code;
-- Contrapartida da partida dobrada (ex.: "Bancos – Cora" no plano de contas). Opcional.
alter table public.accounts add column ledger_code public.ledger_code;
-- BANKID:ACCTID do OFX: reconhece a conta na próxima importação.
alter table public.accounts add column ofx_key text check (char_length(ofx_key) between 1 and 120);
create unique index accounts_ofx_key_idx on public.accounts(group_id, ofx_key) where ofx_key is not null;

-- Campos do OFX guardados como vieram do banco.
alter table public.statement_lines
  add column trn_type text check (char_length(trn_type) <= 20),
  add column check_number text check (char_length(check_number) <= 60),
  add column reference text check (char_length(reference) <= 60),
  add column payee text check (char_length(payee) <= 200);

-- Contas ----------------------------------------------------------------------------
create or replace function public.account_snapshot(p_account_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', a.name, 'kind', a.kind, 'bank', a.bank, 'branch', a.branch, 'number', a.number,
    'opening_balance_cents', a.opening_balance_cents, 'opening_date', a.opening_date, 'active', a.active,
    'ledger_code', a.ledger_code, 'ofx_key', a.ofx_key)
  from public.accounts a where a.id = p_account_id;
$$;
revoke all on function public.account_snapshot(uuid) from public, anon, authenticated;

drop function public.create_account(uuid, text, public.account_kind, text, text, text, bigint, date);
drop function public.update_account(uuid, text, public.account_kind, text, text, text, bigint, date);

create function public.create_account(
  p_group_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text,
  p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar contas neste grupo'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome da conta'; end if;
  if exists (select 1 from public.accounts where group_id = p_group_id and lower(name) = lower(trim(p_name))) then
    raise exception 'Já existe uma conta com esse nome';
  end if;
  insert into public.accounts(group_id, name, kind, bank, branch, number, opening_balance_cents, opening_date, ledger_code)
  values (p_group_id, trim(p_name), coalesce(p_kind, 'corrente'), nullif(trim(p_bank), ''), nullif(trim(p_branch), ''),
    nullif(trim(p_number), ''), coalesce(p_opening_balance_cents, 0), p_opening_date, nullif(trim(p_ledger_code), ''))
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'account.created', 'account', new_id::text, public.account_snapshot(new_id));
  return new_id;
end;
$$;

create function public.update_account(
  p_account_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text,
  p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text
) returns void language plpgsql security definer set search_path = '' as $$
declare account_group uuid; before_state jsonb;
begin
  select group_id into account_group from public.accounts where id = p_account_id for update;
  if account_group is null or not public.can_edit_group(account_group) then raise exception 'Conta não encontrada ou sem permissão'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome da conta'; end if;
  if exists (select 1 from public.accounts where group_id = account_group and id <> p_account_id and lower(name) = lower(trim(p_name))) then
    raise exception 'Já existe uma conta com esse nome';
  end if;
  before_state := public.account_snapshot(p_account_id);
  update public.accounts set
    name = trim(p_name),
    kind = coalesce(p_kind, kind),
    bank = nullif(trim(p_bank), ''),
    branch = nullif(trim(p_branch), ''),
    number = nullif(trim(p_number), ''),
    opening_balance_cents = coalesce(p_opening_balance_cents, 0),
    opening_date = p_opening_date,
    ledger_code = nullif(trim(p_ledger_code), ''),
    updated_at = now()
  where id = p_account_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (account_group, auth.uid(), 'account.updated', 'account', p_account_id::text,
    jsonb_build_object('before', before_state, 'after', public.account_snapshot(p_account_id)));
end;
$$;

-- Liga a conta ao BANKID:ACCTID de um arquivo OFX (nulo desliga).
create function public.set_account_ofx_key(p_account_id uuid, p_ofx_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare account_group uuid; previous text; key text := nullif(trim(p_ofx_key), '');
begin
  select group_id, ofx_key into account_group, previous from public.accounts where id = p_account_id for update;
  if account_group is null or not public.can_edit_group(account_group) then raise exception 'Conta não encontrada ou sem permissão'; end if;
  if key is not null and exists (select 1 from public.accounts where group_id = account_group and ofx_key = key and id <> p_account_id) then
    raise exception 'Esse arquivo OFX já está ligado a outra conta';
  end if;
  if key is not distinct from previous then return; end if;
  update public.accounts set ofx_key = key, updated_at = now() where id = p_account_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (account_group, auth.uid(), 'account.ofx_key_set', 'account', p_account_id::text, jsonb_build_object('from', previous, 'to', key));
end;
$$;

-- Rubricas ----------------------------------------------------------------------------
create function public.category_snapshot(p_category_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code', c.code, 'name', c.name, 'ledger_code', c.ledger_code, 'active', c.active)
  from public.categories c where c.id = p_category_id;
$$;
revoke all on function public.category_snapshot(uuid) from public, anon, authenticated;

create function public.create_category(p_group_id uuid, p_code text, p_name text, p_ledger_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar rubricas neste grupo'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Informe um nome com 2 a 100 caracteres'; end if;
  if coalesce(trim(p_code), '') !~ '^[12](\.[0-9]{1,3}){1,4}$' then raise exception 'Código da rubrica inválido (ex.: 2.5.6)'; end if;
  if exists (select 1 from public.categories where group_id = p_group_id and code = trim(p_code)) then
    raise exception 'Já existe uma rubrica com o código %', trim(p_code);
  end if;
  insert into public.categories(group_id, code, name, ledger_code)
  values (p_group_id, trim(p_code), trim(p_name), nullif(trim(p_ledger_code), ''))
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'category.created', 'category', new_id::text, public.category_snapshot(new_id));
  return new_id;
end;
$$;

-- Nome e conta contábil. O código da rubrica não muda: ele define a árvore.
create function public.update_category(p_category_id uuid, p_name text, p_ledger_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare category_group uuid; before_state jsonb;
begin
  select group_id into category_group from public.categories where id = p_category_id for update;
  if category_group is null or not public.can_edit_group(category_group) then raise exception 'Rubrica não encontrada ou sem permissão'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Informe um nome com 2 a 100 caracteres'; end if;
  before_state := public.category_snapshot(p_category_id);
  update public.categories set name = trim(p_name), ledger_code = nullif(trim(p_ledger_code), '') where id = p_category_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (category_group, auth.uid(), 'category.updated', 'category', p_category_id::text,
    jsonb_build_object('before', before_state, 'after', public.category_snapshot(p_category_id)));
end;
$$;

create function public.set_category_active(p_category_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare category_group uuid;
begin
  select group_id into category_group from public.categories where id = p_category_id for update;
  if category_group is null or not public.can_edit_group(category_group) then raise exception 'Rubrica não encontrada ou sem permissão'; end if;
  update public.categories set active = coalesce(p_active, false) where id = p_category_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (category_group, auth.uid(), case when p_active then 'category.activated' else 'category.deactivated' end, 'category',
    p_category_id::text, jsonb_build_object('active', coalesce(p_active, false)));
end;
$$;

-- Formas de pagamento ------------------------------------------------------------------
create function public.create_payment_method(p_group_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar formas de pagamento neste grupo'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Informe um nome com 2 a 60 caracteres'; end if;
  if exists (select 1 from public.payment_methods where group_id = p_group_id and lower(name) = lower(trim(p_name))) then
    raise exception 'Já existe uma forma de pagamento com esse nome';
  end if;
  insert into public.payment_methods(group_id, name) values (p_group_id, trim(p_name)) returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'payment_method.created', 'payment_method', new_id::text, jsonb_build_object('name', trim(p_name)));
  return new_id;
end;
$$;

create function public.update_payment_method(p_payment_method_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare method_group uuid; previous text;
begin
  select group_id, name into method_group, previous from public.payment_methods where id = p_payment_method_id for update;
  if method_group is null or not public.can_edit_group(method_group) then raise exception 'Forma de pagamento não encontrada ou sem permissão'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Informe um nome com 2 a 60 caracteres'; end if;
  if exists (select 1 from public.payment_methods where group_id = method_group and id <> p_payment_method_id and lower(name) = lower(trim(p_name))) then
    raise exception 'Já existe uma forma de pagamento com esse nome';
  end if;
  update public.payment_methods set name = trim(p_name) where id = p_payment_method_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (method_group, auth.uid(), 'payment_method.updated', 'payment_method', p_payment_method_id::text,
    jsonb_build_object('from', previous, 'to', trim(p_name)));
end;
$$;

create function public.set_payment_method_active(p_payment_method_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare method_group uuid;
begin
  select group_id into method_group from public.payment_methods where id = p_payment_method_id for update;
  if method_group is null or not public.can_edit_group(method_group) then raise exception 'Forma de pagamento não encontrada ou sem permissão'; end if;
  update public.payment_methods set active = coalesce(p_active, false) where id = p_payment_method_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (method_group, auth.uid(), case when p_active then 'payment_method.activated' else 'payment_method.deactivated' end,
    'payment_method', p_payment_method_id::text, jsonb_build_object('active', coalesce(p_active, false)));
end;
$$;

-- Escrita direta deixa de existir: só as funções acima (e os seeds) gravam.
drop policy "editors manage categories" on public.categories;
drop policy "editors manage payment methods" on public.payment_methods;

revoke all on function public.create_account(uuid, text, public.account_kind, text, text, text, bigint, date, text) from public;
revoke all on function public.update_account(uuid, text, public.account_kind, text, text, text, bigint, date, text) from public;
revoke all on function public.set_account_ofx_key(uuid, text) from public;
revoke all on function public.create_category(uuid, text, text, text) from public;
revoke all on function public.update_category(uuid, text, text) from public;
revoke all on function public.set_category_active(uuid, boolean) from public;
revoke all on function public.create_payment_method(uuid, text) from public;
revoke all on function public.update_payment_method(uuid, text) from public;
revoke all on function public.set_payment_method_active(uuid, boolean) from public;
grant execute on function public.create_account(uuid, text, public.account_kind, text, text, text, bigint, date, text) to authenticated;
grant execute on function public.update_account(uuid, text, public.account_kind, text, text, text, bigint, date, text) to authenticated;
grant execute on function public.set_account_ofx_key(uuid, text) to authenticated;
grant execute on function public.create_category(uuid, text, text, text) to authenticated;
grant execute on function public.update_category(uuid, text, text) to authenticated;
grant execute on function public.set_category_active(uuid, boolean) to authenticated;
grant execute on function public.create_payment_method(uuid, text) to authenticated;
grant execute on function public.update_payment_method(uuid, text) to authenticated;
grant execute on function public.set_payment_method_active(uuid, boolean) to authenticated;

/*
  Importação: mesmos campos de 012 mais os do OFX (camelCase):
  { date, amountCents, description, kind?, counterparty?, externalId?, balanceCents?,
    trnType?, checkNumber?, reference?, payee? }
*/
create or replace function public.import_statement_lines(
  p_account_id uuid, p_profile_id uuid, p_profile_settings jsonb, p_file_name text,
  p_period_from date, p_period_to date, p_opening_balance_cents bigint, p_closing_balance_cents bigint,
  p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_group uuid;
  account_active boolean;
  used_settings jsonb := p_profile_settings;
  line jsonb;
  idx bigint;
  total int;
  inserted int;
  first_date date;
  last_date date;
  new_import_id uuid;
begin
  select group_id, active into account_group, account_active from public.accounts where id = p_account_id;
  if account_group is null or not public.can_edit_group(account_group) then raise exception 'Conta não encontrada ou sem permissão'; end if;
  if not account_active then raise exception 'A conta está inativa'; end if;

  if p_profile_id is not null then
    select coalesce(used_settings, p.settings) into used_settings from public.import_profiles p where p.id = p_profile_id and p.group_id = account_group;
    if not found then raise exception 'Perfil de importação inválido'; end if;
  end if;
  if used_settings is not null and jsonb_typeof(used_settings) <> 'object' then raise exception 'Configurações do perfil inválidas'; end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Nenhuma linha para importar'; end if;
  total := jsonb_array_length(p_lines);
  if total > 10000 then raise exception 'Arquivo grande demais: importe no máximo 10.000 linhas por vez'; end if;

  for line, idx in select value, ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    if jsonb_typeof(line) <> 'object' then raise exception 'Linha %: formato inválido', idx; end if;
    if jsonb_typeof(line->'date') is distinct from 'string' or (line->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or not pg_input_is_valid(line->>'date', 'date') then
      raise exception 'Linha %: data inválida', idx;
    end if;
    if (case when jsonb_typeof(line->'amountCents') = 'number' and pg_input_is_valid(line->>'amountCents', 'bigint')
      then (line->>'amountCents')::bigint = 0 else true end) then
      raise exception 'Linha %: valor inválido (centavos inteiros, diferente de zero)', idx;
    end if;
    if jsonb_typeof(line->'description') is distinct from 'string' or char_length(trim(line->>'description')) not between 1 and 500 then
      raise exception 'Linha %: histórico obrigatório (até 500 caracteres)', idx;
    end if;
    if exists (select 1 from unnest(array['kind', 'counterparty', 'externalId', 'payee']) k
      where line ? k and jsonb_typeof(line->k) <> 'null' and (jsonb_typeof(line->k) <> 'string' or char_length(line->>k) > 200)) then
      raise exception 'Linha %: tipo, favorecido ou identificador inválido (texto de até 200 caracteres)', idx;
    end if;
    if exists (select 1 from unnest(array['trnType', 'checkNumber', 'reference']) k
      where line ? k and jsonb_typeof(line->k) <> 'null' and (jsonb_typeof(line->k) <> 'string' or char_length(line->>k) > case k when 'trnType' then 20 else 60 end)) then
      raise exception 'Linha %: TRNTYPE, CHECKNUM ou REFNUM inválido', idx;
    end if;
    if line ? 'balanceCents' and jsonb_typeof(line->'balanceCents') <> 'null'
      and (jsonb_typeof(line->'balanceCents') <> 'number' or not pg_input_is_valid(line->>'balanceCents', 'bigint')) then
      raise exception 'Linha %: saldo inválido (centavos inteiros)', idx;
    end if;
  end loop;

  select min((value->>'date')::date), max((value->>'date')::date) into first_date, last_date from jsonb_array_elements(p_lines);
  if coalesce(p_period_from, first_date) > coalesce(p_period_to, last_date) then raise exception 'Período inválido'; end if;

  insert into public.statement_imports(group_id, account_id, profile_id, profile_settings, file_name, imported_by,
    period_from, period_to, opening_balance_cents, closing_balance_cents)
  values (account_group, p_account_id, p_profile_id, used_settings, coalesce(nullif(trim(p_file_name), ''), 'extrato'), auth.uid(),
    coalesce(p_period_from, first_date), coalesce(p_period_to, last_date), p_opening_balance_cents, p_closing_balance_cents)
  returning id into new_import_id;

  with input as (
    select t.ord,
      (t.v->>'date')::date as line_date,
      (t.v->>'amountCents')::bigint as amount_cents,
      trim(t.v->>'description') as description,
      nullif(trim(t.v->>'kind'), '') as kind,
      nullif(trim(t.v->>'counterparty'), '') as counterparty,
      nullif(trim(t.v->>'externalId'), '') as external_id,
      (t.v->>'balanceCents')::bigint as balance_cents,
      upper(nullif(trim(t.v->>'trnType'), '')) as trn_type,
      nullif(trim(t.v->>'checkNumber'), '') as check_number,
      nullif(trim(t.v->>'reference'), '') as reference,
      nullif(trim(t.v->>'payee'), '') as payee
    from jsonb_array_elements(p_lines) with ordinality as t(v, ord)
  ), numbered as (
    select input.*, row_number() over (
      partition by line_date, amount_cents, public.statement_description_key(description) order by ord) as occurrence
    from input
  )
  insert into public.statement_lines(group_id, account_id, import_id, line_date, description, kind, counterparty,
    external_id, amount_cents, balance_cents, fingerprint, trn_type, check_number, reference, payee)
  select account_group, p_account_id, new_import_id, line_date, description, kind, counterparty,
    external_id, amount_cents, balance_cents,
    public.statement_line_fingerprint(p_account_id, line_date, amount_cents, description, occurrence::int),
    trn_type, check_number, reference, payee
  from numbered order by ord
  on conflict do nothing;
  get diagnostics inserted = row_count;

  update public.statement_imports set line_count = inserted, duplicate_count = total - inserted where id = new_import_id;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (account_group, auth.uid(), 'statement.imported', 'statement_import', new_import_id::text,
    jsonb_build_object('account_id', p_account_id, 'profile_id', p_profile_id, 'file_name', p_file_name,
      'period_from', coalesce(p_period_from, first_date), 'period_to', coalesce(p_period_to, last_date),
      'inserted', inserted, 'skipped_duplicates', total - inserted));

  return jsonb_build_object('import_id', new_import_id, 'inserted', inserted, 'skipped_duplicates', total - inserted);
end;
$$;

-- Visões, recriadas com as colunas em ordem lógica ------------------------------------
-- external_ids: IDs OFX (FITID) das linhas do extrato vinculadas ao lançamento. Não é único:
-- serve para juntar o lançamento e seus rateios à movimentação do banco.
drop view public.entry_split_rows;
drop view public.ledger_entry_rows;
drop view public.reconciliation_link_rows;

create function public.entry_external_ids(p_entry_id uuid)
returns text[] language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(distinct l.external_id order by l.external_id) filter (where l.external_id is not null), '{}')
  from public.reconciliation_links rl
  join public.statement_lines l on l.id = rl.statement_line_id
  where rl.ledger_entry_id = p_entry_id;
$$;
grant execute on function public.entry_external_ids(uuid) to authenticated;

create view public.ledger_entry_rows with (security_invoker = true) as
select
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.created_at,
  e.name,
  e.account_id,
  acc.name as account_name,
  acc.ledger_code as account_ledger_code,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents,
  count(s.id)::int as split_count,
  coalesce(array_agg(distinct s.category_id) filter (where s.category_id is not null), '{}') as category_ids,
  coalesce(array_agg(distinct s.associate_id) filter (where s.associate_id is not null), '{}') as associate_ids,
  coalesce(bool_or(s.associate_id is null), false) as has_split_without_associate,
  x.external_ids,
  exists (select 1 from public.reconciliation_links rl where rl.ledger_entry_id = e.id) as reconciled,
  e.outside_statement,
  concat_ws(' ', e.name, string_agg(s.description, ' '), array_to_string(x.external_ids, ' ')) as search_text
from public.ledger_entries e
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
left join public.entry_splits s on s.entry_id = e.id
cross join lateral (select public.entry_external_ids(e.id) as external_ids) x
group by e.id, pm.name, acc.name, acc.ledger_code, x.external_ids;

create view public.entry_split_rows with (security_invoker = true) as
select
  s.id as split_id,
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.name as entry_name,
  e.account_id,
  acc.name as account_name,
  acc.ledger_code as account_ledger_code,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents as entry_total_cents,
  s.amount_cents,
  s.description,
  s.category_id,
  c.code as category_code,
  c.name as category_name,
  c.kind as category_kind,
  c.ledger_code as category_ledger_code,
  s.associate_id,
  a.name as associate_name,
  x.external_ids,
  exists (select 1 from public.reconciliation_links rl where rl.ledger_entry_id = e.id) as reconciled,
  e.outside_statement,
  concat_ws(' ', e.name, s.description, array_to_string(x.external_ids, ' ')) as search_text
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id
cross join lateral (select public.entry_external_ids(e.id) as external_ids) x;

create view public.reconciliation_link_rows with (security_invoker = true) as
select
  rl.id as link_id,
  rl.link_set_id,
  l.group_id,
  l.account_id,
  rl.statement_line_id,
  l.line_date,
  l.description as line_description,
  l.kind as line_kind,
  l.counterparty as line_counterparty,
  l.amount_cents as line_amount_cents,
  l.external_id as line_external_id,
  l.trn_type as line_trn_type,
  rl.ledger_entry_id,
  e.entry_date,
  e.name as entry_name,
  e.total_cents as entry_total_cents,
  rl.amount_cents,
  rl.created_at
from public.reconciliation_links rl
join public.statement_lines l on l.id = rl.statement_line_id
join public.ledger_entries e on e.id = rl.ledger_entry_id;
