-- Importação de extrato: perfis por banco, importações e linhas do extrato (o "fato" do banco, não editado).
-- Vínculos e recusas de conciliação ganham tabelas agora; as funções de conciliação vêm depois.
-- Mesmo modelo de permissão dos lançamentos: leitura por membros, escrita por tesouraria/administração via funções.

create type public.statement_line_status as enum ('aberta', 'conciliada', 'ignorada');

-- Perfis de importação: um por banco/formato, compartilhado pelo grupo ------------
create table public.import_profiles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  format text not null check (format in ('csv', 'ofx')),
  -- cabeçalho normalizado do CSV, para reconhecer o banco no próximo arquivo
  header_signature text check (char_length(header_signature) <= 2000),
  -- mapeamento de colunas, separador, formato de data, separador decimal, codificação…
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);
create index import_profiles_signature_idx on public.import_profiles(group_id, header_signature);

-- Importações: um arquivo enviado para uma conta --------------------------------
create table public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  profile_id uuid references public.import_profiles(id) on delete set null,
  -- cópia das configurações usadas, para reler a importação mesmo que o perfil mude
  profile_settings jsonb,
  file_name text not null check (char_length(file_name) between 1 and 255),
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  period_from date not null,
  period_to date not null,
  line_count int not null default 0,
  duplicate_count int not null default 0,
  opening_balance_cents bigint,
  closing_balance_cents bigint,
  check (period_from <= period_to)
);
create index statement_imports_account_idx on public.statement_imports(account_id, imported_at desc);

-- Linhas do extrato ---------------------------------------------------------------
create table public.statement_lines (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  import_id uuid not null references public.statement_imports(id) on delete cascade,
  line_date date not null,
  description text not null check (char_length(description) between 1 and 500),
  kind text check (char_length(kind) <= 200),
  counterparty text check (char_length(counterparty) <= 200),
  external_id text check (char_length(external_id) <= 200),
  amount_cents bigint not null check (amount_cents <> 0),
  balance_cents bigint,
  -- conta + data + valor + histórico + nº de ocorrência no dia (ver import_statement_lines)
  fingerprint text not null,
  status public.statement_line_status not null default 'aberta',
  ignored_reason text check (char_length(ignored_reason) <= 200),
  created_at timestamptz not null default now(),
  unique (account_id, fingerprint),
  check (status <> 'ignorada' or ignored_reason is not null)
);
create unique index statement_lines_external_idx on public.statement_lines(account_id, external_id, line_date, amount_cents)
  where external_id is not null;
create index statement_lines_account_date_idx on public.statement_lines(account_id, line_date);
create index statement_lines_import_idx on public.statement_lines(import_id);
create index statement_lines_open_idx on public.statement_lines(account_id, line_date) where status = 'aberta';

-- Conciliação: vínculos linha ↔ lançamento (1:1, 1:N, N:1) e sugestões recusadas ------
create table public.reconciliation_links (
  id uuid primary key default gen_random_uuid(),
  statement_line_id uuid not null references public.statement_lines(id) on delete cascade,
  ledger_entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  amount_cents bigint not null check (amount_cents <> 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (statement_line_id, ledger_entry_id)
);
create index reconciliation_links_entry_idx on public.reconciliation_links(ledger_entry_id);

create table public.reconciliation_rejections (
  statement_line_id uuid not null references public.statement_lines(id) on delete cascade,
  ledger_entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz not null default now(),
  primary key (statement_line_id, ledger_entry_id)
);
create index reconciliation_rejections_entry_idx on public.reconciliation_rejections(ledger_entry_id);

-- RLS: leitura por membros; nenhuma política de escrita (só as funções abaixo escrevem).
alter table public.import_profiles enable row level security;
alter table public.statement_imports enable row level security;
alter table public.statement_lines enable row level security;
alter table public.reconciliation_links enable row level security;
alter table public.reconciliation_rejections enable row level security;

create policy "members read import profiles" on public.import_profiles for select using (public.is_group_member(group_id));
create policy "members read statement imports" on public.statement_imports for select using (public.is_group_member(group_id));
create policy "members read statement lines" on public.statement_lines for select using (public.is_group_member(group_id));
create policy "members read reconciliation links" on public.reconciliation_links for select using (
  exists (select 1 from public.statement_lines l where l.id = statement_line_id and public.is_group_member(l.group_id))
);
create policy "members read reconciliation rejections" on public.reconciliation_rejections for select using (
  exists (select 1 from public.statement_lines l where l.id = statement_line_id and public.is_group_member(l.group_id))
);

-- Perfis: cria (p_profile_id nulo) ou atualiza ----------------------------------------
create or replace function public.save_import_profile(
  p_group_id uuid, p_profile_id uuid, p_name text, p_format text, p_header_signature text, p_settings jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  profile_id uuid := p_profile_id;
  before_state jsonb;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar perfis de importação neste grupo'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'Informe um nome de perfil com 2 a 80 caracteres'; end if;
  if p_format is null or p_format not in ('csv', 'ofx') then raise exception 'Formato de arquivo inválido'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception 'Configurações do perfil inválidas'; end if;
  if exists (select 1 from public.import_profiles where group_id = p_group_id and lower(name) = lower(trim(p_name))
    and id is distinct from p_profile_id) then
    raise exception 'Já existe um perfil com esse nome';
  end if;

  if profile_id is null then
    insert into public.import_profiles(group_id, name, format, header_signature, settings, created_by, updated_by)
    values (p_group_id, trim(p_name), p_format, nullif(trim(p_header_signature), ''), p_settings, auth.uid(), auth.uid())
    returning id into profile_id;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'import_profile.created', 'import_profile', profile_id::text,
      jsonb_build_object('name', trim(p_name), 'format', p_format, 'settings', p_settings));
  else
    select jsonb_build_object('name', name, 'format', format, 'header_signature', header_signature, 'settings', settings)
    into before_state from public.import_profiles where id = profile_id and group_id = p_group_id for update;
    if before_state is null then raise exception 'Perfil não encontrado'; end if;
    update public.import_profiles set
      name = trim(p_name), format = p_format, header_signature = nullif(trim(p_header_signature), ''),
      settings = p_settings, updated_by = auth.uid(), updated_at = now()
    where id = profile_id;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'import_profile.updated', 'import_profile', profile_id::text,
      jsonb_build_object('before', before_state, 'after',
        jsonb_build_object('name', trim(p_name), 'format', p_format, 'header_signature', nullif(trim(p_header_signature), ''), 'settings', p_settings)));
  end if;
  return profile_id;
end;
$$;

-- Histórico normalizado para a impressão digital: minúsculas, espaços colapsados.
create or replace function public.statement_description_key(p_description text)
returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(coalesce(p_description, '')), '\s+', ' ', 'g'));
$$;

-- Impressão digital: conta + data + valor + histórico + nº de ocorrência do mesmo
-- (data, valor, histórico) no arquivo, na ordem de entrada. Assim, dois pagamentos
-- idênticos no mesmo dia continuam sendo duas linhas, e reimportar um período
-- sobreposto não duplica nada.
create or replace function public.statement_line_fingerprint(
  p_account_id uuid, p_date date, p_amount_cents bigint, p_description text, p_occurrence int
) returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(concat_ws('|', p_account_id::text, p_date::text, p_amount_cents::text,
    public.statement_description_key(p_description), p_occurrence::text), 'UTF8')), 'hex');
$$;

/*
  Importa linhas já interpretadas no navegador. Formato de cada linha (camelCase):
  { date: 'YYYY-MM-DD', amountCents: int, description: string,
    kind?: string, counterparty?: string, externalId?: string, balanceCents?: int }
  Duplicatas (mesmo externalId + data + valor, ou mesma impressão digital) são puladas.
  Retorna { import_id, inserted, skipped_duplicates }.
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
    if exists (select 1 from unnest(array['kind', 'counterparty', 'externalId']) k
      where line ? k and jsonb_typeof(line->k) <> 'null' and (jsonb_typeof(line->k) <> 'string' or char_length(line->>k) > 200)) then
      raise exception 'Linha %: tipo, favorecido ou identificador inválido (texto de até 200 caracteres)', idx;
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
      (t.v->>'balanceCents')::bigint as balance_cents
    from jsonb_array_elements(p_lines) with ordinality as t(v, ord)
  ), numbered as (
    select input.*, row_number() over (
      partition by line_date, amount_cents, public.statement_description_key(description) order by ord) as occurrence
    from input
  )
  insert into public.statement_lines(group_id, account_id, import_id, line_date, description, kind, counterparty,
    external_id, amount_cents, balance_cents, fingerprint)
  select account_group, p_account_id, new_import_id, line_date, description, kind, counterparty,
    external_id, amount_cents, balance_cents,
    public.statement_line_fingerprint(p_account_id, line_date, amount_cents, description, occurrence::int)
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

revoke all on function public.save_import_profile(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.import_statement_lines(uuid, uuid, jsonb, text, date, date, bigint, bigint, jsonb) from public;
grant execute on function public.save_import_profile(uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.import_statement_lines(uuid, uuid, jsonb, text, date, date, bigint, bigint, jsonb) to authenticated;
