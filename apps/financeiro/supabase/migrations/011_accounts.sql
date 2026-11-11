-- Contas: onde o dinheiro está (conta corrente, poupança, caixa…). Todo lançamento passa a ter uma conta.
-- Formas de pagamento ganham uma conta padrão (ex.: Dinheiro → Caixa), usada quando a conta não é informada.

create type public.account_kind as enum ('corrente', 'poupanca', 'caixa', 'outro');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  kind public.account_kind not null default 'corrente',
  bank text check (char_length(bank) <= 60),
  branch text check (char_length(branch) <= 20),
  number text check (char_length(number) <= 30),
  opening_balance_cents bigint not null default 0,
  opening_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);
create index accounts_group_idx on public.accounts(group_id);
alter table public.accounts enable row level security;
-- Escrita somente pelas funções abaixo (validadas e auditadas).
create policy "members read accounts" on public.accounts for select using (public.is_group_member(group_id));

-- Conta usada quando nada melhor se aplica: lançamentos antigos e chamadas sem conta.
create or replace function public.fallback_account(p_group_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare found_id uuid;
begin
  select id into found_id from public.accounts where group_id = p_group_id and name = 'A definir';
  if found_id is null then
    insert into public.accounts(group_id, name, kind) values (p_group_id, 'A definir', 'outro')
    on conflict (group_id, name) do nothing returning id into found_id;
    if found_id is null then
      select id into found_id from public.accounts where group_id = p_group_id and name = 'A definir';
    end if;
  end if;
  return found_id;
end;
$$;
revoke all on function public.fallback_account(uuid) from public, anon, authenticated;

-- Contas iniciais de um grupo: "A definir" e "Caixa" (padrão da forma Dinheiro).
create or replace function public.seed_accounts(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cash_id uuid;
begin
  perform public.fallback_account(p_group_id);
  insert into public.accounts(group_id, name, kind) values (p_group_id, 'Caixa', 'caixa')
  on conflict (group_id, name) do nothing returning id into cash_id;
  if cash_id is not null then
    update public.payment_methods set default_account_id = cash_id
    where group_id = p_group_id and name = 'Dinheiro' and default_account_id is null;
  end if;
end;
$$;
revoke all on function public.seed_accounts(uuid) from public, anon, authenticated;

-- Conta padrão da forma de pagamento ------------------------------------------
alter table public.payment_methods add column default_account_id uuid references public.accounts(id) on delete set null;
create index payment_methods_default_account_idx on public.payment_methods(default_account_id);

-- Conta do lançamento: padrão da forma, senão "A definir" ----------------------
select public.seed_accounts(id) from public.groups;

alter table public.ledger_entries add column account_id uuid references public.accounts(id) on delete restrict;

update public.ledger_entries e
set account_id = coalesce(
  (select pm.default_account_id from public.payment_methods pm where pm.id = e.payment_method_id),
  public.fallback_account(e.group_id))
where e.account_id is null;

alter table public.ledger_entries alter column account_id set not null;
create index ledger_entries_account_date_idx on public.ledger_entries(account_id, entry_date);

-- Conta para um novo lançamento: a informada, senão a padrão (ativa) da forma, senão "A definir".
create or replace function public.resolve_entry_account(p_group_id uuid, p_payment_method_id uuid, p_account_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare chosen uuid;
begin
  if p_account_id is not null then return p_account_id; end if;
  select a.id into chosen from public.payment_methods pm join public.accounts a on a.id = pm.default_account_id
  where pm.id = p_payment_method_id and pm.group_id = p_group_id and a.group_id = p_group_id and a.active;
  return coalesce(chosen, public.fallback_account(p_group_id));
end;
$$;
revoke all on function public.resolve_entry_account(uuid, uuid, uuid) from public, anon, authenticated;

-- Funções de escrita das contas ------------------------------------------------
create or replace function public.account_snapshot(p_account_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', a.name, 'kind', a.kind, 'bank', a.bank, 'branch', a.branch, 'number', a.number,
    'opening_balance_cents', a.opening_balance_cents, 'opening_date', a.opening_date, 'active', a.active)
  from public.accounts a where a.id = p_account_id;
$$;
revoke all on function public.account_snapshot(uuid) from public, anon, authenticated;

create or replace function public.create_account(
  p_group_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text,
  p_opening_balance_cents bigint, p_opening_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar contas neste grupo'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome da conta'; end if;
  if exists (select 1 from public.accounts where group_id = p_group_id and lower(name) = lower(trim(p_name))) then
    raise exception 'Já existe uma conta com esse nome';
  end if;
  insert into public.accounts(group_id, name, kind, bank, branch, number, opening_balance_cents, opening_date)
  values (p_group_id, trim(p_name), coalesce(p_kind, 'corrente'), nullif(trim(p_bank), ''), nullif(trim(p_branch), ''),
    nullif(trim(p_number), ''), coalesce(p_opening_balance_cents, 0), p_opening_date)
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'account.created', 'account', new_id::text, public.account_snapshot(new_id));
  return new_id;
end;
$$;

create or replace function public.update_account(
  p_account_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text,
  p_opening_balance_cents bigint, p_opening_date date
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
    updated_at = now()
  where id = p_account_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (account_group, auth.uid(), 'account.updated', 'account', p_account_id::text,
    jsonb_build_object('before', before_state, 'after', public.account_snapshot(p_account_id)));
end;
$$;

-- Inativar tira a conta dos novos lançamentos e das formas de pagamento que a tinham como padrão.
create or replace function public.set_account_active(p_account_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare account_group uuid; cleared int := 0;
begin
  select group_id into account_group from public.accounts where id = p_account_id for update;
  if account_group is null or not public.can_edit_group(account_group) then raise exception 'Conta não encontrada ou sem permissão'; end if;
  update public.accounts set active = coalesce(p_active, false), updated_at = now() where id = p_account_id;
  if not coalesce(p_active, false) then
    update public.payment_methods set default_account_id = null where default_account_id = p_account_id;
    get diagnostics cleared = row_count;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (account_group, auth.uid(), case when p_active then 'account.activated' else 'account.deactivated' end, 'account', p_account_id::text,
    jsonb_build_object('active', coalesce(p_active, false), 'cleared_payment_method_defaults', cleared));
end;
$$;

create or replace function public.set_payment_method_default_account(p_payment_method_id uuid, p_account_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare method_group uuid; previous uuid;
begin
  select group_id, default_account_id into method_group, previous from public.payment_methods where id = p_payment_method_id for update;
  if method_group is null or not public.can_edit_group(method_group) then raise exception 'Forma de pagamento não encontrada ou sem permissão'; end if;
  if p_account_id is not null and not exists (select 1 from public.accounts where id = p_account_id and group_id = method_group and active) then
    raise exception 'Conta inválida';
  end if;
  update public.payment_methods set default_account_id = p_account_id where id = p_payment_method_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (method_group, auth.uid(), 'payment_method.default_account_set', 'payment_method', p_payment_method_id::text,
    jsonb_build_object('from', previous, 'to', p_account_id));
end;
$$;

revoke all on function public.create_account(uuid, text, public.account_kind, text, text, text, bigint, date) from public;
revoke all on function public.update_account(uuid, text, public.account_kind, text, text, text, bigint, date) from public;
revoke all on function public.set_account_active(uuid, boolean) from public;
revoke all on function public.set_payment_method_default_account(uuid, uuid) from public;
grant execute on function public.create_account(uuid, text, public.account_kind, text, text, text, bigint, date) to authenticated;
grant execute on function public.update_account(uuid, text, public.account_kind, text, text, text, bigint, date) to authenticated;
grant execute on function public.set_account_active(uuid, boolean) to authenticated;
grant execute on function public.set_payment_method_default_account(uuid, uuid) to authenticated;

-- Lançamentos com conta ---------------------------------------------------------
create or replace function public.ledger_entry_snapshot(p_entry_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'entry_date', e.entry_date,
    'name', e.name,
    'account_id', e.account_id,
    'payment_method_id', e.payment_method_id,
    'document', e.document,
    'document_filed', e.document_filed,
    'total_cents', e.total_cents,
    'splits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id', s.category_id, 'amount_cents', s.amount_cents,
        'description', s.description, 'associate_id', s.associate_id) order by s.created_at, s.id)
      from public.entry_splits s where s.entry_id = e.id), '[]'::jsonb)
  )
  from public.ledger_entries e where e.id = p_entry_id;
$$;

create or replace function public.audit_ledger_entry_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new.group_id, auth.uid(), 'ledger_entry.created', 'ledger_entry', new.id::text,
    jsonb_build_object('entry_date', new.entry_date, 'name', new.name, 'account_id', new.account_id,
      'payment_method_id', new.payment_method_id, 'total_cents', new.total_cents));
  return new;
end;
$$;

drop function if exists public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb);
drop function if exists public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb);

-- p_account_id é opcional (compatibilidade): sem ele, usa a conta padrão da forma ou "A definir".
create function public.create_ledger_entry(
  p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_entry_id uuid; entry_account uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para lançar neste grupo'; end if;
  perform public.validate_entry_totals(p_total_cents, p_splits);
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and group_id = p_group_id and active) then
    raise exception 'Forma de pagamento inválida';
  end if;
  if p_account_id is not null and not exists (select 1 from public.accounts where id = p_account_id and group_id = p_group_id and active) then
    raise exception 'Conta inválida';
  end if;
  entry_account := public.resolve_entry_account(p_group_id, p_payment_method_id, p_account_id);

  insert into public.ledger_entries (group_id, entry_date, name, account_id, payment_method_id, document, document_filed, total_cents, created_by)
  values (p_group_id, p_entry_date, trim(p_name), entry_account, p_payment_method_id, nullif(trim(p_document), ''), coalesce(p_document_filed, false), p_total_cents, auth.uid())
  returning id into new_entry_id;

  perform public.write_entry_splits(new_entry_id, p_group_id, p_splits);
  return new_entry_id;
end;
$$;

-- Na edição, p_account_id nulo mantém a conta atual. Conta inativa só é aceita se já era a do lançamento.
create function public.update_ledger_entry(
  p_entry_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  entry_group uuid;
  old_payment_method uuid;
  old_account uuid;
  before_state jsonb;
begin
  select group_id, payment_method_id, account_id into entry_group, old_payment_method, old_account
  from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  perform public.validate_entry_totals(p_total_cents, p_splits);
  if not exists (
    select 1 from public.payment_methods where id = p_payment_method_id and group_id = entry_group
      and (active or id = old_payment_method)
  ) then raise exception 'Forma de pagamento inválida'; end if;
  if p_account_id is not null and not exists (
    select 1 from public.accounts where id = p_account_id and group_id = entry_group and (active or id = old_account)
  ) then raise exception 'Conta inválida'; end if;

  before_state := public.ledger_entry_snapshot(p_entry_id);

  update public.ledger_entries set
    entry_date = p_entry_date,
    name = trim(p_name),
    account_id = coalesce(p_account_id, old_account),
    payment_method_id = p_payment_method_id,
    document = nullif(trim(p_document), ''),
    document_filed = coalesce(p_document_filed, false),
    total_cents = p_total_cents,
    updated_at = now()
  where id = p_entry_id;

  delete from public.entry_splits where entry_id = p_entry_id;
  perform public.write_entry_splits(p_entry_id, entry_group, p_splits, before_state->'splits');

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.updated', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('before', before_state, 'after', public.ledger_entry_snapshot(p_entry_id)));
end;
$$;

revoke all on function public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid) from public;
revoke all on function public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid) from public;
grant execute on function public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid) to authenticated;
grant execute on function public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid) to authenticated;

-- Novos grupos já nascem com as contas iniciais.
create or replace function public.admin_bootstrap_group(p_admin_email text, p_group_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare admin_id uuid; new_group_id uuid;
begin
  select id into admin_id from auth.users where lower(email) = lower(trim(p_admin_email));
  if admin_id is null then raise exception 'Crie e confirme o usuário administrativo antes de iniciar o grupo'; end if;
  if exists (select 1 from public.memberships where user_id = admin_id) then raise exception 'Usuário já pertence a um grupo'; end if;
  insert into public.groups(name) values (trim(p_group_name)) returning id into new_group_id;
  insert into public.memberships(group_id, user_id, role) values (new_group_id, admin_id, 'admin');
  perform public.seed_categories(new_group_id);
  perform public.seed_payment_methods(new_group_id);
  perform public.seed_accounts(new_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new_group_id, admin_id, 'group.bootstrapped', 'group', new_group_id::text, jsonb_build_object('name', trim(p_group_name)));
  return new_group_id;
end;
$$;
revoke all on function public.admin_bootstrap_group(text, text) from public, anon, authenticated;
grant execute on function public.admin_bootstrap_group(text, text) to postgres;

-- Visões com a conta (colunas novas no fim, como exige create or replace view) --------
create or replace view public.entry_split_rows with (security_invoker = true) as
select
  s.id as split_id,
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents as entry_total_cents,
  s.amount_cents,
  s.description,
  s.category_id,
  c.name as category_name,
  s.associate_id,
  a.name as associate_name,
  e.name as entry_name,
  e.name || ' ' || s.description as search_text,
  c.code as category_code,
  c.kind as category_kind,
  e.account_id,
  acc.name as account_name
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id;

create or replace view public.ledger_entry_rows with (security_invoker = true) as
select
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.name,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents,
  e.created_at,
  count(s.id)::int as split_count,
  coalesce(array_agg(distinct s.category_id) filter (where s.category_id is not null), '{}') as category_ids,
  coalesce(array_agg(distinct s.associate_id) filter (where s.associate_id is not null), '{}') as associate_ids,
  e.name || ' ' || coalesce(string_agg(s.description, ' '), '') as search_text,
  coalesce(bool_or(s.associate_id is null), false) as has_split_without_associate,
  e.account_id,
  acc.name as account_name
from public.ledger_entries e
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
left join public.entry_splits s on s.entry_id = e.id
group by e.id, pm.name, acc.name;
