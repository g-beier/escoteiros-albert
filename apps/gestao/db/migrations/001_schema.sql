-- Schema base do Gestão (schemas `auth` e `public`): tabelas, visões, RLS, funções auditadas e permissões.
-- Consolidado em 2026-11-21 a partir das 56 migrations de desenvolvimento (histórico no git, antes deste arquivo).
-- Mudanças novas vão em migrations seguintes (002_…), nunca editando este arquivo depois que houver produção.
--
-- Pontos de partida: auth.users/auth.sessions/auth.uid() (login e sessão, lib/server/auth.ts); memberships e
-- is_group_member/can_edit_group (papéis e RLS); audit_events (toda função de escrita registra); módulos Financeiro
-- (ledger_*, entry_*, statement_*, reconciliation_*, fee_*, debts), Inventário (inventory_*) e Associados
-- (associates, sections, patrols, relatives, control_*).

set local check_function_bodies = false;
set local search_path = '';

do $$ begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Sao_Paulo');
end $$;

CREATE SCHEMA auth;

CREATE TYPE public.account_kind AS ENUM (
    'corrente',
    'poupanca',
    'caixa',
    'outro'
);

CREATE TYPE public.associate_function_kind AS ENUM (
    'escotista',
    'dirigente',
    'honorifico',
    'comissao_fiscal',
    'colaborador',
    'contribuinte'
);

CREATE TYPE public.associate_movement_kind AS ENUM (
    'entrada',
    'saida'
);

CREATE TYPE public.associate_registration AS ENUM (
    'provisorio',
    'definitivo'
);

CREATE TYPE public.associates_role AS ENUM (
    'manager',
    'viewer'
);

CREATE TYPE public.category_kind AS ENUM (
    'receita',
    'despesa'
);

CREATE TYPE public.control_audience AS ENUM (
    'jovem',
    'adulto',
    'responsavel'
);

CREATE TYPE public.control_item_kind AS ENUM (
    'documento',
    'sistema',
    'canal',
    'etapa'
);

CREATE TYPE public.control_status AS ENUM (
    'ok',
    'pendente',
    'desatualizado',
    'a_verificar',
    'convidado',
    'nao_se_aplica',
    'a_remover',
    'removido'
);

CREATE TYPE public.control_value_kind AS ENUM (
    'situacao',
    'ano',
    'data'
);

CREATE TYPE public.directorate AS ENUM (
    'metodos_educativos',
    'administrativa',
    'financeira',
    'comunicacao'
);

CREATE TYPE public.fee_due_rule AS ENUM (
    'dia_fixo',
    'dia_util',
    'fim_do_mes'
);

CREATE TYPE public.fee_status AS ENUM (
    'pago',
    'atencao',
    'nao_pago',
    'isento'
);

CREATE TYPE public.inventory_condition AS ENUM (
    'novo',
    'bom',
    'regular',
    'ruim',
    'manutencao',
    'inservivel'
);

CREATE TYPE public.inventory_movement_kind AS ENUM (
    'entrada',
    'transferencia',
    'condicao',
    'ajuste',
    'baixa',
    'edicao'
);

CREATE TYPE public.inventory_origin AS ENUM (
    'compra',
    'doacao',
    'fabricacao',
    'nao_informada'
);

CREATE TYPE public.inventory_review_status AS ENUM (
    'para_revisar',
    'revisado'
);

CREATE TYPE public.inventory_role AS ENUM (
    'manager',
    'chief',
    'viewer'
);

CREATE TYPE public.inventory_tracking AS ENUM (
    'unit',
    'lot'
);

CREATE TYPE public.inventory_write_off_reason AS ENUM (
    'perda',
    'extravio',
    'descarte',
    'doacao',
    'consumo'
);

CREATE DOMAIN public.ledger_code AS text
	CONSTRAINT ledger_code_check CHECK ((VALUE ~ '^[0-9]\.[0-9]\.[0-9]\.[0-9]\.[0-9]{4}$'::text));

CREATE TYPE public.member_role AS ENUM (
    'admin',
    'treasurer',
    'viewer'
);

CREATE TYPE public.relative_kinship AS ENUM (
    'mae',
    'pai',
    'outro'
);

CREATE TYPE public.scout_branch AS ENUM (
    'filhote',
    'lobinho',
    'escoteiro',
    'senior',
    'pioneiro',
    'adulto'
);

CREATE TYPE public.statement_line_status AS ENUM (
    'aberta',
    'conciliada',
    'ignorada'
);

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;

CREATE FUNCTION public.account_balance_before(p_account_id uuid, p_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  acc record;
  movements bigint;
  entry_count int;
begin
  if p_date is null then raise exception 'Informe a data'; end if;
  select id, opening_balance_cents, opening_date into acc from public.accounts where id = p_account_id;
  if acc.id is null then raise exception 'Conta não encontrada'; end if;

  -- O saldo inicial vale no começo de opening_date; antes dela o sistema não sabe o saldo.
  if acc.opening_date is not null and p_date < acc.opening_date then
    return jsonb_build_object('date', p_date, 'opening_balance_cents', acc.opening_balance_cents, 'opening_date', acc.opening_date,
      'before_opening', true, 'movements_cents', null, 'entry_count', null, 'balance_cents', null);
  end if;

  select coalesce(sum(e.total_cents), 0), count(*) into movements, entry_count
  from public.ledger_entries e
  where e.account_id = p_account_id and e.entry_date < p_date
    and (acc.opening_date is null or e.entry_date >= acc.opening_date);

  return jsonb_build_object('date', p_date, 'opening_balance_cents', acc.opening_balance_cents, 'opening_date', acc.opening_date,
    'before_opening', false, 'movements_cents', movements, 'entry_count', entry_count,
    'balance_cents', acc.opening_balance_cents + movements);
end;
$$;

CREATE FUNCTION public.account_snapshot(p_account_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('name', a.name, 'kind', a.kind, 'bank', a.bank, 'branch', a.branch, 'number', a.number,
    'opening_balance_cents', a.opening_balance_cents, 'opening_date', a.opening_date, 'active', a.active,
    'ledger_code', a.ledger_code)
  from public.accounts a where a.id = p_account_id;
$$;

CREATE FUNCTION public.add_associate_movement(p_associate_id uuid, p_date date, p_kind public.associate_movement_kind, p_reason text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare associate_group uuid; new_id uuid;
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_date is null or p_kind is null then raise exception 'Informe a data e o tipo'; end if;
  if char_length(trim(p_reason)) > 120 then raise exception 'Motivo: no máximo 120 caracteres'; end if;
  insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
  values (associate_group, p_associate_id, p_date, p_kind, nullif(trim(p_reason), ''), auth.uid())
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'associate.movement_added', 'associate', p_associate_id::text,
    jsonb_build_object('date', p_date, 'kind', p_kind, 'reason', nullif(trim(p_reason), '')));
  return new_id;
end;
$$;

CREATE FUNCTION public.add_entry_attachment(p_entry_id uuid, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  entry_group uuid;
  path_parts record;
  object_type text := lower(btrim(coalesce(p_content_type, '')));
  object_size bigint := coalesce(p_size_bytes, 0);
  clean_name text := btrim(coalesce(p_file_name, ''));
  new_id uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  select * into path_parts from public.attachment_path_entry(p_storage_path);
  if path_parts.group_id is distinct from entry_group or path_parts.entry_id is distinct from p_entry_id then
    raise exception 'Caminho do anexo inválido';
  end if;
  if clean_name = '' then raise exception 'Informe o nome do arquivo'; end if;
  clean_name := left(clean_name, 200);

  if object_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif') then
    raise exception 'Tipo de arquivo não aceito: envie PDF, JPG, PNG ou HEIC';
  end if;
  if object_size < 1 or object_size > 10485760 then raise exception 'O arquivo deve ter até 10 MB'; end if;

  insert into public.entry_attachments(group_id, entry_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
  values (entry_group, p_entry_id, p_storage_path, clean_name, object_type, object_size, auth.uid())
  returning id into new_id;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.attachment_added', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('attachment_id', new_id, 'file_name', clean_name, 'content_type', object_type,
      'size_bytes', object_size, 'storage_path', p_storage_path));
  return new_id;
end;
$$;

CREATE FUNCTION public.admin_add_member(p_group_id uuid, p_email text, p_role public.member_role, p_inventory_role public.inventory_role DEFAULT 'viewer'::public.inventory_role, p_associates_role public.associates_role DEFAULT 'viewer'::public.associates_role) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  clean_email text := lower(btrim(coalesce(p_email, '')));
  target uuid;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem cadastrar usuários';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido'; end if;
  insert into auth.users(email) values (clean_email)
  on conflict (email) do update set banned_until = null
  returning id into target;
  if exists (select 1 from public.memberships where group_id = p_group_id and user_id = target) then
    raise exception 'Este e-mail já tem acesso ao grupo';
  end if;
  insert into public.memberships(group_id, user_id, role, inventory_role, associates_role)
  values (p_group_id, target, p_role,
    case when p_role = 'admin' then 'viewer' else coalesce(p_inventory_role, 'viewer') end,
    case when p_role = 'admin' then 'viewer' else coalesce(p_associates_role, 'viewer') end);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.invited', 'user', target::text, jsonb_build_object('role', p_role, 'email', clean_email,
    'inventory_role', p_inventory_role, 'associates_role', p_associates_role));
  return target;
end;
$_$;

CREATE FUNCTION public.admin_bootstrap_group(p_admin_email text, p_group_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.admin_change_associates_role(p_group_id uuid, p_user_id uuid, p_role public.associates_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare old_role public.associates_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem alterar papéis';
  end if;
  if p_role is null then raise exception 'Escolha o papel'; end if;
  select associates_role into old_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if old_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  update public.memberships set associates_role = p_role where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.associates_role_changed', 'user', p_user_id::text, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

CREATE FUNCTION public.admin_change_inventory_role(p_group_id uuid, p_user_id uuid, p_role public.inventory_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare old_role public.inventory_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem alterar papéis';
  end if;
  select inventory_role into old_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if old_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  update public.memberships set inventory_role = p_role where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.inventory_role_changed', 'user', p_user_id::text, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

CREATE FUNCTION public.admin_change_member_role(p_group_id uuid, p_user_id uuid, p_role public.member_role) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare old_role public.member_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem alterar papéis';
  end if;
  select role into old_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if old_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'Você não pode remover sua própria função de administrador'; end if;
  if old_role = 'admin' and p_role <> 'admin' and (select count(*) from public.memberships where group_id = p_group_id and role = 'admin') <= 1 then
    raise exception 'O grupo precisa manter pelo menos um administrador';
  end if;
  update public.memberships set role = p_role where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.role_changed', 'user', p_user_id::text, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

CREATE FUNCTION public.admin_remove_member(p_group_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare removed_role public.member_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem remover usuários';
  end if;
  if p_user_id = auth.uid() then raise exception 'Você não pode remover seu próprio acesso'; end if;
  select role into removed_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if removed_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  if removed_role = 'admin' and (select count(*) from public.memberships where group_id = p_group_id and role = 'admin') <= 1 then
    raise exception 'O grupo precisa manter pelo menos um administrador';
  end if;
  delete from public.memberships where group_id = p_group_id and user_id = p_user_id;
  if not exists (select 1 from public.memberships where user_id = p_user_id) then
    -- sem grupo: solta também a conta Google, para o recadastro aceitar outra (só aqui, nunca em admin_add_member)
    update auth.users set banned_until = 'infinity', google_sub = null where id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.removed', 'user', p_user_id::text, jsonb_build_object('role', removed_role));
end;
$$;

CREATE FUNCTION public.associate_audience_of(p_associate_id uuid) RETURNS public.control_audience
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select audience from public.associate_audiences where associate_id = p_associate_id;
$$;

CREATE FUNCTION public.associate_function_snapshot(p_function_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('associate_id', f.associate_id, 'kind', f.kind, 'section_id', f.section_id, 'title', f.title,
    'started_on', f.started_on, 'ended_on', f.ended_on, 'elected', f.elected)
  from public.associate_functions f where f.id = p_function_id;
$$;

CREATE FUNCTION public.associate_snapshot(p_associate_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('name', a.name, 'branch', a.branch, 'section_id', a.section_id, 'patrol_id', a.patrol_id,
    'active', a.active, 'birth_date', a.birth_date, 'promise_date', a.promise_date, 'joined_on', a.joined_on, 'notes', a.notes,
    'registration', a.registration, 'nickname', a.nickname)
  from public.associates a where a.id = p_associate_id;
$$;

CREATE FUNCTION public.associates_add_function(p_associate_id uuid, p_kind public.associate_function_kind, p_title text, p_started_on date, p_section_id uuid DEFAULT NULL::uuid, p_elected boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype; new_id uuid; clean_title text := nullif(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch <> 'adulto' then raise exception 'Só adultos têm função'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes de adicionar função'; end if;
  if p_kind is null then raise exception 'Escolha o tipo da função'; end if;
  perform public.associates_check_function_section(a.group_id, p_kind, p_section_id, null);
  if coalesce(p_elected, false) and p_kind <> 'dirigente' then raise exception 'Só a função de dirigente é eleita'; end if;
  if char_length(clean_title) > 80 then raise exception 'Cargo: no máximo 80 caracteres'; end if;
  if p_started_on > current_date then raise exception 'O início da função não pode ser futuro'; end if;
  if public.associates_function_taken(a.id, p_kind, p_section_id, clean_title, null) then raise exception 'O associado já tem esta função ativa'; end if;
  insert into public.associate_functions(group_id, associate_id, kind, section_id, title, started_on, elected, created_by)
  values (a.group_id, a.id, p_kind, p_section_id, clean_title, p_started_on, coalesce(p_elected, false), auth.uid())
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.function_added', 'associate', a.id::text, public.associate_function_snapshot(new_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.associates_check_details(p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(clean_name) not between 2 and 120 then raise exception 'Informe um nome com 2 a 120 caracteres'; end if;
  if p_birth_date > current_date then raise exception 'A data de nascimento não pode ser futura'; end if;
  if p_promise_date > current_date then raise exception 'A data da promessa não pode ser futura'; end if;
  if p_joined_on > current_date then raise exception 'A data de entrada não pode ser futura'; end if;
  if p_promise_date < p_birth_date then raise exception 'A promessa não pode ser antes do nascimento'; end if;
  if p_joined_on < p_birth_date then raise exception 'A entrada não pode ser antes do nascimento'; end if;
  if char_length(trim(p_notes)) > 500 then raise exception 'Observações: no máximo 500 caracteres'; end if;
  return clean_name;
end;
$$;

CREATE FUNCTION public.associates_check_function_section(p_group_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_current uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_kind = 'escotista' then
    if p_section_id is null then raise exception 'Escolha a seção do escotista'; end if;
    if not exists (select 1 from public.sections where id = p_section_id and group_id = p_group_id and (active or id = p_current)) then
      raise exception 'Seção não encontrada ou inativa';
    end if;
  elsif p_section_id is not null then
    raise exception 'Só a função de escotista tem seção';
  end if;
end;
$$;

CREATE FUNCTION public.associates_check_placement(p_group_id uuid, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare section_row public.sections%rowtype;
begin
  if p_branch is null then raise exception 'Escolha o ramo'; end if;
  if p_branch = 'adulto' and p_section_id is not null then raise exception 'Adultos não têm seção: são só o ramo'; end if;
  if p_section_id is not null then
    select * into section_row from public.sections where id = p_section_id and group_id = p_group_id;
    if section_row.id is null then raise exception 'Seção não encontrada'; end if;
    if section_row.branch <> p_branch then raise exception 'A seção não é deste ramo'; end if;
  end if;
  if p_patrol_id is not null then
    if p_section_id is null then raise exception 'Escolha a seção da equipe'; end if;
    if not exists (select 1 from public.patrols where id = p_patrol_id and section_id = p_section_id) then
      raise exception 'A equipe não é desta seção';
    end if;
  end if;
end;
$$;

CREATE FUNCTION public.associates_clear_transition() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.branch is distinct from old.branch or (old.active and not new.active) then new.transition_started_on := null; end if;
  return new;
end;
$$;

CREATE FUNCTION public.associates_create(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare new_id uuid; clean_name text;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para cadastrar associados neste grupo'; end if;
  clean_name := public.associates_check_details(p_name, p_birth_date, p_promise_date, p_joined_on, p_notes);
  perform public.associates_check_placement(p_group_id, p_branch, p_section_id, p_patrol_id);
  insert into public.associates(group_id, name, branch, section_id, patrol_id, active, birth_date, promise_date, joined_on, notes)
  values (p_group_id, clean_name, p_branch, p_section_id, p_patrol_id, true, p_birth_date, p_promise_date, p_joined_on, nullif(trim(p_notes), ''))
  returning id into new_id;
  insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
  values (p_group_id, new_id, coalesce(p_joined_on, current_date), 'entrada', 'Cadastro', auth.uid());
  perform public.control_statuses_init(p_group_id, new_id, null, public.associate_audience_of(new_id));
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associate.created', 'associate', new_id::text, public.associate_snapshot(new_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.associates_create_quick(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare new_id uuid;
begin
  new_id := public.associates_create(p_group_id, p_name, p_branch, p_section_id, p_patrol_id, p_birth_date, p_promise_date, p_joined_on, p_notes);
  update public.associates set review_status = 'para_revisar' where id = new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associate.quick', 'associate', new_id::text, jsonb_build_object('channel', 'rapido'));
  return new_id;
end;
$$;

CREATE FUNCTION public.associates_delete_function(p_function_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare f public.associate_functions%rowtype; before_state jsonb;
begin
  select * into f from public.associate_functions where id = p_function_id for update;
  if f.id is null or not public.can_manage_associates(f.group_id) then raise exception 'Função não encontrada ou sem permissão'; end if;
  before_state := public.associate_function_snapshot(f.id);
  delete from public.associate_functions where id = f.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (f.group_id, auth.uid(), 'associate.function_deleted', 'associate', f.associate_id::text, before_state);
end;
$$;

CREATE FUNCTION public.associates_end_function(p_function_id uuid, p_ended_on date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare f public.associate_functions%rowtype;
begin
  select * into f from public.associate_functions where id = p_function_id for update;
  if f.id is null or not public.can_manage_associates(f.group_id) then raise exception 'Função não encontrada ou sem permissão'; end if;
  if f.ended_on is not null then raise exception 'A função já está encerrada'; end if;
  if p_ended_on is null then raise exception 'Informe a data de término'; end if;
  if p_ended_on > current_date then raise exception 'O término da função não pode ser futuro'; end if;
  if p_ended_on < f.started_on then raise exception 'O término não pode ser antes do início (%)', to_char(f.started_on, 'DD/MM/YYYY'); end if;
  update public.associate_functions set ended_on = p_ended_on where id = f.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (f.group_id, auth.uid(), 'associate.function_ended', 'associate', f.associate_id::text, public.associate_function_snapshot(f.id));
end;
$$;

CREATE FUNCTION public.associates_function_taken(p_associate_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text, p_except uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.associate_functions where associate_id = p_associate_id and kind = p_kind
    and section_id is not distinct from p_section_id and lower(coalesce(title, '')) = lower(coalesce(p_title, ''))
    and (ended_on is null or ended_on > current_date) and id is distinct from p_except);
$$;

CREATE FUNCTION public.associates_leave(p_associate_id uuid, p_date date, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype; last_entry date; to_remove int;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if not a.active then raise exception 'O associado já está desligado'; end if;
  if p_date is null then raise exception 'Informe a data do desligamento'; end if;
  if p_date > current_date then raise exception 'A data do desligamento não pode ser futura'; end if;
  if char_length(trim(p_reason)) > 120 then raise exception 'Motivo: no máximo 120 caracteres'; end if;
  select max(movement_date) into last_entry from public.associate_movements where associate_id = a.id and kind = 'entrada';
  if p_date < last_entry then raise exception 'O desligamento não pode ser antes da última entrada (%)', to_char(last_entry, 'DD/MM/YYYY'); end if;
  insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
  values (a.group_id, a.id, p_date, 'saida', nullif(trim(p_reason), ''), auth.uid());
  update public.associates set active = false, updated_at = now() where id = a.id;
  -- O trigger da saída já marcou "a remover"; conta o que ele marcou nesta transação.
  select count(*) into to_remove from public.control_statuses
  where (associate_id = a.id or relative_id in (select relative_id from public.relative_links where associate_id = a.id))
    and status = 'a_remover' and updated_at = now();
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.left', 'associate', a.id::text,
    jsonb_build_object('date', p_date, 'reason', nullif(trim(p_reason), ''), 'to_remove', to_remove));
end;
$$;

CREATE FUNCTION public.associates_move(p_associate_id uuid, p_date date, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype; new_id uuid; next_branch public.scout_branch;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch = 'adulto' then raise exception 'Passagem é só de jovens'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes da passagem'; end if;
  if p_date is null then raise exception 'Informe a data da passagem'; end if;
  if p_date > current_date then raise exception 'A data da passagem não pode ser futura'; end if;
  next_branch := public.associates_next_branch(a.branch);
  if p_branch is distinct from next_branch then
    raise exception 'A passagem é para o ramo seguinte (%); para corrigir ramo, seção ou equipe, edite o cadastro', next_branch;
  end if;
  perform public.associates_check_placement(a.group_id, p_branch, p_section_id, p_patrol_id);
  insert into public.associate_moves(group_id, associate_id, move_date, from_branch, to_branch, from_section_id, to_section_id, to_patrol_id, created_by)
  values (a.group_id, a.id, p_date, a.branch, p_branch, a.section_id, p_section_id, p_patrol_id, auth.uid())
  returning id into new_id;
  update public.associates set branch = p_branch, section_id = p_section_id, patrol_id = p_patrol_id, updated_at = now() where id = a.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.moved', 'associate', a.id::text,
    jsonb_build_object('date', p_date, 'from_branch', a.branch, 'to_branch', p_branch, 'from_section_id', a.section_id,
      'to_section_id', p_section_id, 'from_patrol_id', a.patrol_id, 'to_patrol_id', p_patrol_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.associates_next_branch(p_branch public.scout_branch) RETURNS public.scout_branch
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select min(b) from unnest(enum_range(null::public.scout_branch)) as b where b > p_branch;
$$;

CREATE FUNCTION public.associates_rejoin(p_associate_id uuid, p_date date, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype; last_exit date;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.active then raise exception 'O associado já está ativo'; end if;
  if p_date is null then raise exception 'Informe a data do reingresso'; end if;
  if p_date > current_date then raise exception 'A data do reingresso não pode ser futura'; end if;
  if char_length(trim(p_reason)) > 120 then raise exception 'Motivo: no máximo 120 caracteres'; end if;
  select max(movement_date) into last_exit from public.associate_movements where associate_id = a.id and kind = 'saida';
  if p_date < last_exit then raise exception 'O reingresso não pode ser antes do último desligamento (%)', to_char(last_exit, 'DD/MM/YYYY'); end if;
  insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
  values (a.group_id, a.id, p_date, 'entrada', nullif(trim(p_reason), ''), auth.uid());
  update public.associates set active = true, updated_at = now() where id = a.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.rejoined', 'associate', a.id::text,
    jsonb_build_object('date', p_date, 'reason', nullif(trim(p_reason), '')));
end;
$$;

CREATE FUNCTION public.associates_review(p_group_id uuid, p_associate_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare done_id uuid; total integer := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para revisar associados neste grupo'; end if;
  for done_id in
    update public.associates set review_status = 'revisado', reviewed_by = auth.uid(), reviewed_at = now()
    where group_id = p_group_id and id = any(p_associate_ids) and review_status = 'para_revisar'
    returning id
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'associate.reviewed', 'associate', done_id::text, '{}'::jsonb);
    total := total + 1;
  end loop;
  return total;
end;
$$;

CREATE FUNCTION public.associates_role_of(p_group_id uuid) RETURNS public.associates_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when role = 'admin' then 'manager'::public.associates_role else associates_role end
  from public.memberships where group_id = p_group_id and user_id = auth.uid();
$$;

CREATE FUNCTION public.associates_seed_control_items(p_group_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare created int;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para alterar itens de controle neste grupo'; end if;
  created := public.control_items_seed(p_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'control_items.seeded', 'control_item', p_group_id::text, jsonb_build_object('created', created));
  return created;
end;
$$;

CREATE FUNCTION public.associates_set_transition(p_associate_id uuid, p_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch = 'adulto' then raise exception 'Adultos não têm transição de ramo'; end if;
  if not a.active then raise exception 'O associado está desligado'; end if;
  if p_date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data de início não pode ser no futuro'; end if;
  update public.associates set transition_started_on = p_date, updated_at = now() where id = p_associate_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), case when p_date is null then 'associate.transition_cleared' else 'associate.transition_started' end,
    'associate', p_associate_id::text, jsonb_build_object('branch', a.branch, 'before', a.transition_started_on, 'after', p_date));
end;
$$;

CREATE FUNCTION public.associates_sync_active() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare target uuid; last_kind public.associate_movement_kind;
begin
  if tg_op = 'INSERT' then
    target := new.associate_id;
    if exists (select 1 from public.associate_movements where associate_id = target and movement_date > new.movement_date) then
      select kind into last_kind from public.associate_movements where associate_id = target
      order by movement_date desc, created_at desc, (kind = 'entrada') desc limit 1;
    else
      last_kind := new.kind;
      -- Saída que deixa o associado inativo (desligamento, Financeiro ou importação): abre "a remover"
      -- nos itens ativos removidos no desligamento a que ele ainda tem acesso.
      if new.kind = 'saida' then
        update public.control_statuses s set status = 'a_remover', status_date = new.movement_date, updated_by = auth.uid(), updated_at = now()
        from public.control_items i
        where s.associate_id = target and i.id = s.item_id and i.active and i.remove_on_leave
          and s.status in ('ok', 'desatualizado', 'a_verificar', 'convidado');
        -- O mesmo para os responsáveis do jovem que não acompanham outro jovem ativo. Responsável que é
        -- associado ativo é controlado como adulto: continua no grupo.
        update public.control_statuses s set status = 'a_remover', status_date = new.movement_date, updated_by = auth.uid(), updated_at = now()
        from public.control_items i, public.relative_links l
        where l.associate_id = target and s.relative_id = l.relative_id and i.id = s.item_id and i.active and i.remove_on_leave
          and s.status in ('ok', 'desatualizado', 'a_verificar', 'convidado')
          and not exists (select 1 from public.relative_links o join public.associates a on a.id = o.associate_id
                          where o.relative_id = l.relative_id and o.associate_id <> target and a.active)
          and not exists (select 1 from public.relatives r join public.associates a on a.id = r.associate_id
                          where r.id = l.relative_id and a.active);
      end if;
    end if;
  else
    target := old.associate_id;
    select kind into last_kind from public.associate_movements where associate_id = target
    order by movement_date desc, created_at desc, (kind = 'entrada') desc limit 1;
  end if;
  if last_kind is not null then
    update public.associates set active = (last_kind = 'entrada'), updated_at = now()
    where id = target and active is distinct from (last_kind = 'entrada');
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.associates_update(p_associate_id uuid, p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text, p_registration public.associate_registration, p_nickname text, p_branch public.scout_branch DEFAULT NULL::public.scout_branch, p_section_id uuid DEFAULT NULL::uuid, p_patrol_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype; before_state jsonb; clean_name text; clean_nickname text := nullif(trim(coalesce(p_nickname, '')), '');
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  clean_name := public.associates_check_details(p_name, p_birth_date, p_promise_date, p_joined_on, p_notes);
  if p_registration is null then raise exception 'Escolha o registro (provisório ou definitivo)'; end if;
  if char_length(clean_nickname) > 8 then raise exception 'Apelido: no máximo 8 caracteres'; end if;
  if p_branch is not null then
    perform public.associates_check_placement(a.group_id, p_branch, p_section_id, p_patrol_id);
    if a.branch = 'adulto' and p_branch <> 'adulto' and exists (
      select 1 from public.associate_functions f where f.associate_id = a.id and (f.ended_on is null or f.ended_on > current_date)) then
      raise exception 'Adulto com função ativa: encerre as funções antes de mudar o ramo';
    end if;
  end if;
  before_state := public.associate_snapshot(p_associate_id);
  update public.associates set name = clean_name, birth_date = p_birth_date, promise_date = p_promise_date,
    joined_on = p_joined_on, notes = nullif(trim(p_notes), ''), registration = p_registration, nickname = clean_nickname,
    branch = coalesce(p_branch, branch),
    section_id = case when p_branch is null then section_id else p_section_id end,
    patrol_id = case when p_branch is null then patrol_id else p_patrol_id end,
    updated_at = now()
  where id = p_associate_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.updated', 'associate', p_associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.associate_snapshot(p_associate_id)));
end;
$$;

CREATE FUNCTION public.associates_update_function(p_function_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text, p_started_on date, p_ended_on date, p_elected boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare f public.associate_functions%rowtype; a public.associates%rowtype; before_state jsonb;
  clean_title text := nullif(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
begin
  select * into f from public.associate_functions where id = p_function_id for update;
  if f.id is null or not public.can_manage_associates(f.group_id) then raise exception 'Função não encontrada ou sem permissão'; end if;
  select * into a from public.associates where id = f.associate_id;
  if a.branch <> 'adulto' then raise exception 'Só adultos têm função'; end if;
  if p_kind is null then raise exception 'Escolha o tipo da função'; end if;
  perform public.associates_check_function_section(f.group_id, p_kind, p_section_id, f.section_id);
  if coalesce(p_elected, false) and p_kind <> 'dirigente' then raise exception 'Só a função de dirigente é eleita'; end if;
  if char_length(clean_title) > 80 then raise exception 'Cargo: no máximo 80 caracteres'; end if;
  if p_started_on > current_date then raise exception 'O início da função não pode ser futuro'; end if;
  if p_ended_on > current_date then raise exception 'O término da função não pode ser futuro'; end if;
  if p_ended_on < p_started_on then raise exception 'O término não pode ser antes do início (%)', to_char(p_started_on, 'DD/MM/YYYY'); end if;
  if (p_ended_on is null or p_ended_on > current_date) and public.associates_function_taken(a.id, p_kind, p_section_id, clean_title, f.id) then
    raise exception 'O associado já tem esta função ativa';
  end if;
  before_state := public.associate_function_snapshot(f.id);
  update public.associate_functions set kind = p_kind, section_id = p_section_id, title = clean_title, started_on = p_started_on,
    ended_on = p_ended_on, elected = coalesce(p_elected, false)
  where id = f.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (f.group_id, auth.uid(), 'associate.function_updated', 'associate', f.associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.associate_function_snapshot(f.id)));
end;
$$;

CREATE FUNCTION public.attachment_path_entry(p_name text, OUT group_id uuid, OUT entry_id uuid) RETURNS record
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  select (m)[1]::uuid, (m)[2]::uuid
  from (select regexp_match(p_name,
    '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f-]{36}\.(pdf|jpg|png|heic|heif)$') as m) x;
$_$;

CREATE FUNCTION public.audit_ledger_entry_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new.group_id, auth.uid(), 'ledger_entry.created', 'ledger_entry', new.id::text,
    jsonb_build_object('entry_date', new.entry_date, 'name', new.name, 'account_id', new.account_id,
      'payment_method_id', new.payment_method_id, 'total_cents', new.total_cents));
  return new;
end;
$$;

CREATE FUNCTION public.can_delete_attachment_object(p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(public.can_edit_group((public.attachment_path_entry(p_name)).group_id), false);
$$;

CREATE FUNCTION public.can_edit_group(requested_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.memberships where group_id = requested_group_id and user_id = auth.uid() and role in ('admin', 'treasurer'));
$$;

CREATE FUNCTION public.can_edit_inventory(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(public.inventory_role_of(p_group_id) in ('manager', 'chief'), false);
$$;

CREATE FUNCTION public.can_manage_associates(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(public.associates_role_of(p_group_id) = 'manager', false) or public.can_edit_group(p_group_id);
$$;

CREATE FUNCTION public.can_manage_inventory(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(public.inventory_role_of(p_group_id) = 'manager', false);
$$;

CREATE FUNCTION public.can_read_attachment_object(p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(public.is_group_member((public.attachment_path_entry(p_name)).group_id), false);
$$;

CREATE FUNCTION public.can_write_attachment_object(p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.ledger_entries e
    where e.id = (public.attachment_path_entry(p_name)).entry_id
      and e.group_id = (public.attachment_path_entry(p_name)).group_id
      and public.can_edit_group(e.group_id));
$$;

CREATE FUNCTION public.category_code_key(p_code text) RETURNS integer[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case when p_code is null then null else string_to_array(p_code, '.')::int[] end;
$$;

CREATE FUNCTION public.category_snapshot(p_category_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('code', c.code, 'name', c.name, 'ledger_code', c.ledger_code, 'active', c.active, 'parent_id', c.parent_id)
  from public.categories c where c.id = p_category_id;
$$;

CREATE FUNCTION public.category_subtree(p_category_id uuid) RETURNS TABLE(id uuid, depth integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive tree as (
    select c.id, 0 as depth from public.categories c where c.id = p_category_id
    union all
    select c.id, tree.depth + 1 from public.categories c join tree on c.parent_id = tree.id
  )
  select id, depth from tree;
$$;

CREATE FUNCTION public.check_category_kind_fits(p_ids uuid[], p_kind public.category_kind) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_kind = 'receita' and exists (select 1 from public.entry_splits where category_id = any(p_ids) and amount_cents < 0) then
    raise exception 'Há rateios de despesa (saída) nesta rubrica ou nas de baixo: ela não pode ir para Receitas';
  end if;
  if p_kind = 'despesa' and exists (select 1 from public.entry_splits where category_id = any(p_ids) and amount_cents > 0) then
    raise exception 'Há rateios de receita (entrada) nesta rubrica ou nas de baixo: ela não pode ir para Despesas';
  end if;
end;
$$;

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    kind public.category_kind,
    parent_id uuid,
    ledger_code public.ledger_code,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT categories_code_check CHECK ((code ~ '^[12](\.[0-9]{1,3}){0,4}$'::text)),
    CONSTRAINT categories_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 100)))
);

CREATE FUNCTION public.check_category_parent(p_group_id uuid, p_parent_id uuid, p_height integer) RETURNS public.categories
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare parent public.categories;
begin
  select * into parent from public.categories where id = p_parent_id and group_id = p_group_id;
  if parent.id is null then raise exception 'Rubrica pai não encontrada'; end if;
  if parent.code is null then raise exception 'A rubrica pai precisa estar na árvore (ter código)'; end if;
  if array_length(public.category_code_key(parent.code), 1) + 1 + p_height > 5 then
    raise exception 'A árvore de rubricas tem no máximo 5 níveis (ex.: 2.1.1.1.1)';
  end if;
  return parent;
end;
$$;

CREATE FUNCTION public.check_debt_allocations(p_associate_id uuid, p_entry_ids uuid[], p_debt_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare bad record;
begin
  select d.description, d.amount_cents, sum(p.amount_cents) as allocated into bad
  from public.debts d join public.debt_payments p on p.debt_id = d.id
  where d.id = any(p_debt_ids) group by d.id having sum(p.amount_cents) > d.amount_cents limit 1;
  if found then
    raise exception 'Os pagamentos de "%" (%) passam do valor da dívida (%)', bad.description, public.debt_money(bad.allocated::bigint), public.debt_money(bad.amount_cents);
  end if;
  select e.entry_date, e.name, public.debt_payment_cents(e.id, p_associate_id) as available, sum(p.amount_cents) as allocated into bad
  from public.ledger_entries e join public.debt_payments p on p.entry_id = e.id join public.debts d on d.id = p.debt_id and d.associate_id = p_associate_id
  where e.id = any(p_entry_ids) group by e.id having sum(p.amount_cents) > public.debt_payment_cents(e.id, p_associate_id) limit 1;
  if found then
    raise exception 'O lançamento % de % tem % do associado e já foram usados %', bad.name, to_char(bad.entry_date, 'DD/MM/YYYY'),
      public.debt_money(bad.available::bigint), public.debt_money(bad.allocated::bigint);
  end if;
end;
$$;

CREATE FUNCTION public.confirm_fee_suggestions(p_items jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  item jsonb;
  idx bigint;
  existing_splits uuid[];
  item_status public.fee_status;
  done int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Nenhuma sugestão'; end if;
  if jsonb_array_length(p_items) > 5000 then raise exception 'Sugestões demais de uma vez'; end if;
  for item, idx in select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    if coalesce(item->>'status', 'pago') not in ('pago', 'atencao') then raise exception 'Sugestão %: status inválido', idx; end if;
    item_status := coalesce(item->>'status', 'pago')::public.fee_status;
    select coalesce(array_agg(rs.split_id), '{}') into existing_splits
    from public.fee_records r join public.fee_record_splits rs on rs.fee_record_id = r.id
    where r.associate_id = (item->>'associateId')::uuid and r.year = (item->>'year')::int and r.month = (item->>'month')::int;
    begin
      perform public.set_fee_record((item->>'associateId')::uuid, (item->>'year')::int, (item->>'month')::int, item_status,
        left(item->>'note', 200), existing_splits || (item->>'splitId')::uuid);
    exception when others then
      raise exception 'Sugestão %: %', idx, sqlerrm;
    end;
    done := done + 1;
  end loop;
  return done;
end;
$$;

CREATE FUNCTION public.control_item_applies(p_item_id uuid, p_audience public.control_audience) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.control_item_audiences where item_id = p_item_id and audience = p_audience);
$$;

CREATE FUNCTION public.control_item_check(p_group_id uuid, p_item_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'); x jsonb; seen text[] := '{}';
begin
  if char_length(clean_name) not between 2 and 80 then raise exception 'Informe um nome com 2 a 80 caracteres'; end if;
  if p_kind is null then raise exception 'Escolha o tipo do item'; end if;
  if p_directorate is null then raise exception 'Escolha a diretoria'; end if;
  if p_audiences is null or jsonb_typeof(p_audiences) <> 'array' or jsonb_array_length(p_audiences) = 0 then raise exception 'Escolha a quem o item se aplica'; end if;
  for x in select value from jsonb_array_elements(p_audiences) loop
    if jsonb_typeof(x) <> 'object' or not pg_input_is_valid(coalesce(x->>'audience', ''), 'public.control_audience') then
      raise exception 'Público inválido';
    end if;
    if (x->>'audience') = any(seen) then raise exception 'Público repetido: %', x->>'audience'; end if;
    seen := seen || (x->>'audience');
    if nullif(x->>'initial_status', '') is not null and not pg_input_is_valid(x->>'initial_status', 'public.control_status') then
      raise exception 'Valor inicial inválido';
    end if;
  end loop;
  if p_validity_months is not null and p_validity_months not between 1 and 120 then raise exception 'Validade: de 1 a 120 meses'; end if;
  if exists (select 1 from public.control_items where group_id = p_group_id and lower(name) = lower(clean_name) and id is distinct from p_item_id) then
    raise exception 'Já existe o item %', clean_name;
  end if;
  return clean_name;
end;
$$;

CREATE FUNCTION public.control_item_create(p_group_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer, p_remove_on_leave boolean, p_value_kind public.control_value_kind DEFAULT 'situacao'::public.control_value_kind) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare new_id uuid; clean_name text;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para alterar itens de controle neste grupo'; end if;
  clean_name := public.control_item_check(p_group_id, null, p_name, p_kind, p_directorate, p_audiences, p_validity_months);
  insert into public.control_items(group_id, name, kind, value_kind, directorate, validity_months, remove_on_leave, position)
  values (p_group_id, clean_name, p_kind, coalesce(p_value_kind, 'situacao'), p_directorate, p_validity_months, coalesce(p_remove_on_leave, false),
    (select coalesce(max(position), 0) + 1 from public.control_items where group_id = p_group_id and directorate = p_directorate))
  returning id into new_id;
  perform public.control_item_save_audiences(new_id, p_group_id, p_audiences);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'control_item.created', 'control_item', new_id::text, public.control_item_snapshot(new_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.control_item_place(p_item_id uuid, p_position integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare item public.control_items%rowtype; total int; target int;
begin
  select * into item from public.control_items where id = p_item_id for update;
  if item.id is null or not public.can_manage_associates(item.group_id) then raise exception 'Item não encontrado ou sem permissão'; end if;
  if p_position is null then raise exception 'Informe a posição'; end if;
  perform public.control_items_renumber(item.group_id, item.directorate);
  select position into item.position from public.control_items where id = item.id;
  select count(*) into total from public.control_items where group_id = item.group_id and directorate = item.directorate;
  target := least(greatest(p_position, 1), total);
  if target = item.position then return; end if;
  if target < item.position then
    update public.control_items set position = position + 1
    where group_id = item.group_id and directorate = item.directorate and position >= target and position < item.position;
  else
    update public.control_items set position = position - 1
    where group_id = item.group_id and directorate = item.directorate and position > item.position and position <= target;
  end if;
  update public.control_items set position = target, updated_at = now() where id = item.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (item.group_id, auth.uid(), 'control_item.placed', 'control_item', item.id::text,
    jsonb_build_object('from', item.position, 'to', target));
end;
$$;

CREATE FUNCTION public.control_item_save_audiences(p_item_id uuid, p_group_id uuid, p_audiences jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from public.control_item_audiences where item_id = p_item_id;
  insert into public.control_item_audiences(item_id, group_id, audience, initial_status)
  select p_item_id, p_group_id, (x->>'audience')::public.control_audience, nullif(x->>'initial_status', '')::public.control_status
  from jsonb_array_elements(p_audiences) x;
$$;

CREATE FUNCTION public.control_item_snapshot(p_item_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('name', i.name, 'kind', i.kind, 'value_kind', i.value_kind, 'directorate', i.directorate,
    'audiences', (select coalesce(jsonb_agg(jsonb_build_object('audience', a.audience, 'initial_status', a.initial_status) order by a.audience), '[]'::jsonb)
                  from public.control_item_audiences a where a.item_id = i.id),
    'validity_months', i.validity_months, 'remove_on_leave', i.remove_on_leave, 'active', i.active, 'position', i.position)
  from public.control_items i where i.id = p_item_id;
$$;

CREATE FUNCTION public.control_item_update(p_item_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer, p_remove_on_leave boolean, p_active boolean, p_value_kind public.control_value_kind DEFAULT NULL::public.control_value_kind) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare item public.control_items%rowtype; before_state jsonb; clean_name text;
begin
  select * into item from public.control_items where id = p_item_id for update;
  if item.id is null or not public.can_manage_associates(item.group_id) then raise exception 'Item não encontrado ou sem permissão'; end if;
  clean_name := public.control_item_check(item.group_id, item.id, p_name, p_kind, p_directorate, p_audiences, p_validity_months);
  before_state := public.control_item_snapshot(item.id);
  update public.control_items set name = clean_name, kind = p_kind, value_kind = coalesce(p_value_kind, value_kind), directorate = p_directorate,
    validity_months = p_validity_months,
    remove_on_leave = coalesce(p_remove_on_leave, remove_on_leave), active = coalesce(p_active, active),
    position = case when p_directorate = item.directorate then position
      else (select coalesce(max(position), 0) + 1 from public.control_items where group_id = item.group_id and directorate = p_directorate) end,
    updated_at = now()
  where id = item.id;
  perform public.control_item_save_audiences(item.id, item.group_id, p_audiences);
  if p_directorate <> item.directorate then perform public.control_items_renumber(item.group_id, item.directorate); end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (item.group_id, auth.uid(), 'control_item.updated', 'control_item', item.id::text,
    jsonb_build_object('before', before_state, 'after', public.control_item_snapshot(item.id)));
end;
$$;

CREATE FUNCTION public.control_items_renumber(p_group_id uuid, p_directorate public.directorate) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.control_items i set position = o.rn
  from (select id, row_number() over (order by position, name) as rn from public.control_items
        where group_id = p_group_id and directorate = p_directorate) o
  where i.id = o.id and i.position <> o.rn;
$$;

CREATE FUNCTION public.control_items_seed(p_group_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare created int;
begin
  with seed(directorate, ord, name, kind, audiences, validity_months, remove_on_leave) as (values
    ('metodos_educativos'::public.directorate, 1, 'Ficha de associação', 'documento'::public.control_item_kind, '{jovem,adulto}'::public.control_audience[], null::int, false),
    ('metodos_educativos', 2, 'Certificado de eleição/nomeação', 'documento', '{adulto}', null, false),
    ('metodos_educativos', 3, 'ATV', 'documento', '{adulto}', null, false),
    ('metodos_educativos', 4, 'PPF', 'documento', '{adulto}', 12, false),
    ('metodos_educativos', 5, 'Seções no Paxtu', 'sistema', '{adulto}', null, false),
    ('metodos_educativos', 6, 'Equipes no Paxtu', 'sistema', '{jovem}', null, false),
    ('metodos_educativos', 7, 'Ficha de aptidão', 'documento', '{adulto,responsavel}', null, false),
    ('metodos_educativos', 8, 'Google Drive', 'sistema', '{adulto}', null, true),
    ('metodos_educativos', 9, 'Calendário', 'sistema', '{adulto}', null, true),
    ('metodos_educativos', 10, 'Curso de brigadista', 'documento', '{adulto}', 24, false),
    ('metodos_educativos', 11, 'Promessa de adulto', 'etapa', '{adulto}', null, false),
    ('metodos_educativos', 12, 'Início do estágio', 'etapa', '{adulto}', null, false),
    ('metodos_educativos', 13, 'Integração', 'etapa', '{jovem,adulto}', null, false),
    ('metodos_educativos', 14, 'Palestra Vamos Falar de Escotismo', 'etapa', '{jovem,adulto}', null, false),
    ('administrativa', 1, 'Dados individuais no Paxtu', 'sistema', '{jovem,adulto,responsavel}', null, false),
    ('administrativa', 2, 'Ficha médica impressa', 'documento', '{jovem,adulto}', 12, false),
    ('administrativa', 3, 'Autorização de viagem (cartório)', 'documento', '{jovem}', null, false),
    ('administrativa', 4, 'Termo de consentimento', 'documento', '{jovem}', null, false),
    ('administrativa', 5, 'Login no Paxtu', 'sistema', '{adulto}', null, true),
    ('administrativa', 6, 'Ano-base do registro', 'documento', '{jovem,adulto}', null, false),
    ('administrativa', 7, 'Validade do registro', 'documento', '{jovem,adulto}', null, false),
    ('comunicacao', 1, 'Contatos no e-mail do GEAS', 'canal', '{jovem,adulto,responsavel}', null, true),
    ('comunicacao', 2, 'Lista de e-mails Adultos GEAS', 'canal', '{adulto}', null, true),
    ('comunicacao', 3, 'Instagram do GEAS', 'canal', '{jovem,adulto,responsavel}', null, true),
    ('comunicacao', 4, 'Twitter do GEAS', 'canal', '{jovem,adulto,responsavel}', null, true),
    ('comunicacao', 5, 'WhatsApp GEAS Brothers', 'canal', '{adulto}', null, true),
    ('comunicacao', 6, 'WhatsApp Só Avisos', 'canal', '{adulto,responsavel}', null, true),
    ('comunicacao', 7, 'Site', 'canal', '{adulto}', null, true)
  ), value_kinds(name, value_kind) as (values
    ('Ano-base do registro', 'ano'::public.control_value_kind),
    ('Validade do registro', 'data')
  ), missing as (
    select s.*, coalesce(v.value_kind, 'situacao') as value_kind from seed s left join value_kinds v on v.name = s.name
    where not exists (select 1 from public.control_items i where i.group_id = p_group_id and lower(i.name) = lower(s.name))
  ), ins as (
    insert into public.control_items(group_id, name, kind, value_kind, directorate, validity_months, remove_on_leave, position)
    select p_group_id, m.name, m.kind, m.value_kind, m.directorate, m.validity_months, m.remove_on_leave,
      coalesce((select max(position) from public.control_items i where i.group_id = p_group_id and i.directorate = m.directorate), 0)
        + row_number() over (partition by m.directorate order by m.ord)
    from missing m
    returning id, name, value_kind
  ), aud as (
    insert into public.control_item_audiences(item_id, group_id, audience, initial_status)
    select ins.id, p_group_id, a.audience, case when ins.value_kind = 'situacao' then 'pendente'::public.control_status end
    from ins join seed s on s.name = ins.name cross join unnest(s.audiences) a(audience)
    returning 1
  )
  select count(*) into created from ins;
  return created;
end;
$$;

CREATE FUNCTION public.control_status_check(p_group_id uuid, p_item_id uuid, p_audience public.control_audience, p_who text, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer, OUT o_status public.control_status, OUT o_valid_until date) RETURNS record
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare item public.control_items%rowtype;
begin
  select * into item from public.control_items where id = p_item_id and group_id = p_group_id;
  if item.id is null then raise exception 'Item de controle não encontrado'; end if;
  if not item.active then raise exception 'O item % está desativado', item.name; end if;
  if p_audience is null or not public.control_item_applies(item.id, p_audience) then raise exception 'O item % não se aplica a este %', item.name, p_who; end if;
  if p_value_year is not null and item.value_kind <> 'ano' then raise exception 'O item % não guarda ano', item.name; end if;
  if p_value_year not between 1900 and 2100 then raise exception 'Ano: de 1900 a 2100'; end if;
  o_status := coalesce(p_status, case when (item.value_kind = 'ano' and p_value_year is not null)
    or (item.value_kind = 'data' and p_valid_until is not null) then 'ok'::public.control_status end);
  if o_status is null then
    raise exception '%', case item.value_kind when 'ano' then 'Informe o ano ou escolha a situação'
      when 'data' then 'Informe a data ou escolha a situação' else 'Escolha a situação' end;
  end if;
  if p_status_date > current_date then raise exception 'A data da situação não pode ser futura'; end if;
  if char_length(p_note) > 200 then raise exception 'Observação: no máximo 200 caracteres'; end if;
  o_valid_until := p_valid_until;
  if o_status = 'ok' and o_valid_until is null and item.validity_months is not null then
    o_valid_until := (coalesce(p_status_date, current_date) + make_interval(months => item.validity_months))::date;
  end if;
  if item.value_kind <> 'data' and o_valid_until < p_status_date then raise exception 'A validade não pode ser antes da data'; end if;
end;
$$;

CREATE FUNCTION public.control_status_clear(p_associate_id uuid, p_item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare associate_group uuid; before_state jsonb;
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_manage_associates(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  before_state := public.control_status_snapshot(p_associate_id, p_item_id);
  if before_state is null then return; end if;
  delete from public.control_statuses where associate_id = p_associate_id and item_id = p_item_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'control_status.cleared', 'associate', p_associate_id::text, jsonb_build_object('before', before_state));
end;
$$;

CREATE FUNCTION public.control_status_clear_relative(p_relative_id uuid, p_item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare relative_group uuid; before_state jsonb;
begin
  select group_id into relative_group from public.relatives where id = p_relative_id;
  if relative_group is null or not public.can_manage_associates(relative_group) then raise exception 'Responsável não encontrado ou sem permissão'; end if;
  before_state := public.control_status_snapshot_relative(p_relative_id, p_item_id);
  if before_state is null then return; end if;
  delete from public.control_statuses where relative_id = p_relative_id and item_id = p_item_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (relative_group, auth.uid(), 'control_status.cleared', 'relative', p_relative_id::text, jsonb_build_object('before', before_state));
end;
$$;

CREATE FUNCTION public.control_status_set(p_associate_id uuid, p_item_id uuid, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype; before_state jsonb; checked record; clean_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into a from public.associates where id = p_associate_id;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  select * into checked from public.control_status_check(a.group_id, p_item_id, public.associate_audience_of(a.id), 'associado', p_status, p_status_date, p_valid_until, clean_note, p_value_year);
  before_state := public.control_status_snapshot(a.id, p_item_id);
  insert into public.control_statuses(group_id, associate_id, item_id, status, status_date, valid_until, value_year, note, updated_by, updated_at)
  values (a.group_id, a.id, p_item_id, checked.o_status, p_status_date, checked.o_valid_until, p_value_year, clean_note, auth.uid(), now())
  on conflict (associate_id, item_id) do update set status = excluded.status, status_date = excluded.status_date,
    valid_until = excluded.valid_until, value_year = excluded.value_year, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'control_status.set', 'associate', a.id::text,
    jsonb_build_object('before', before_state, 'after', public.control_status_snapshot(a.id, p_item_id)));
end;
$$;

CREATE FUNCTION public.control_status_set_relative(p_relative_id uuid, p_item_id uuid, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r public.relatives%rowtype; before_state jsonb; checked record; clean_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into r from public.relatives where id = p_relative_id;
  if r.id is null or not public.can_manage_associates(r.group_id) then raise exception 'Responsável não encontrado ou sem permissão'; end if;
  select * into checked from public.control_status_check(r.group_id, p_item_id, 'responsavel', 'responsável', p_status, p_status_date, p_valid_until, clean_note, p_value_year);
  before_state := public.control_status_snapshot_relative(r.id, p_item_id);
  insert into public.control_statuses(group_id, relative_id, item_id, status, status_date, valid_until, value_year, note, updated_by, updated_at)
  values (r.group_id, r.id, p_item_id, checked.o_status, p_status_date, checked.o_valid_until, p_value_year, clean_note, auth.uid(), now())
  on conflict (relative_id, item_id) do update set status = excluded.status, status_date = excluded.status_date,
    valid_until = excluded.valid_until, value_year = excluded.value_year, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (r.group_id, auth.uid(), 'control_status.set', 'relative', r.id::text,
    jsonb_build_object('before', before_state, 'after', public.control_status_snapshot_relative(r.id, p_item_id)));
end;
$$;

CREATE FUNCTION public.control_status_snapshot(p_associate_id uuid, p_item_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('item_id', s.item_id, 'status', s.status, 'status_date', s.status_date, 'valid_until', s.valid_until, 'value_year', s.value_year, 'note', s.note)
  from public.control_statuses s where s.associate_id = p_associate_id and s.item_id = p_item_id;
$$;

CREATE FUNCTION public.control_status_snapshot_relative(p_relative_id uuid, p_item_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('item_id', s.item_id, 'status', s.status, 'status_date', s.status_date, 'valid_until', s.valid_until, 'value_year', s.value_year, 'note', s.note)
  from public.control_statuses s where s.relative_id = p_relative_id and s.item_id = p_item_id;
$$;

CREATE FUNCTION public.control_statuses_init(p_group_id uuid, p_associate_id uuid, p_relative_id uuid, p_audience public.control_audience) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare created int;
begin
  insert into public.control_statuses(group_id, associate_id, relative_id, item_id, status, status_date, valid_until, updated_by, updated_at)
  select p_group_id, p_associate_id, p_relative_id, i.id, a.initial_status, current_date,
    case when a.initial_status = 'ok' and i.validity_months is not null then (current_date + make_interval(months => i.validity_months))::date end,
    auth.uid(), now()
  from public.control_items i
  join public.control_item_audiences a on a.item_id = i.id and a.audience = p_audience
  where i.group_id = p_group_id and i.active and a.initial_status is not null
  on conflict do nothing;
  get diagnostics created = row_count;
  return created;
end;
$$;

CREATE FUNCTION public.create_account(p_group_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text, p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.create_category(p_group_id uuid, p_parent_id uuid, p_name text, p_ledger_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare new_id uuid; parent public.categories;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar rubricas neste grupo'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Informe um nome com 2 a 100 caracteres'; end if;
  parent := public.check_category_parent(p_group_id, p_parent_id, 0);
  insert into public.categories(group_id, parent_id, position, name, ledger_code, kind)
  values (p_group_id, parent.id, public.next_category_position(parent.id), trim(p_name), nullif(trim(p_ledger_code), ''), parent.kind)
  returning id into new_id;
  perform public.renumber_categories(p_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'category.created', 'category', new_id::text, public.category_snapshot(new_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.create_entries_from_statement_lines(p_items jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  item jsonb;
  idx bigint;
  line public.statement_lines%rowtype;
  category uuid;
  entry_name text;
  split_description text;
  created int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Nenhuma linha selecionada'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Crie no máximo 500 lançamentos por vez'; end if;
  for item, idx in select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    select * into line from public.statement_lines where id = (item->>'lineId')::uuid;
    if line.id is null then raise exception 'Item %: linha do extrato não encontrada', idx; end if;
    category := nullif(item->>'categoryId', '')::uuid;
    if category is null then
      select id into category from public.categories
      where group_id = line.group_id and active and code = case when line.amount_cents > 0 then '1' else '2' end;
      if category is null then raise exception 'Cadastre (ou reative) as rubricas raiz 1 Receitas e 2 Despesas'; end if;
    end if;
    entry_name := left(coalesce(nullif(trim(item->>'name'), ''), line.counterparty, line.description), 200);
    if char_length(entry_name) < 2 then entry_name := 'Extrato ' || to_char(line.line_date, 'DD/MM'); end if;
    split_description := left(coalesce(nullif(trim(item->>'description'), ''), line.kind, line.description), 200);
    if char_length(split_description) < 2 then split_description := 'Importado do extrato'; end if;
    begin
      perform public.create_entry_from_statement_line(line.id, line.line_date, entry_name,
        nullif(item->>'paymentMethodId', '')::uuid, null, false, line.amount_cents,
        jsonb_build_array(jsonb_build_object('category_id', category, 'amount_cents', line.amount_cents, 'description', split_description)));
    exception when others then
      raise exception 'Linha de % (%): %', to_char(line.line_date, 'DD/MM/YYYY'), left(coalesce(line.counterparty, line.description), 40), sqlerrm;
    end;
    created := created + 1;
  end loop;
  return created;
end;
$$;

CREATE FUNCTION public.create_entry_from_statement_line(p_statement_line_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  line public.statement_lines%rowtype;
  new_entry_id uuid;
begin
  select * into line from public.statement_lines where id = p_statement_line_id for update;
  if line.id is null or not public.can_edit_group(line.group_id) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if line.status <> 'aberta' then raise exception 'A linha do extrato já foi conciliada ou ignorada'; end if;
  if p_total_cents is distinct from line.amount_cents then raise exception 'O total do lançamento precisa ser igual ao valor da linha do extrato'; end if;

  new_entry_id := public.create_ledger_entry(line.group_id, coalesce(p_entry_date, line.line_date), p_name, p_payment_method_id,
    p_document, p_document_filed, p_total_cents, p_splits, line.account_id, p_notes);
  perform public.link_reconciliation(array[line.id], array[new_entry_id]);
  return new_entry_id;
end;
$$;

CREATE FUNCTION public.create_ledger_entry(p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  if char_length(p_notes) > 2000 then raise exception 'Observações: no máximo 2.000 caracteres'; end if;
  entry_account := public.resolve_entry_account(p_group_id, p_payment_method_id, p_account_id);

  insert into public.ledger_entries (group_id, entry_date, name, account_id, payment_method_id, document, document_filed, total_cents, created_by, notes)
  values (p_group_id, p_entry_date, trim(p_name), entry_account, p_payment_method_id, nullif(trim(p_document), ''), coalesce(p_document_filed, false), p_total_cents, auth.uid(), nullif(trim(p_notes), ''))
  returning id into new_entry_id;

  perform public.write_entry_splits(new_entry_id, p_group_id, p_splits);
  return new_entry_id;
end;
$$;

CREATE FUNCTION public.create_patrol(p_section_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare section_group uuid; section_branch public.scout_branch; new_id uuid;
  clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select group_id, branch into section_group, section_branch from public.sections where id = p_section_id;
  if section_group is null or not public.can_manage_associates(section_group) then raise exception 'Seção não encontrada ou sem permissão'; end if;
  if section_branch not in ('lobinho', 'escoteiro', 'senior') then raise exception 'Esta seção não se divide em equipes'; end if;
  if char_length(clean_name) not between 2 and 60 then raise exception 'Informe um nome de equipe com 2 a 60 caracteres'; end if;
  if exists (select 1 from public.patrols where section_id = p_section_id and lower(name) = lower(clean_name)) then
    raise exception 'Já existe a equipe % nesta seção', clean_name;
  end if;
  insert into public.patrols(group_id, section_id, name) values (section_group, p_section_id, clean_name) returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (section_group, auth.uid(), 'patrol.created', 'patrol', new_id::text, public.patrol_snapshot(new_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.create_payment_method(p_group_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.create_quick_ledger_entry(p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_total_cents bigint, p_category_id uuid, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare new_id uuid;
begin
  new_id := public.create_ledger_entry(p_group_id, p_entry_date, p_name, p_payment_method_id, null, false, p_total_cents,
    jsonb_build_array(jsonb_build_object('category_id', p_category_id, 'amount_cents', p_total_cents, 'description', coalesce(nullif(trim(p_description), ''), trim(p_name)))),
    null, p_notes);
  update public.ledger_entries set review_status = 'para_revisar' where id = new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'ledger_entry.quick', 'ledger_entry', new_id::text, jsonb_build_object('channel', 'rapido'));
  return new_id;
end;
$$;

CREATE FUNCTION public.create_section(p_group_id uuid, p_branch public.scout_branch, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare new_id uuid; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para alterar seções neste grupo'; end if;
  if p_branch is null then raise exception 'Escolha o ramo da seção'; end if;
  if p_branch = 'adulto' then raise exception 'Adultos não têm seção: são só o ramo'; end if;
  if char_length(clean_name) not between 2 and 60 then raise exception 'Informe um nome de seção com 2 a 60 caracteres'; end if;
  if exists (select 1 from public.sections where group_id = p_group_id and lower(name) = lower(clean_name)) then
    raise exception 'Já existe a seção %', clean_name;
  end if;
  insert into public.sections(group_id, branch, name) values (p_group_id, p_branch, clean_name) returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'section.created', 'section', new_id::text, public.section_snapshot(new_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.debt_money(p_cents bigint) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  select 'R$ ' || (p_cents / 100)::text || ',' || lpad((abs(p_cents) % 100)::text, 2, '0');
$_$;

CREATE FUNCTION public.debt_payment_cents(p_entry_id uuid, p_associate_id uuid) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(sum(s.amount_cents), 0)::bigint from public.entry_splits s join public.categories c on c.id = s.category_id
  where s.entry_id = p_entry_id and s.associate_id = p_associate_id and c.kind = 'receita';
$$;

CREATE FUNCTION public.debt_rows(p_group_id uuid) RETURNS TABLE(id uuid, debt_date date, amount_cents bigint, paid_cents bigint, description text, agreement text, associate_id uuid, associate_name text, debtor_number integer, payments jsonb, payment_mismatch boolean, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with access as (select public.is_group_member(p_group_id) as member, public.can_edit_group(p_group_id) as editor),
  debtors as (
    select associate_id, dense_rank() over (order by min(created_at), min(debt_date), associate_id)::integer as debtor_number
    from public.debts where group_id = p_group_id group by associate_id
  ),
  alloc as (
    select p.debt_id, p.entry_id, p.amount_cents, public.debt_payment_cents(p.entry_id, d.associate_id) as available,
      sum(p.amount_cents) over (partition by p.entry_id, d.associate_id order by d.debt_date, d.created_at, d.id rows unbounded preceding) as running,
      sum(p.amount_cents) over (partition by p.entry_id, d.associate_id) as entry_allocated
    from public.debt_payments p join public.debts d on d.id = p.debt_id where d.group_id = p_group_id
  ),
  effective as (select *, greatest(0, least(amount_cents, available - (running - amount_cents)))::bigint as paid from alloc)
  select d.id, d.debt_date, d.amount_cents,
    coalesce((select sum(x.paid) from effective x where x.debt_id = d.id), 0)::bigint,
    d.description, d.agreement,
    case when access.editor then d.associate_id end,
    case when access.editor then a.name end,
    debtors.debtor_number,
    case when access.editor then coalesce((
      select jsonb_agg(jsonb_build_object('entryId', e.id, 'entryDate', e.entry_date, 'entryName', e.name,
        'amountCents', x.amount_cents, 'paidCents', x.paid, 'entryAvailableCents', x.available,
        'entryUnallocatedCents', x.available - x.entry_allocated) order by e.entry_date, e.id)
      from effective x join public.ledger_entries e on e.id = x.entry_id
      where x.debt_id = d.id), '[]'::jsonb) end,
    case when access.editor then exists (select 1 from effective x where x.debt_id = d.id and x.paid < x.amount_cents) end,
    d.updated_at
  from public.debts d
  cross join access
  join public.associates a on a.id = d.associate_id
  join debtors on debtors.associate_id = d.associate_id
  where d.group_id = p_group_id and access.member
  order by d.debt_date desc, d.created_at desc;
$$;

CREATE FUNCTION public.debt_snapshot(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('associate_id', d.associate_id, 'debt_date', d.debt_date, 'amount_cents', d.amount_cents,
    'description', d.description, 'agreement', d.agreement,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'amount_cents', p.amount_cents) order by p.entry_id)
      from public.debt_payments p where p.debt_id = d.id), '[]'::jsonb))
  from public.debts d where d.id = p_id;
$$;

CREATE FUNCTION public.delete_associate_movement(p_movement_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare movement public.associate_movements%rowtype;
begin
  select * into movement from public.associate_movements where id = p_movement_id for update;
  if movement.id is null or not public.can_edit_group(movement.group_id) then raise exception 'Movimentação não encontrada ou sem permissão'; end if;
  delete from public.associate_movements where id = p_movement_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (movement.group_id, auth.uid(), 'associate.movement_removed', 'associate', movement.associate_id::text,
    jsonb_build_object('date', movement.movement_date, 'kind', movement.kind, 'reason', movement.reason));
end;
$$;

CREATE FUNCTION public.delete_debt(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare debt_group uuid; before_state jsonb;
begin
  select group_id into debt_group from public.debts where id = p_id;
  if debt_group is null or not public.can_edit_group(debt_group) then raise exception 'Dívida não encontrada ou sem permissão'; end if;
  before_state := public.debt_snapshot(p_id);
  delete from public.debts where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (debt_group, auth.uid(), 'debt.deleted', 'debt', p_id::text, jsonb_build_object('before', before_state));
end;
$$;

CREATE FUNCTION public.delete_entry_attachment(p_attachment_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare attachment public.entry_attachments;
begin
  select * into attachment from public.entry_attachments where id = p_attachment_id for update;
  if attachment.id is null or not public.can_edit_group(attachment.group_id) then raise exception 'Anexo não encontrado ou sem permissão'; end if;
  delete from public.entry_attachments where id = p_attachment_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (attachment.group_id, auth.uid(), 'ledger_entry.attachment_removed', 'ledger_entry', attachment.entry_id::text,
    jsonb_build_object('attachment_id', attachment.id, 'file_name', attachment.file_name, 'content_type', attachment.content_type,
      'size_bytes', attachment.size_bytes, 'storage_path', attachment.storage_path));
  return attachment.storage_path;
end;
$$;

CREATE FUNCTION public.delete_import_profile(p_profile_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  profile public.import_profiles;
  used_by int;
begin
  select * into profile from public.import_profiles where id = p_profile_id for update;
  if profile.id is null or not public.can_edit_group(profile.group_id) then raise exception 'Perfil não encontrado'; end if;
  select count(*) into used_by from public.statement_imports where profile_id = profile.id;

  delete from public.import_profiles where id = profile.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (profile.group_id, auth.uid(), 'import_profile.deleted', 'import_profile', profile.id::text,
    jsonb_build_object('before', jsonb_build_object('name', profile.name, 'format', profile.format,
      'header_signature', profile.header_signature, 'settings', profile.settings), 'imports', used_by));
  return jsonb_build_object('imports', used_by);
end;
$$;

CREATE FUNCTION public.delete_ledger_entry(p_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare entry_group uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.deleted', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('before', public.ledger_entry_snapshot(p_entry_id)));
  delete from public.ledger_entries where id = p_entry_id;
end;
$$;

CREATE FUNCTION public.delete_statement_import(p_import_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  import_row public.statement_imports%rowtype;
  set_ids uuid[];
  unlinked int := 0;
  removed int;
begin
  select * into import_row from public.statement_imports where id = p_import_id for update;
  if import_row.id is null or not public.can_edit_group(import_row.group_id) then raise exception 'Importação não encontrada ou sem permissão'; end if;
  select array_agg(distinct rl.link_set_id) into set_ids
  from public.reconciliation_links rl join public.statement_lines l on l.id = rl.statement_line_id
  where l.import_id = p_import_id;
  if set_ids is not null then unlinked := public.dissolve_reconciliation_sets(set_ids, 'importação desfeita'); end if;
  delete from public.statement_lines where import_id = p_import_id;
  get diagnostics removed = row_count;
  delete from public.statement_imports where id = p_import_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (import_row.group_id, auth.uid(), 'statement.import_deleted', 'statement_import', p_import_id::text,
    jsonb_build_object('account_id', import_row.account_id, 'file_name', import_row.file_name,
      'period_from', import_row.period_from, 'period_to', import_row.period_to, 'lines', removed, 'unlinked_sets', unlinked));
  return jsonb_build_object('lines', removed, 'unlinked', unlinked);
end;
$$;

CREATE FUNCTION public.dissolve_reconciliation_sets(p_set_ids uuid[], p_reason text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  s record;
  dissolved int := 0;
begin
  for s in
    select rl.link_set_id, min(l.group_id::text)::uuid as group_id,
      array_agg(distinct rl.statement_line_id) as line_ids, array_agg(distinct rl.ledger_entry_id) as entry_ids,
      jsonb_agg(jsonb_build_object('statement_line_id', rl.statement_line_id, 'ledger_entry_id', rl.ledger_entry_id, 'amount_cents', rl.amount_cents)) as links
    from public.reconciliation_links rl
    join public.statement_lines l on l.id = rl.statement_line_id
    where rl.link_set_id = any(p_set_ids)
    group by rl.link_set_id
  loop
    delete from public.reconciliation_links where link_set_id = s.link_set_id;
    update public.statement_lines set status = 'aberta'
    where id = any(s.line_ids) and status = 'conciliada'
      and not exists (select 1 from public.reconciliation_links rl where rl.statement_line_id = statement_lines.id);
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (s.group_id, auth.uid(), 'reconciliation.unlinked', 'reconciliation', s.link_set_id::text,
      jsonb_build_object('reason', p_reason, 'statement_line_ids', to_jsonb(s.line_ids), 'ledger_entry_ids', to_jsonb(s.entry_ids), 'links', s.links));
    dissolved := dissolved + 1;
  end loop;
  return dissolved;
end;
$$;

CREATE FUNCTION public.entry_external_ids(p_entry_id uuid) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(distinct l.external_id order by l.external_id) filter (where l.external_id is not null), '{}')
  from public.reconciliation_links rl
  join public.statement_lines l on l.id = rl.statement_line_id
  where rl.ledger_entry_id = p_entry_id;
$$;

CREATE FUNCTION public.fallback_account(p_group_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.fee_category_ids(p_group_id uuid) RETURNS uuid[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with recursive tree as (
    select s.category_id as id from public.fee_settings s where s.group_id = p_group_id and s.category_id is not null
    union
    select c.id from public.categories c join tree t on c.parent_id = t.id
  )
  select coalesce(array_agg(id), '{}') from tree;
$$;

CREATE FUNCTION public.fee_record_snapshot(p_record_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('status', r.status, 'note', r.note,
    'split_ids', coalesce((select jsonb_agg(rs.split_id order by rs.split_id) from public.fee_record_splits rs where rs.fee_record_id = r.id), '[]'::jsonb))
  from public.fee_records r where r.id = p_record_id;
$$;

CREATE FUNCTION public.group_users(p_group_id uuid) RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamp with time zone, role public.member_role, inventory_role public.inventory_role, associates_role public.associates_role)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = auth.uid() and m.role = 'admin') then
    raise exception 'Apenas administradores do grupo gerenciam usuários';
  end if;
  return query
  select m.user_id, u.email, u.last_sign_in_at, m.role, m.inventory_role, m.associates_role
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.group_id = p_group_id
  order by m.created_at, u.email;
end;
$$;

CREATE FUNCTION public.groups_seed_control_items() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.control_items_seed(new.id);
  return null;
end;
$$;

CREATE FUNCTION public.ignore_statement_line(p_id uuid, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare line_group uuid; line_status public.statement_line_status;
begin
  select group_id, status into line_group, line_status from public.statement_lines where id = p_id for update;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if line_status <> 'aberta' then raise exception 'Só linhas abertas podem ser ignoradas'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 200 then raise exception 'Informe o motivo (até 200 caracteres)'; end if;
  update public.statement_lines set status = 'ignorada', ignored_reason = trim(p_reason) where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (line_group, auth.uid(), 'statement_line.ignored', 'statement_line', p_id::text, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

CREATE FUNCTION public.ignore_statement_lines(p_ids uuid[], p_reason text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare line_id uuid; done int := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Nenhuma linha selecionada'; end if;
  if cardinality(p_ids) > 1000 then raise exception 'Seleção grande demais'; end if;
  foreach line_id in array p_ids loop
    perform public.ignore_statement_line(line_id, p_reason);
    done := done + 1;
  end loop;
  return done;
end;
$$;

CREATE FUNCTION public.import_associates(p_group_id uuid, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  row_data jsonb;
  idx bigint;
  row_id uuid;
  row_name text;
  row_branch public.scout_branch;
  section_name text;
  patrol_name text;
  row_section uuid;
  row_patrol uuid;
  row_active boolean;
  old_active boolean;
  created int := 0;
  updated int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para gerir associados neste grupo'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nenhum associado para importar'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Importe no máximo 5.000 associados por vez'; end if;

  for row_data, idx in select value, ordinality from jsonb_array_elements(p_rows) with ordinality
  loop
    row_name := regexp_replace(trim(coalesce(row_data->>'name', '')), '\s+', ' ', 'g');
    if char_length(row_name) not between 2 and 120 then raise exception 'Linha %: nome com 2 a 120 caracteres', idx; end if;
    if not pg_input_is_valid(coalesce(row_data->>'branch', ''), 'public.scout_branch') then raise exception 'Linha %: ramo inválido', idx; end if;
    row_branch := (row_data->>'branch')::public.scout_branch;
    section_name := nullif(regexp_replace(trim(coalesce(row_data->>'section', '')), '\s+', ' ', 'g'), '');
    patrol_name := nullif(regexp_replace(trim(coalesce(row_data->>'patrol', '')), '\s+', ' ', 'g'), '');
    row_section := null;
    row_patrol := null;
    if section_name is not null then
      select id into row_section from public.sections
      where group_id = p_group_id and branch = row_branch and lower(name) = lower(section_name);
      if row_section is null then raise exception 'Linha %: seção "%" não cadastrada no ramo', idx, section_name; end if;
    end if;
    if patrol_name is not null then
      if row_section is null then raise exception 'Linha %: patrulha sem seção', idx; end if;
      select id into row_patrol from public.patrols where section_id = row_section and lower(name) = lower(patrol_name);
      if row_patrol is null then raise exception 'Linha %: patrulha "%" não cadastrada na seção', idx, patrol_name; end if;
    end if;
    row_active := coalesce((row_data->>'active')::boolean, true);
    row_id := nullif(row_data->>'id', '')::uuid;

    if row_id is null then
      insert into public.associates(group_id, name, branch, section_id, patrol_id, active)
      values (p_group_id, row_name, row_branch, row_section, row_patrol, row_active)
      returning id into row_id;
      perform public.control_statuses_init(p_group_id, row_id, null, public.associate_audience_of(row_id));
      created := created + 1;
    else
      select active into old_active from public.associates where id = row_id and group_id = p_group_id for update;
      if not found then raise exception 'Linha %: associado não encontrado', idx; end if;
      update public.associates set branch = row_branch, section_id = row_section, patrol_id = row_patrol, active = row_active, updated_at = now()
      where id = row_id;
      if old_active is distinct from row_active then
        insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
        values (p_group_id, row_id, current_date, case when row_active then 'entrada' else 'saida' end::public.associate_movement_kind, 'Importação', auth.uid());
      end if;
      updated := updated + 1;
    end if;
  end loop;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associates.imported', 'associate', p_group_id::text,
    jsonb_build_object('created', created, 'updated', updated));
  return jsonb_build_object('created', created, 'updated', updated);
end;
$$;

CREATE FUNCTION public.import_statement_lines(p_account_id uuid, p_profile_id uuid, p_profile_settings jsonb, p_file_name text, p_period_from date, p_period_to date, p_opening_balance_cents bigint, p_closing_balance_cents bigint, p_lines jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  account_group uuid;
  account_active boolean;
  used_settings jsonb := p_profile_settings;
  line jsonb;
  idx bigint;
  total int;
  inserted int;
  skipped int;
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
    if line ? 'skip' and jsonb_typeof(line->'skip') not in ('boolean', 'null') then raise exception 'Linha %: skip inválido', idx; end if;
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
      nullif(trim(t.v->>'payee'), '') as payee,
      coalesce((t.v->>'skip')::boolean, false) as skip
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
  from numbered where not skip order by ord
  on conflict do nothing;
  get diagnostics inserted = row_count;
  select count(*) into skipped from jsonb_array_elements(p_lines) v where coalesce((v->>'skip')::boolean, false);

  update public.statement_imports set line_count = inserted, duplicate_count = total - skipped - inserted where id = new_import_id;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (account_group, auth.uid(), 'statement.imported', 'statement_import', new_import_id::text,
    jsonb_build_object('account_id', p_account_id, 'profile_id', p_profile_id, 'file_name', p_file_name,
      'period_from', coalesce(p_period_from, first_date), 'period_to', coalesce(p_period_to, last_date),
      'inserted', inserted, 'skipped_duplicates', total - skipped - inserted, 'skipped_by_user', skipped));

  return jsonb_build_object('import_id', new_import_id, 'inserted', inserted, 'skipped_duplicates', total - skipped - inserted,
    'skipped_by_user', skipped);
end;
$_$;

CREATE FUNCTION public.inventory_add_lot(p_material_id uuid, p_location_id uuid, p_quantity integer, p_condition public.inventory_condition, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text, p_variant text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare m public.inventory_materials; target public.inventory_lots; result uuid; merged boolean := false;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_edit_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if m.tracking <> 'lot' then raise exception 'Este material é controlado por peça: cadastre as peças'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'A quantidade deve ser positiva'; end if;
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  perform public.inventory_check_location(m.group_id, p_location_id);
  target := public.inventory_matching_lot(m.id, p_location_id, p_condition, p_expires_on, p_variant, null);
  if target.id is not null then
    update public.inventory_lots set quantity = quantity + p_quantity,
      unit_value_cents = public.inventory_merged_value(unit_value_cents, quantity, p_unit_value_cents, p_quantity), updated_at = now()
    where id = target.id;
    result := target.id; merged := true;
  else
    insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes, variant)
    values (m.group_id, m.id, p_location_id, p_quantity, p_condition, p_unit_value_cents, p_expires_on, p_acquired_on, coalesce(p_origin, 'nao_informada'),
      public.inventory_clean(p_supplier), public.inventory_clean(p_invoice), public.inventory_clean(p_notes), public.inventory_clean(p_variant))
    returning id into result;
  end if;
  perform public.inventory_log(m.group_id, 'entrada', m.id, result, null, p_quantity, null, p_location_id, null, p_condition, null, p_notes,
    jsonb_strip_nulls(jsonb_build_object('origin', coalesce(p_origin, 'nao_informada'), 'unit_value_cents', p_unit_value_cents, 'expires_on', p_expires_on,
      'acquired_on', p_acquired_on, 'supplier', public.inventory_clean(p_supplier), 'invoice', public.inventory_clean(p_invoice),
      'variant', public.inventory_clean(p_variant), 'merged', merged,
      'from', case when merged then target.quantity end, 'to', case when merged then target.quantity + p_quantity end)));
  return result;
end;
$$;

CREATE FUNCTION public.inventory_add_unit(p_material_id uuid, p_location_id uuid, p_tag text, p_legacy_code text, p_description text, p_condition public.inventory_condition, p_unit_value_cents bigint, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare m public.inventory_materials; new_id uuid; clean_tag text;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_edit_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if m.tracking <> 'unit' then raise exception 'Este material é controlado por quantidade: cadastre um lote'; end if;
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  perform public.inventory_check_location(m.group_id, p_location_id);
  clean_tag := public.inventory_check_tag(m.group_id, m.id, null, p_tag);
  insert into public.inventory_units(group_id, material_id, location_id, tag, legacy_code, description, condition, unit_value_cents, acquired_on, origin, supplier, invoice, notes)
  values (m.group_id, m.id, p_location_id, clean_tag, public.inventory_clean(p_legacy_code), public.inventory_clean(p_description), p_condition, p_unit_value_cents,
    p_acquired_on, coalesce(p_origin, 'nao_informada'), public.inventory_clean(p_supplier), public.inventory_clean(p_invoice), public.inventory_clean(p_notes))
  returning id into new_id;
  perform public.inventory_log(m.group_id, 'entrada', m.id, null, new_id, 1, null, p_location_id, null, p_condition, null, p_notes,
    jsonb_build_object('tag', clean_tag, 'origin', coalesce(p_origin, 'nao_informada'), 'unit_value_cents', p_unit_value_cents));
  return new_id;
end;
$$;

CREATE FUNCTION public.inventory_adjust_lot(p_lot_id uuid, p_quantity integer, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id);
begin
  if p_quantity is null or p_quantity < 0 then raise exception 'Informe a quantidade contada'; end if;
  if p_quantity = lot.quantity then raise exception 'A quantidade não mudou'; end if;
  if public.inventory_clean(p_notes) is null then raise exception 'Explique o ajuste na observação'; end if;
  update public.inventory_lots set quantity = p_quantity, updated_at = now() where id = lot.id;
  perform public.inventory_log(lot.group_id, 'ajuste', lot.material_id, lot.id, null, abs(p_quantity - lot.quantity), null, null, null, null, null, p_notes,
    jsonb_build_object('from', lot.quantity, 'to', p_quantity));
end;
$$;

CREATE FUNCTION public.inventory_check_location(p_group_id uuid, p_location_id uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_location_id is null or not exists (select 1 from public.inventory_locations where id = p_location_id and group_id = p_group_id and active) then
    raise exception 'Escolha uma divisão ativa';
  end if;
end;
$$;

CREATE FUNCTION public.inventory_check_tag(p_group_id uuid, p_material_id uuid, p_unit_id uuid, p_tag text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare clean_tag text := upper(public.inventory_clean(p_tag)); family_code text;
begin
  if clean_tag is null then return null; end if;
  if clean_tag !~ '^GEAS-[0-9]{3}-[0-9]{4}$' then raise exception 'A etiqueta segue o formato GEAS-000-0000'; end if;
  select f.code into family_code from public.inventory_materials m left join public.inventory_families f on f.id = m.family_id where m.id = p_material_id;
  if family_code is null then raise exception 'Defina a família do material, com código, antes de etiquetar'; end if;
  if substr(clean_tag, 6, 3) <> family_code then raise exception 'A etiqueta deve começar com GEAS-%- (código da família)', family_code; end if;
  if exists (select 1 from public.inventory_units where group_id = p_group_id and tag = clean_tag and id is distinct from p_unit_id) then
    raise exception 'A etiqueta % já está em uso', clean_tag;
  end if;
  return clean_tag;
end;
$_$;

CREATE FUNCTION public.inventory_clean(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select nullif(regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g'), '');
$$;

CREATE FUNCTION public.inventory_condition_rank(c public.inventory_condition) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case c when 'novo' then 1 when 'bom' then 2 when 'regular' then 3 when 'manutencao' then 4 when 'ruim' then 5 when 'inservivel' then 6 end
$$;

CREATE TABLE public.inventory_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    material_id uuid NOT NULL,
    location_id uuid NOT NULL,
    quantity integer NOT NULL,
    condition public.inventory_condition,
    unit_value_cents bigint,
    expires_on date,
    acquired_on date,
    origin public.inventory_origin DEFAULT 'nao_informada'::public.inventory_origin NOT NULL,
    supplier text,
    invoice text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variant text,
    CONSTRAINT inventory_lots_invoice_check CHECK ((char_length(invoice) <= 60)),
    CONSTRAINT inventory_lots_notes_check CHECK ((char_length(notes) <= 500)),
    CONSTRAINT inventory_lots_quantity_check CHECK ((quantity >= 0)),
    CONSTRAINT inventory_lots_supplier_check CHECK ((char_length(supplier) <= 120)),
    CONSTRAINT inventory_lots_unit_value_cents_check CHECK ((unit_value_cents >= 0)),
    CONSTRAINT inventory_lots_variant_check CHECK ((char_length(variant) <= 80))
);

CREATE FUNCTION public.inventory_lock_lot(p_lot_id uuid) RETURNS public.inventory_lots
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lot public.inventory_lots;
begin
  select * into lot from public.inventory_lots where id = p_lot_id for update;
  if lot.id is null or not public.can_edit_inventory(lot.group_id) then raise exception 'Lote não encontrado ou sem permissão'; end if;
  return lot;
end;
$$;

CREATE TABLE public.inventory_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    material_id uuid NOT NULL,
    location_id uuid NOT NULL,
    tag text,
    legacy_code text,
    description text,
    condition public.inventory_condition,
    unit_value_cents bigint,
    acquired_on date,
    origin public.inventory_origin DEFAULT 'nao_informada'::public.inventory_origin NOT NULL,
    supplier text,
    invoice text,
    notes text,
    written_off_at timestamp with time zone,
    write_off_reason public.inventory_write_off_reason,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_units_check CHECK (((written_off_at IS NULL) = (write_off_reason IS NULL))),
    CONSTRAINT inventory_units_description_check CHECK ((char_length(description) <= 500)),
    CONSTRAINT inventory_units_invoice_check CHECK ((char_length(invoice) <= 60)),
    CONSTRAINT inventory_units_legacy_code_check CHECK ((char_length(legacy_code) <= 30)),
    CONSTRAINT inventory_units_notes_check CHECK ((char_length(notes) <= 500)),
    CONSTRAINT inventory_units_supplier_check CHECK ((char_length(supplier) <= 120)),
    CONSTRAINT inventory_units_tag_check CHECK ((tag ~ '^GEAS-[0-9]{3}-[0-9]{4}$'::text)),
    CONSTRAINT inventory_units_unit_value_cents_check CHECK ((unit_value_cents >= 0))
);

CREATE FUNCTION public.inventory_lock_unit(p_unit_id uuid) RETURNS public.inventory_units
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare unit public.inventory_units;
begin
  select * into unit from public.inventory_units where id = p_unit_id for update;
  if unit.id is null or not public.can_edit_inventory(unit.group_id) then raise exception 'Peça não encontrada ou sem permissão'; end if;
  if unit.written_off_at is not null then raise exception 'Esta peça já foi baixada'; end if;
  return unit;
end;
$$;

CREATE FUNCTION public.inventory_log(p_group_id uuid, p_kind public.inventory_movement_kind, p_material_id uuid, p_lot_id uuid, p_unit_id uuid, p_quantity integer, p_from_location uuid, p_to_location uuid, p_from_condition public.inventory_condition, p_to_condition public.inventory_condition, p_reason public.inventory_write_off_reason, p_notes text, p_details jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  new_id bigint;
  source text := case when current_setting('inventory.channel', true) = 'rapido' then 'rapido' else 'web' end;
  reviewed boolean := source = 'web' and public.can_manage_inventory(p_group_id);
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

CREATE FUNCTION public.inventory_matching_lot(p_material_id uuid, p_location_id uuid, p_condition public.inventory_condition, p_expires_on date, p_variant text, p_except uuid) RETURNS public.inventory_lots
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select * from public.inventory_lots
  where material_id = p_material_id and location_id = p_location_id and condition is not distinct from p_condition
    and expires_on is not distinct from p_expires_on and variant is not distinct from public.inventory_clean(p_variant)
    and id is distinct from p_except
  order by quantity desc, created_at
  limit 1
  for update;
$$;

CREATE FUNCTION public.inventory_merged_value(p_value bigint, p_quantity integer, p_added_value bigint, p_added integer) RETURNS bigint
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case
    when p_added_value is null then p_value
    when p_value is null or p_quantity <= 0 then p_added_value
    else round((p_value * p_quantity + p_added_value * p_added)::numeric / (p_quantity + p_added))::bigint
  end;
$$;

CREATE FUNCTION public.inventory_next_location_position(p_group_id uuid, p_parent_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(max(position) + 1, 0) from public.inventory_locations where group_id = p_group_id and parent_id is not distinct from p_parent_id;
$$;

CREATE FUNCTION public.inventory_next_tag(p_family_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare fam public.inventory_families; last_number integer;
begin
  select * into fam from public.inventory_families where id = p_family_id;
  if fam.id is null or not public.is_group_member(fam.group_id) then raise exception 'Família não encontrada'; end if;
  if fam.code is null then return null; end if;
  select max(substr(tag, 10, 4)::integer) into last_number from public.inventory_units where group_id = fam.group_id and tag like 'GEAS-' || fam.code || '-%';
  return 'GEAS-' || fam.code || '-' || lpad((coalesce(last_number, 0) + 1)::text, 4, '0');
end;
$$;

CREATE FUNCTION public.inventory_place_location(p_id uuid, p_target uuid, p_place text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare loc public.inventory_locations; target public.inventory_locations; new_parent uuid; ids uuid[]; idx integer;
begin
  select * into loc from public.inventory_locations where id = p_id;
  if loc.id is null or not public.can_manage_inventory(loc.group_id) then raise exception 'Divisão não encontrada ou sem permissão'; end if;
  select * into target from public.inventory_locations where id = p_target and group_id = loc.group_id;
  if target.id is null then raise exception 'Divisão de destino não encontrada'; end if;
  if p_place not in ('before', 'after', 'inside') then raise exception 'Solte antes, depois ou dentro de uma divisão'; end if;
  if p_id = p_target then raise exception 'Uma divisão não pode ficar dentro dela mesma'; end if;
  new_parent := case when p_place = 'inside' then target.id else target.parent_id end;
  if new_parent is not null and p_id = any(coalesce((select ancestors from public.inventory_location_paths where id = new_parent), '{}'::uuid[])) then
    raise exception 'Uma divisão não pode ficar dentro dela mesma';
  end if;
  if new_parent is distinct from loc.parent_id then
    if new_parent is not null and not (select active from public.inventory_locations where id = new_parent) then
      raise exception 'Reative a divisão de destino antes de pôr outra dentro dela';
    end if;
    if exists (select 1 from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from new_parent
      and lower(name) = lower(loc.name) and id <> p_id) then
      raise exception 'Já existe a divisão % neste nível', loc.name;
    end if;
  end if;
  -- Trava as irmãs de destino durante a renumeração.
  perform 1 from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from new_parent for update;
  select coalesce(array_agg(id order by position, lower(name)), '{}') into ids
  from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from new_parent and id <> p_id;
  idx := case when p_place = 'inside' then cardinality(ids) + 1 else array_position(ids, p_target) + (p_place = 'after')::int end;
  ids := ids[1:idx - 1] || p_id || ids[idx:];
  update public.inventory_locations set parent_id = new_parent where id = p_id;
  update public.inventory_locations l set position = o.ord - 1 from unnest(ids) with ordinality as o(id, ord) where l.id = o.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (loc.group_id, auth.uid(), 'inventory.location_moved', 'inventory_location', p_id::text,
    jsonb_build_object('name', loc.name, 'from_parent_id', loc.parent_id, 'parent_id', new_parent, 'from', loc.position, 'to', idx - 1));
end;
$$;

CREATE FUNCTION public.inventory_quick(p_action text, p_args jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  result uuid;
begin
  perform set_config('inventory.channel', 'rapido', true);
  case p_action
    when 'add_lot' then
      result := public.inventory_add_lot((a->>'material_id')::uuid, (a->>'location_id')::uuid, (a->>'quantity')::integer,
        (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, (a->>'expires_on')::date, today,
        coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes', a->>'variant');
    when 'add_unit' then
      result := public.inventory_add_unit((a->>'material_id')::uuid, (a->>'location_id')::uuid, a->>'tag', null, null,
        (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, today,
        coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes');
    when 'new_material' then
      result := public.inventory_save_material((a->>'group_id')::uuid, null, (a->>'family_id')::uuid, a->>'name',
        (a->>'tracking')::public.inventory_tracking, coalesce((a->>'consumable')::boolean, false), null, null, true);
      if (a->>'tracking') = 'lot' then
        perform public.inventory_add_lot(result, (a->>'location_id')::uuid, (a->>'quantity')::integer,
          (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, (a->>'expires_on')::date, today,
          coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes', a->>'variant');
      else
        perform public.inventory_add_unit(result, (a->>'location_id')::uuid, a->>'tag', null, null,
          (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, today,
          coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes');
      end if;
    when 'write_off_lot' then
      perform public.inventory_write_off_lot((a->>'lot_id')::uuid, (a->>'quantity')::integer, (a->>'reason')::public.inventory_write_off_reason, a->>'notes');
    when 'write_off_unit' then
      perform public.inventory_write_off_unit((a->>'unit_id')::uuid, (a->>'reason')::public.inventory_write_off_reason, a->>'notes');
    when 'set_lot_condition' then
      result := public.inventory_set_lot_condition((a->>'lot_id')::uuid, (a->>'condition')::public.inventory_condition, (a->>'quantity')::integer, a->>'notes');
    when 'set_unit_condition' then
      perform public.inventory_set_unit_condition((a->>'unit_id')::uuid, (a->>'condition')::public.inventory_condition, a->>'notes');
    when 'transfer_lot' then
      result := public.inventory_transfer_lot((a->>'lot_id')::uuid, (a->>'to_location_id')::uuid, (a->>'quantity')::integer, a->>'notes');
    when 'transfer_unit' then
      perform public.inventory_transfer_unit((a->>'unit_id')::uuid, (a->>'to_location_id')::uuid, a->>'notes');
    when 'adjust_lot' then
      perform public.inventory_adjust_lot((a->>'lot_id')::uuid, (a->>'quantity')::integer, a->>'notes');
    else
      raise exception 'Ação de registro rápido desconhecida: %', p_action;
  end case;
  -- O setting vale até o fim da transação: desliga para não marcar o que vier depois nela.
  perform set_config('inventory.channel', '', true);
  return jsonb_build_object('id', result);
end;
$$;

CREATE FUNCTION public.inventory_record_count(p_material_id uuid, p_location_id uuid, p_year integer, p_quantity integer, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare m public.inventory_materials; result uuid; previous integer;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_manage_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'Informe a quantidade contada'; end if;
  if not exists (select 1 from public.inventory_locations where id = p_location_id and group_id = m.group_id) then raise exception 'Divisão não encontrada'; end if;
  select quantity into previous from public.inventory_counts where group_id = m.group_id and year = p_year and material_id = m.id and location_id = p_location_id;
  insert into public.inventory_counts(group_id, year, material_id, location_id, quantity, notes, recorded_by)
  values (m.group_id, p_year, m.id, p_location_id, p_quantity, public.inventory_clean(p_notes), auth.uid())
  on conflict (group_id, year, material_id, location_id) do update
    set quantity = excluded.quantity, notes = excluded.notes, recorded_by = excluded.recorded_by, recorded_at = now()
  returning id into result;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (m.group_id, auth.uid(), 'inventory.count_recorded', 'inventory_count', result::text,
    jsonb_build_object('year', p_year, 'material_id', m.id, 'location_id', p_location_id, 'from', previous, 'to', p_quantity));
  return result;
end;
$$;

CREATE FUNCTION public.inventory_review_movements(p_group_id uuid, p_ids bigint[], p_notes text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare note text := public.inventory_clean(p_notes); marked integer;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Apenas o gestor do inventário revisa movimentos'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Escolha os movimentos a revisar'; end if;
  if char_length(note) > 500 then raise exception 'Nota muito longa (máximo 500 caracteres)'; end if;
  with done as (
    update public.inventory_movements set review_status = 'revisado', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = note
    where group_id = p_group_id and id = any(p_ids) and review_status = 'para_revisar'
    returning id, kind, material_id, created_by, channel
  ), logged as (
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    select p_group_id, auth.uid(), 'inventory.reviewed', 'inventory_movement', done.id::text,
      jsonb_build_object('kind', done.kind, 'material_id', done.material_id, 'created_by', done.created_by, 'channel', done.channel, 'notes', note)
    from done
    returning 1
  )
  select count(*)::int into marked from logged;
  return marked;
end;
$$;

CREATE FUNCTION public.inventory_role_of(p_group_id uuid) RETURNS public.inventory_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when role = 'admin' then 'manager'::public.inventory_role else inventory_role end
  from public.memberships where group_id = p_group_id and user_id = auth.uid();
$$;

CREATE FUNCTION public.inventory_save_family(p_group_id uuid, p_id uuid, p_name text, p_code text, p_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare clean_name text := public.inventory_clean(p_name); clean_code text := public.inventory_clean(p_code); result uuid := p_id;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Sem permissão para alterar famílias'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 80 then raise exception 'Informe um nome de família com 2 a 80 caracteres'; end if;
  if clean_code is not null and clean_code !~ '^[0-9]{3}$' then raise exception 'O código da família tem 3 dígitos (ex.: 001)'; end if;
  if exists (select 1 from public.inventory_families where group_id = p_group_id and lower(name) = lower(clean_name) and id is distinct from p_id) then
    raise exception 'Já existe a família %', clean_name;
  end if;
  if clean_code is not null and exists (select 1 from public.inventory_families where group_id = p_group_id and code = clean_code and id is distinct from p_id) then
    raise exception 'O código % já é de outra família', clean_code;
  end if;
  if p_id is null then
    insert into public.inventory_families(group_id, name, code, active) values (p_group_id, clean_name, clean_code, coalesce(p_active, true)) returning id into result;
  else
    if exists (select 1 from public.inventory_units u join public.inventory_materials m on m.id = u.material_id
      where m.family_id = p_id and u.tag is not null and substr(u.tag, 6, 3) is distinct from clean_code) then
      raise exception 'Há peças etiquetadas com o código atual desta família';
    end if;
    update public.inventory_families set name = clean_name, code = clean_code, active = coalesce(p_active, true) where id = p_id and group_id = p_group_id;
    if not found then raise exception 'Família não encontrada'; end if;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'inventory.family_created' else 'inventory.family_updated' end, 'inventory_family', result::text,
    jsonb_build_object('name', clean_name, 'code', clean_code, 'active', coalesce(p_active, true)));
  return result;
end;
$_$;

CREATE FUNCTION public.inventory_save_location(p_group_id uuid, p_id uuid, p_parent_id uuid, p_name text, p_description text, p_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare clean_name text := public.inventory_clean(p_name); result uuid := p_id; old_parent uuid;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Sem permissão para alterar divisões'; end if;
  if clean_name is null or char_length(clean_name) > 80 then raise exception 'Informe um nome de divisão com até 80 caracteres'; end if;
  if p_parent_id is not null and not exists (select 1 from public.inventory_locations where id = p_parent_id and group_id = p_group_id) then
    raise exception 'Divisão superior não encontrada';
  end if;
  if exists (select 1 from public.inventory_locations where group_id = p_group_id and parent_id is not distinct from p_parent_id
    and lower(name) = lower(clean_name) and id is distinct from p_id) then
    raise exception 'Já existe a divisão % neste nível', clean_name;
  end if;
  if p_id is null then
    insert into public.inventory_locations(group_id, parent_id, name, description, active, position)
    values (p_group_id, p_parent_id, clean_name, public.inventory_clean(p_description), coalesce(p_active, true), public.inventory_next_location_position(p_group_id, p_parent_id))
    returning id into result;
  else
    select parent_id into old_parent from public.inventory_locations where id = p_id and group_id = p_group_id;
    if not found then raise exception 'Divisão não encontrada'; end if;
    if p_parent_id is not null and p_id = any(coalesce((select ancestors from public.inventory_location_paths where id = p_parent_id), '{}'::uuid[])) then
      raise exception 'Uma divisão não pode ficar dentro dela mesma';
    end if;
    if not coalesce(p_active, true) and (
      exists (select 1 from public.inventory_lots where location_id = p_id and quantity > 0)
      or exists (select 1 from public.inventory_units where location_id = p_id and written_off_at is null)
      or exists (select 1 from public.inventory_locations where parent_id = p_id and active)
    ) then raise exception 'Esvazie a divisão (materiais e subdivisões ativas) antes de inativá-la'; end if;
    update public.inventory_locations set parent_id = p_parent_id, name = clean_name, description = public.inventory_clean(p_description), active = coalesce(p_active, true),
      position = case when p_parent_id is distinct from old_parent then public.inventory_next_location_position(p_group_id, p_parent_id) else position end
    where id = p_id;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'inventory.location_created' else 'inventory.location_updated' end, 'inventory_location', result::text,
    jsonb_build_object('name', clean_name, 'parent_id', p_parent_id, 'active', coalesce(p_active, true)));
  return result;
end;
$$;

CREATE FUNCTION public.inventory_save_material(p_group_id uuid, p_id uuid, p_family_id uuid, p_name text, p_tracking public.inventory_tracking, p_consumable boolean, p_minimum_quantity integer, p_description text, p_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare clean_name text := public.inventory_clean(p_name); result uuid := p_id; old public.inventory_materials;
begin
  if not public.can_edit_inventory(p_group_id) then raise exception 'Sem permissão para alterar materiais'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 120 then raise exception 'Informe um nome de material com 2 a 120 caracteres'; end if;
  if p_tracking is null then raise exception 'Escolha se o material é controlado por peça ou por quantidade'; end if;
  if coalesce(p_consumable, false) and p_tracking <> 'lot' then raise exception 'Consumível é controlado por quantidade'; end if;
  if p_minimum_quantity is not null and p_minimum_quantity < 0 then raise exception 'O estoque mínimo não pode ser negativo'; end if;
  if p_family_id is not null and not exists (select 1 from public.inventory_families where id = p_family_id and group_id = p_group_id) then
    raise exception 'Família não encontrada';
  end if;
  if exists (select 1 from public.inventory_materials where group_id = p_group_id and lower(name) = lower(clean_name) and id is distinct from p_id) then
    raise exception 'Já existe o material %', clean_name;
  end if;
  if p_id is null then
    insert into public.inventory_materials(group_id, family_id, name, tracking, consumable, minimum_quantity, description, active, created_by)
    values (p_group_id, p_family_id, clean_name, p_tracking, coalesce(p_consumable, false), p_minimum_quantity, public.inventory_clean(p_description), coalesce(p_active, true), auth.uid())
    returning id into result;
    perform public.inventory_log(p_group_id, 'edicao', result, null, null, null, null, null, null, null, null, null,
      jsonb_build_object('action', 'material_created', 'name', clean_name, 'tracking', p_tracking));
  else
    select * into old from public.inventory_materials where id = p_id and group_id = p_group_id for update;
    if old.id is null then raise exception 'Material não encontrado'; end if;
    if old.tracking <> p_tracking and (exists (select 1 from public.inventory_lots where material_id = p_id) or exists (select 1 from public.inventory_units where material_id = p_id)) then
      raise exception 'Não é possível trocar o controle (peça/quantidade) de um material que já tem estoque';
    end if;
    update public.inventory_materials set family_id = p_family_id, name = clean_name, tracking = p_tracking, consumable = coalesce(p_consumable, false),
      minimum_quantity = p_minimum_quantity, description = public.inventory_clean(p_description), active = coalesce(p_active, true), updated_at = now()
    where id = p_id;
    perform public.inventory_log(p_group_id, 'edicao', p_id, null, null, null, null, null, null, null, null, null,
      jsonb_build_object('action', 'material_updated', 'before', to_jsonb(old) - 'group_id' - 'created_by' - 'created_at' - 'updated_at',
        'after', jsonb_build_object('name', clean_name, 'family_id', p_family_id, 'tracking', p_tracking, 'consumable', coalesce(p_consumable, false),
          'minimum_quantity', p_minimum_quantity, 'active', coalesce(p_active, true))));
  end if;
  return result;
end;
$$;

CREATE FUNCTION public.inventory_search_normalize(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select lower(translate(coalesce(p_text, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;

CREATE FUNCTION public.inventory_set_lot_condition(p_lot_id uuid, p_condition public.inventory_condition, p_quantity integer, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity); target uuid;
begin
  if p_condition is not distinct from lot.condition then raise exception 'O lote já está nesta condição'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  target := public.inventory_split_lot(lot, qty, lot.location_id, p_condition);
  perform public.inventory_log(lot.group_id, 'condicao', lot.material_id, target, null, qty, null, null, lot.condition, p_condition, null, p_notes,
    jsonb_build_object('source_lot_id', lot.id));
  return target;
end;
$$;

CREATE FUNCTION public.inventory_set_unit_condition(p_unit_id uuid, p_condition public.inventory_condition, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id);
begin
  if p_condition is not distinct from unit.condition then raise exception 'A peça já está nesta condição'; end if;
  update public.inventory_units set condition = p_condition, updated_at = now() where id = unit.id;
  perform public.inventory_log(unit.group_id, 'condicao', unit.material_id, null, unit.id, 1, null, null, unit.condition, p_condition, null, p_notes, '{}'::jsonb);
end;
$$;

CREATE FUNCTION public.inventory_split_lot(p_lot public.inventory_lots, p_quantity integer, p_location_id uuid, p_condition public.inventory_condition) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare target public.inventory_lots; new_id uuid;
begin
  target := public.inventory_matching_lot(p_lot.material_id, p_location_id, p_condition, p_lot.expires_on, p_lot.variant, p_lot.id);
  if target.id is not null then
    update public.inventory_lots set quantity = quantity - p_quantity, updated_at = now() where id = p_lot.id;
    update public.inventory_lots set quantity = quantity + p_quantity,
      unit_value_cents = public.inventory_merged_value(unit_value_cents, quantity, p_lot.unit_value_cents, p_quantity), updated_at = now()
    where id = target.id;
    return target.id;
  end if;
  if p_quantity = p_lot.quantity then
    update public.inventory_lots set location_id = p_location_id, condition = p_condition, updated_at = now() where id = p_lot.id;
    return p_lot.id;
  end if;
  update public.inventory_lots set quantity = quantity - p_quantity, updated_at = now() where id = p_lot.id;
  insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes, variant)
  values (p_lot.group_id, p_lot.material_id, p_location_id, p_quantity, p_condition, p_lot.unit_value_cents, p_lot.expires_on, p_lot.acquired_on, p_lot.origin,
    p_lot.supplier, p_lot.invoice, p_lot.notes, p_lot.variant)
  returning id into new_id;
  return new_id;
end;
$$;

CREATE FUNCTION public.inventory_transfer_lot(p_lot_id uuid, p_to_location_id uuid, p_quantity integer, p_notes text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity); target uuid;
begin
  perform public.inventory_check_location(lot.group_id, p_to_location_id);
  if p_to_location_id = lot.location_id then raise exception 'O lote já está nesta divisão'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  target := public.inventory_split_lot(lot, qty, p_to_location_id, lot.condition);
  perform public.inventory_log(lot.group_id, 'transferencia', lot.material_id, target, null, qty, lot.location_id, p_to_location_id, null, null, null, p_notes,
    jsonb_build_object('source_lot_id', lot.id));
  return target;
end;
$$;

CREATE FUNCTION public.inventory_transfer_unit(p_unit_id uuid, p_to_location_id uuid, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id);
begin
  perform public.inventory_check_location(unit.group_id, p_to_location_id);
  if p_to_location_id = unit.location_id then raise exception 'A peça já está nesta divisão'; end if;
  update public.inventory_units set location_id = p_to_location_id, updated_at = now() where id = unit.id;
  perform public.inventory_log(unit.group_id, 'transferencia', unit.material_id, null, unit.id, 1, unit.location_id, p_to_location_id, null, null, null, p_notes, '{}'::jsonb);
end;
$$;

CREATE FUNCTION public.inventory_update_lot(p_lot_id uuid, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text, p_variant text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id);
begin
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  update public.inventory_lots set unit_value_cents = p_unit_value_cents, expires_on = p_expires_on, acquired_on = p_acquired_on,
    origin = coalesce(p_origin, 'nao_informada'), supplier = public.inventory_clean(p_supplier), invoice = public.inventory_clean(p_invoice),
    notes = public.inventory_clean(p_notes), variant = public.inventory_clean(p_variant), updated_at = now()
  where id = lot.id;
  perform public.inventory_log(lot.group_id, 'edicao', lot.material_id, lot.id, null, null, null, null, null, null, null, null,
    jsonb_build_object('action', 'lot_updated', 'before', to_jsonb(lot) - 'group_id' - 'created_at' - 'updated_at'));
end;
$$;

CREATE FUNCTION public.inventory_update_unit(p_unit_id uuid, p_tag text, p_legacy_code text, p_description text, p_unit_value_cents bigint, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id); clean_tag text;
begin
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  clean_tag := public.inventory_check_tag(unit.group_id, unit.material_id, unit.id, p_tag);
  update public.inventory_units set tag = clean_tag, legacy_code = public.inventory_clean(p_legacy_code), description = public.inventory_clean(p_description),
    unit_value_cents = p_unit_value_cents, acquired_on = p_acquired_on, origin = coalesce(p_origin, 'nao_informada'),
    supplier = public.inventory_clean(p_supplier), invoice = public.inventory_clean(p_invoice), notes = public.inventory_clean(p_notes), updated_at = now()
  where id = unit.id;
  perform public.inventory_log(unit.group_id, 'edicao', unit.material_id, null, unit.id, null, null, null, null, null, null, null,
    jsonb_build_object('action', 'unit_updated', 'before', to_jsonb(unit) - 'group_id' - 'created_at' - 'updated_at'));
end;
$$;

CREATE FUNCTION public.inventory_write_off_lot(p_lot_id uuid, p_quantity integer, p_reason public.inventory_write_off_reason, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity);
begin
  if p_reason is null then raise exception 'Escolha o motivo da baixa'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  update public.inventory_lots set quantity = quantity - qty, updated_at = now() where id = lot.id;
  perform public.inventory_log(lot.group_id, 'baixa', lot.material_id, lot.id, null, qty, lot.location_id, null, null, null, p_reason, p_notes,
    jsonb_build_object('from', lot.quantity, 'to', lot.quantity - qty));
end;
$$;

CREATE FUNCTION public.inventory_write_off_unit(p_unit_id uuid, p_reason public.inventory_write_off_reason, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id);
begin
  if p_reason is null then raise exception 'Escolha o motivo da baixa'; end if;
  update public.inventory_units set written_off_at = now(), write_off_reason = p_reason, updated_at = now() where id = unit.id;
  perform public.inventory_log(unit.group_id, 'baixa', unit.material_id, null, unit.id, 1, unit.location_id, null, null, null, p_reason, p_notes, '{}'::jsonb);
end;
$$;

CREATE FUNCTION public.is_group_member(requested_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.memberships where group_id = requested_group_id and user_id = auth.uid());
$$;

CREATE FUNCTION public.ledger_entry_history(p_entry_id uuid) RETURNS TABLE(id bigint, created_at timestamp with time zone, action text, actor_email text, details jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare entry_group uuid;
begin
  select e.group_id into entry_group from public.ledger_entries e where e.id = p_entry_id;
  if entry_group is null or not public.is_group_member(entry_group) then return; end if;
  return query
  select ev.id, ev.created_at, ev.action, u.email::text, ev.details
  from public.audit_events ev
  left join auth.users u on u.id = ev.actor_id
  where ev.group_id = entry_group
    and (
      (ev.entity_type = 'ledger_entry' and ev.entity_id = p_entry_id::text)
      or (ev.entity_type = 'reconciliation' and ev.details->'ledger_entry_ids' ? p_entry_id::text)
      or (ev.action = 'reconciliation.suggestion_rejected' and ev.details->>'ledger_entry_id' = p_entry_id::text)
    )
  order by ev.created_at desc, ev.id desc
  limit 500;
end;
$$;

CREATE FUNCTION public.ledger_entry_reconciliation_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare set_ids uuid[];
begin
  select array_agg(distinct link_set_id) into set_ids from public.reconciliation_links where ledger_entry_id = old.id;
  if set_ids is not null then
    perform public.dissolve_reconciliation_sets(set_ids,
      case when tg_op = 'DELETE' then 'lançamento excluído' else 'lançamento alterado (valor ou conta)' end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

CREATE FUNCTION public.ledger_entry_snapshot(p_entry_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'entry_date', e.entry_date,
    'name', e.name,
    'account_id', e.account_id,
    'payment_method_id', e.payment_method_id,
    'document', e.document,
    'document_filed', e.document_filed,
    'total_cents', e.total_cents,
    'notes', e.notes,
    'splits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id', s.category_id, 'amount_cents', s.amount_cents,
        'description', s.description, 'associate_id', s.associate_id) order by s.created_at, s.id)
      from public.entry_splits s where s.entry_id = e.id), '[]'::jsonb)
  )
  from public.ledger_entries e where e.id = p_entry_id;
$$;

CREATE FUNCTION public.link_reconciliation(p_statement_line_ids uuid[], p_ledger_entry_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  line_ids uuid[];
  entry_ids uuid[];
  set_id uuid := gen_random_uuid();
  first_group uuid;
  first_account uuid;
  line_count int;
  entry_count int;
  line_sum bigint;
  entry_sum bigint;
  moved record;
begin
  select coalesce(array_agg(distinct x), '{}') into line_ids from unnest(p_statement_line_ids) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into entry_ids from unnest(p_ledger_entry_ids) x where x is not null;
  line_count := cardinality(line_ids);
  entry_count := cardinality(entry_ids);
  if line_count = 0 or entry_count = 0 then raise exception 'Selecione ao menos uma linha do extrato e um lançamento'; end if;
  if line_count > 1 and entry_count > 1 then
    raise exception 'Vincule uma linha a vários lançamentos ou um lançamento a várias linhas, não vários com vários';
  end if;
  if line_count > 200 or entry_count > 200 then raise exception 'Seleção grande demais'; end if;

  -- trava as linhas e os lançamentos na mesma ordem para evitar corridas
  perform 1 from public.statement_lines where id = any(line_ids) order by id for update;
  perform 1 from public.ledger_entries where id = any(entry_ids) order by id for update;

  select min(group_id::text)::uuid, min(account_id::text)::uuid into first_group, first_account
  from public.statement_lines where id = any(line_ids);
  if first_group is null or not public.can_edit_group(first_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;

  if (select count(*) from public.statement_lines where id = any(line_ids) and group_id = first_group and account_id = first_account) <> line_count then
    raise exception 'As linhas do extrato precisam ser da mesma conta';
  end if;
  if (select count(*) from public.ledger_entries where id = any(entry_ids) and group_id = first_group) <> entry_count then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;
  -- Lançamentos ainda em "A definir" (digitados sem conta) passam para a conta do extrato ao vincular.
  for moved in
    update public.ledger_entries e set account_id = first_account, updated_at = now()
    from public.accounts a
    where e.id = any(entry_ids) and a.id = e.account_id and a.name = 'A definir' and a.group_id = first_group
    returning e.id, a.id as from_account
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (first_group, auth.uid(), 'ledger_entry.account_changed', 'ledger_entry', moved.id::text,
      jsonb_build_object('from', moved.from_account, 'to', first_account, 'reason', 'conciliação'));
  end loop;
  if exists (select 1 from public.ledger_entries where id = any(entry_ids) and account_id <> first_account) then
    raise exception 'Os lançamentos precisam ser da mesma conta do extrato';
  end if;
  if exists (select 1 from public.statement_lines where id = any(line_ids) and status <> 'aberta') then
    raise exception 'Alguma linha do extrato já foi conciliada ou ignorada';
  end if;
  if exists (select 1 from public.reconciliation_links where ledger_entry_id = any(entry_ids)) then
    raise exception 'Algum lançamento já está conciliado';
  end if;
  if exists (select 1 from public.ledger_entries where id = any(entry_ids) and outside_statement) then
    raise exception 'Algum lançamento está marcado como fora do extrato';
  end if;

  select sum(amount_cents) into line_sum from public.statement_lines where id = any(line_ids);
  select sum(total_cents) into entry_sum from public.ledger_entries where id = any(entry_ids);
  if line_sum <> entry_sum then
    raise exception 'As somas não batem: extrato % e lançamentos % (centavos)', line_sum, entry_sum;
  end if;

  -- cada lado soma o próprio valor: 1:N usa o total de cada lançamento; N:1, o valor de cada linha
  if line_count = 1 then
    insert into public.reconciliation_links(statement_line_id, ledger_entry_id, amount_cents, created_by, link_set_id)
    select line_ids[1], e.id, e.total_cents, auth.uid(), set_id from public.ledger_entries e where e.id = any(entry_ids);
  else
    insert into public.reconciliation_links(statement_line_id, ledger_entry_id, amount_cents, created_by, link_set_id)
    select l.id, entry_ids[1], l.amount_cents, auth.uid(), set_id from public.statement_lines l where l.id = any(line_ids);
  end if;

  update public.statement_lines set status = 'conciliada' where id = any(line_ids);

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (first_group, auth.uid(), 'reconciliation.linked', 'reconciliation', set_id::text,
    jsonb_build_object('account_id', first_account, 'statement_line_ids', to_jsonb(line_ids),
      'ledger_entry_ids', to_jsonb(entry_ids), 'amount_cents', line_sum));
  return set_id;
end;
$$;

CREATE FUNCTION public.move_ledger_entries_account(p_entry_ids uuid[], p_account_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  entry_ids uuid[];
  entry_count int;
  target_group uuid;
  moved record;
  moved_count int := 0;
  unlinked_count int;
begin
  select coalesce(array_agg(distinct x), '{}') into entry_ids from unnest(p_entry_ids) x where x is not null;
  entry_count := cardinality(entry_ids);
  if entry_count = 0 then raise exception 'Selecione ao menos um lançamento'; end if;
  if entry_count > 500 then raise exception 'Seleção grande demais: no máximo 500 lançamentos por vez'; end if;

  select group_id into target_group from public.accounts where id = p_account_id and active;
  if target_group is null or not public.can_edit_group(target_group) then raise exception 'Conta inválida ou sem permissão'; end if;

  perform 1 from public.ledger_entries where id = any(entry_ids) order by id for update;
  if (select count(*) from public.ledger_entries where id = any(entry_ids) and group_id = target_group) <> entry_count then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;

  select count(distinct rl.link_set_id) into unlinked_count
  from public.reconciliation_links rl
  join public.ledger_entries e on e.id = rl.ledger_entry_id
  where e.id = any(entry_ids) and e.account_id <> p_account_id;

  for moved in
    update public.ledger_entries e set account_id = p_account_id, updated_at = now()
    from (select id, account_id from public.ledger_entries where id = any(entry_ids) and account_id <> p_account_id) old
    where e.id = old.id
    returning e.id, old.account_id as from_account
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (target_group, auth.uid(), 'ledger_entry.account_changed', 'ledger_entry', moved.id::text,
      jsonb_build_object('from', moved.from_account, 'to', p_account_id, 'reason', 'em lote'));
    moved_count := moved_count + 1;
  end loop;

  return jsonb_build_object('moved', moved_count, 'unchanged', entry_count - moved_count, 'unlinked', unlinked_count);
end;
$$;

CREATE FUNCTION public.next_category_position(p_parent_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(max(position) + 1, 0) from public.categories where parent_id = p_parent_id;
$$;

CREATE FUNCTION public.patrol_snapshot(p_patrol_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('section_id', p.section_id, 'name', p.name, 'active', p.active) from public.patrols p where p.id = p_patrol_id;
$$;

CREATE FUNCTION public.pay_debts(p_group_id uuid, p_associate_id uuid, p_entry_id uuid, p_allocations jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare before_state jsonb; debt_ids uuid[];
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para anotar dívidas'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id) then raise exception 'Associado não encontrado'; end if;
  if not exists (select 1 from public.ledger_entries where id = p_entry_id and group_id = p_group_id)
    or public.debt_payment_cents(p_entry_id, p_associate_id) <= 0 then
    raise exception 'Pagamento inválido: use um lançamento com rateio de receita deste associado';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then raise exception 'Pagamentos inválidos'; end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) x where coalesce((x->>'amountCents')::bigint, -1) < 0) then
    raise exception 'Valor de pagamento inválido';
  end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) x
    where not exists (select 1 from public.debts d where d.id = (x->>'debtId')::uuid and d.associate_id = p_associate_id and d.group_id = p_group_id)) then
    raise exception 'Dívida não encontrada';
  end if;

  perform 1 from public.debts where associate_id = p_associate_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('debt_id', p.debt_id, 'amount_cents', p.amount_cents) order by p.debt_id), '[]'::jsonb) into before_state
  from public.debt_payments p join public.debts d on d.id = p.debt_id where p.entry_id = p_entry_id and d.associate_id = p_associate_id;

  delete from public.debt_payments p using public.debts d where d.id = p.debt_id and p.entry_id = p_entry_id and d.associate_id = p_associate_id;
  insert into public.debt_payments(debt_id, entry_id, amount_cents)
  select (x->>'debtId')::uuid, p_entry_id, sum((x->>'amountCents')::bigint) from jsonb_array_elements(p_allocations) x
  group by (x->>'debtId')::uuid having sum((x->>'amountCents')::bigint) > 0;

  debt_ids := coalesce((select array_agg((x->>'debtId')::uuid) from jsonb_array_elements(p_allocations) x), '{}');
  perform public.check_debt_allocations(p_associate_id, array[p_entry_id], debt_ids);

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'debt.paid', 'debt_payment', p_entry_id::text,
    jsonb_build_object('associate_id', p_associate_id, 'before', before_state,
      'after', (select coalesce(jsonb_agg(jsonb_build_object('debt_id', p.debt_id, 'amount_cents', p.amount_cents) order by p.debt_id), '[]'::jsonb)
        from public.debt_payments p join public.debts d on d.id = p.debt_id where p.entry_id = p_entry_id and d.associate_id = p_associate_id)));
end;
$$;

CREATE FUNCTION public.preview_statement_lines(p_account_id uuid, p_period_from date, p_period_to date, p_lines jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare account_group uuid; result jsonb;
begin
  select group_id into account_group from public.accounts where id = p_account_id;
  if account_group is null or not public.can_edit_group(account_group) then raise exception 'Conta não encontrada ou sem permissão'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'Linhas inválidas'; end if;
  if jsonb_array_length(p_lines) > 10000 then raise exception 'Arquivo grande demais: no máximo 10.000 linhas por vez'; end if;

  with input as (
    select t.ord,
      (t.v->>'date')::date as line_date,
      (t.v->>'amountCents')::bigint as amount_cents,
      trim(t.v->>'description') as description,
      nullif(trim(t.v->>'externalId'), '') as external_id
    from jsonb_array_elements(p_lines) with ordinality as t(v, ord)
  ), numbered as (
    select input.*, public.statement_line_fingerprint(p_account_id, line_date, amount_cents, description,
      (row_number() over (partition by line_date, amount_cents, public.statement_description_key(description) order by ord))::int) as fingerprint
    from input
  ), exact as (
    select n.ord, coalesce(
      (select l.id from public.statement_lines l where l.account_id = p_account_id and l.fingerprint = n.fingerprint),
      (select l.id from public.statement_lines l where l.account_id = p_account_id and n.external_id is not null
        and l.external_id = n.external_id and l.line_date = n.line_date and l.amount_cents = n.amount_cents)
    ) as match_id
    from numbered n
  ), unexplained as (
    -- linhas já gravadas na conta que nenhuma linha do arquivo repete exatamente
    select l.* from public.statement_lines l
    where l.account_id = p_account_id and l.status <> 'ignorada'
      and l.line_date between coalesce(p_period_from, (select min(line_date) from input)) and coalesce(p_period_to, (select max(line_date) from input))
      and not exists (select 1 from exact e where e.match_id = l.id)
  ), classified as (
    select n.ord, n.line_date, n.amount_cents, e.match_id,
      case when e.match_id is not null then null else (
        select u.id from unexplained u where u.line_date = n.line_date and u.amount_cents = n.amount_cents order by u.id limit 1
      ) end as suspect_id
    from numbered n join exact e on e.ord = n.ord
  )
  select jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'index', c.ord,
        'status', case when c.match_id is not null then 'importada' when c.suspect_id is not null then 'suspeita' else 'nova' end,
        'matchDescription', (select l.description from public.statement_lines l where l.id = coalesce(c.match_id, c.suspect_id)),
        'matchStatus', (select l.status from public.statement_lines l where l.id = coalesce(c.match_id, c.suspect_id))
      ) order by c.ord) from classified c), '[]'::jsonb),
    'orphans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'date', u.line_date, 'description', u.description, 'amountCents', u.amount_cents, 'status', u.status
      ) order by u.line_date, u.amount_cents)
      from unexplained u where not exists (select 1 from classified c where c.suspect_id = u.id)), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

CREATE FUNCTION public.realized_by_month(p_group_id uuid, p_year integer) RETURNS TABLE(category_id uuid, month integer, amount_cents bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select s.category_id, extract(month from e.entry_date)::int as month, sum(s.amount_cents)::bigint as amount_cents
  from public.entry_splits s
  join public.ledger_entries e on e.id = s.entry_id
  where e.group_id = p_group_id
    and e.entry_date >= make_date(p_year, 1, 1)
    and e.entry_date < make_date(p_year + 1, 1, 1)
  group by s.category_id, extract(month from e.entry_date);
$$;

CREATE FUNCTION public.reject_reconciliation_suggestion(p_statement_line_id uuid, p_ledger_entry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare line_group uuid;
begin
  select group_id into line_group from public.statement_lines where id = p_statement_line_id;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if not exists (select 1 from public.ledger_entries where id = p_ledger_entry_id and group_id = line_group) then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;
  insert into public.reconciliation_rejections(statement_line_id, ledger_entry_id, rejected_by)
  values (p_statement_line_id, p_ledger_entry_id, auth.uid())
  on conflict do nothing;
  if found then
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (line_group, auth.uid(), 'reconciliation.suggestion_rejected', 'statement_line', p_statement_line_id::text,
      jsonb_build_object('ledger_entry_id', p_ledger_entry_id));
  end if;
end;
$$;

CREATE FUNCTION public.relative_link_snapshot(p_link_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('associate_id', l.associate_id, 'relative_id', l.relative_id, 'relative_name', r.name,
    'relative_associate_id', r.associate_id, 'kinship', l.kinship, 'kinship_note', l.kinship_note, 'legal', l.legal, 'financial', l.financial)
  from public.relative_links l join public.relatives r on r.id = l.relative_id where l.id = p_link_id;
$$;

CREATE FUNCTION public.relatives_check_associate(p_associate_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a public.associates%rowtype;
begin
  select * into a from public.associates where id = p_associate_id;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch = 'adulto' then raise exception 'Só jovens têm responsáveis'; end if;
  return a.group_id;
end;
$$;

CREATE FUNCTION public.relatives_check_details(p_group_id uuid, p_name text, p_relative_associate_id uuid, p_notes text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(clean_name) not between 2 and 120 then raise exception 'Informe um nome com 2 a 120 caracteres'; end if;
  if p_relative_associate_id is not null and not exists (select 1 from public.associates where id = p_relative_associate_id and group_id = p_group_id) then
    raise exception 'Associado do responsável não encontrado';
  end if;
  if char_length(trim(p_notes)) > 200 then raise exception 'Observações: no máximo 200 caracteres'; end if;
  return clean_name;
end;
$$;

CREATE FUNCTION public.relatives_check_kinship(p_kinship public.relative_kinship, p_kinship_note text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare clean_note text := nullif(regexp_replace(trim(coalesce(p_kinship_note, '')), '\s+', ' ', 'g'), '');
begin
  if p_kinship is null then raise exception 'Escolha o parentesco'; end if;
  if p_kinship = 'outro' and clean_note is null then raise exception 'Descreva o parentesco (ex.: irmã, avó)'; end if;
  if char_length(clean_note) > 40 then raise exception 'Parentesco: no máximo 40 caracteres'; end if;
  return clean_note;
end;
$$;

CREATE FUNCTION public.relatives_create(p_associate_id uuid, p_name text, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean, p_relative_associate_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare gid uuid; clean_name text; clean_note text; new_id uuid; link_id uuid;
begin
  gid := public.relatives_check_associate(p_associate_id);
  clean_name := public.relatives_check_details(gid, p_name, p_relative_associate_id, null);
  clean_note := public.relatives_check_kinship(p_kinship, p_kinship_note);
  if p_relative_associate_id = p_associate_id then raise exception 'O jovem não pode ser responsável por si mesmo'; end if;
  insert into public.relatives(group_id, name, associate_id) values (gid, clean_name, p_relative_associate_id) returning id into new_id;
  link_id := public.relatives_insert_link(gid, p_associate_id, new_id, p_kinship, clean_note, p_legal, p_financial);
  if not exists (select 1 from public.associates where id = p_relative_associate_id and active) then
    perform public.control_statuses_init(gid, null, new_id, 'responsavel');
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (gid, auth.uid(), 'relative.created', 'associate', p_associate_id::text, public.relative_link_snapshot(link_id));
  return new_id;
end;
$$;

CREATE FUNCTION public.relatives_insert_link(p_group_id uuid, p_associate_id uuid, p_relative_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare new_id uuid;
begin
  if p_relative_id in (select id from public.relatives where associate_id = p_associate_id) then
    raise exception 'O jovem não pode ser responsável por si mesmo';
  end if;
  if exists (select 1 from public.relative_links where associate_id = p_associate_id and relative_id = p_relative_id) then
    raise exception 'Este responsável já está vinculado ao jovem';
  end if;
  insert into public.relative_links(group_id, associate_id, relative_id, kinship, kinship_note, legal, financial, position)
  values (p_group_id, p_associate_id, p_relative_id, p_kinship, p_kinship_note, coalesce(p_legal, false), coalesce(p_financial, false),
    (select coalesce(max(position), 0) + 1 from public.relative_links where associate_id = p_associate_id))
  returning id into new_id;
  return new_id;
end;
$$;

CREATE FUNCTION public.relatives_link(p_associate_id uuid, p_relative_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare gid uuid; clean_note text; link_id uuid;
begin
  gid := public.relatives_check_associate(p_associate_id);
  if not exists (select 1 from public.relatives where id = p_relative_id and group_id = gid) then raise exception 'Responsável não encontrado'; end if;
  clean_note := public.relatives_check_kinship(p_kinship, p_kinship_note);
  link_id := public.relatives_insert_link(gid, p_associate_id, p_relative_id, p_kinship, clean_note, p_legal, p_financial);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (gid, auth.uid(), 'relative.linked', 'associate', p_associate_id::text, public.relative_link_snapshot(link_id));
  return link_id;
end;
$$;

CREATE FUNCTION public.relatives_rename(p_relative_id uuid, p_name text, p_relative_associate_id uuid, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r public.relatives%rowtype; clean_name text;
begin
  select * into r from public.relatives where id = p_relative_id for update;
  if r.id is null or not public.can_manage_associates(r.group_id) then raise exception 'Responsável não encontrado ou sem permissão'; end if;
  clean_name := public.relatives_check_details(r.group_id, p_name, p_relative_associate_id, p_notes);
  if exists (select 1 from public.relative_links where relative_id = r.id and associate_id = p_relative_associate_id) then
    raise exception 'O jovem não pode ser responsável por si mesmo';
  end if;
  update public.relatives set name = clean_name, associate_id = p_relative_associate_id, notes = nullif(trim(p_notes), ''), updated_at = now()
  where id = r.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (r.group_id, auth.uid(), 'relative.updated', 'relative', r.id::text,
    jsonb_build_object('before', jsonb_build_object('name', r.name, 'associate_id', r.associate_id, 'notes', r.notes),
      'after', jsonb_build_object('name', clean_name, 'associate_id', p_relative_associate_id, 'notes', nullif(trim(p_notes), ''))));
end;
$$;

CREATE FUNCTION public.relatives_unlink(p_link_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare l public.relative_links%rowtype; before_state jsonb; removed boolean := false;
begin
  select * into l from public.relative_links where id = p_link_id for update;
  if l.id is null or not public.can_manage_associates(l.group_id) then raise exception 'Vínculo não encontrado ou sem permissão'; end if;
  before_state := public.relative_link_snapshot(l.id);
  delete from public.relative_links where id = l.id;
  if not exists (select 1 from public.relative_links where relative_id = l.relative_id)
     and not exists (select 1 from public.control_statuses s
                     left join public.control_item_audiences a on a.item_id = s.item_id and a.audience = 'responsavel'
                     where s.relative_id = l.relative_id and (s.note is not null or a.initial_status is distinct from s.status)) then
    delete from public.relatives where id = l.relative_id;
    removed := true;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (l.group_id, auth.uid(), 'relative.unlinked', 'associate', l.associate_id::text, before_state || jsonb_build_object('relative_deleted', removed));
end;
$$;

CREATE FUNCTION public.relatives_update_link(p_link_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare l public.relative_links%rowtype; clean_note text; before_state jsonb;
begin
  select * into l from public.relative_links where id = p_link_id for update;
  if l.id is null or not public.can_manage_associates(l.group_id) then raise exception 'Vínculo não encontrado ou sem permissão'; end if;
  clean_note := public.relatives_check_kinship(p_kinship, p_kinship_note);
  before_state := public.relative_link_snapshot(l.id);
  update public.relative_links set kinship = p_kinship, kinship_note = clean_note, legal = coalesce(p_legal, false), financial = coalesce(p_financial, false)
  where id = l.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (l.group_id, auth.uid(), 'relative.link_updated', 'associate', l.associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.relative_link_snapshot(l.id)));
end;
$$;

CREATE FUNCTION public.rename_import_profile(p_profile_id uuid, p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  profile public.import_profiles;
  new_name text := trim(coalesce(p_name, ''));
begin
  select * into profile from public.import_profiles where id = p_profile_id for update;
  if profile.id is null or not public.can_edit_group(profile.group_id) then raise exception 'Perfil não encontrado'; end if;
  if char_length(new_name) not between 2 and 80 then raise exception 'Informe um nome de perfil com 2 a 80 caracteres'; end if;
  if exists (select 1 from public.import_profiles where group_id = profile.group_id and lower(name) = lower(new_name) and id <> profile.id) then
    raise exception 'Já existe um perfil com esse nome';
  end if;
  if new_name = profile.name then return; end if;

  update public.import_profiles set name = new_name, updated_by = auth.uid(), updated_at = now() where id = profile.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (profile.group_id, auth.uid(), 'import_profile.renamed', 'import_profile', profile.id::text,
    jsonb_build_object('before', jsonb_build_object('name', profile.name), 'after', jsonb_build_object('name', new_name)));
end;
$$;

CREATE FUNCTION public.renumber_categories(p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  with recursive ranked as (
    select id, parent_id,
      row_number() over (partition by parent_id order by position, public.category_code_key(code) nulls last, lower(name), id) as n
    from public.categories where group_id = p_group_id and parent_id is not null
  ), tree as (
    select c.id, c.code as new_code, c.position as new_position, c.kind as new_kind
    from public.categories c where c.group_id = p_group_id and c.parent_id is null and c.code is not null
    union all
    select r.id, tree.new_code || '.' || r.n, (r.n - 1)::int, tree.new_kind
    from ranked r join tree on tree.id = r.parent_id
  )
  update public.categories c set code = t.new_code, position = t.new_position, kind = t.new_kind
  from tree t
  where t.id = c.id and (c.code, c.position, c.kind) is distinct from (t.new_code, t.new_position, t.new_kind);
end;
$$;

CREATE FUNCTION public.reopen_statement_line(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare line_group uuid; line_status public.statement_line_status; previous_reason text;
begin
  select group_id, status, ignored_reason into line_group, line_status, previous_reason from public.statement_lines where id = p_id for update;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if line_status <> 'ignorada' then raise exception 'Só linhas ignoradas podem ser reabertas (para conciliadas, desfaça o vínculo)'; end if;
  update public.statement_lines set status = 'aberta', ignored_reason = null where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (line_group, auth.uid(), 'statement_line.reopened', 'statement_line', p_id::text, jsonb_build_object('previous_reason', previous_reason));
end;
$$;

CREATE FUNCTION public.resolve_entry_account(p_group_id uuid, p_payment_method_id uuid, p_account_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare chosen uuid;
begin
  if p_account_id is not null then return p_account_id; end if;
  select a.id into chosen from public.payment_methods pm join public.accounts a on a.id = pm.default_account_id
  where pm.id = p_payment_method_id and pm.group_id = p_group_id and a.group_id = p_group_id and a.active;
  return coalesce(chosen, public.fallback_account(p_group_id));
end;
$$;

CREATE FUNCTION public.review_ledger_entries(p_group_id uuid, p_entry_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare done_id uuid; total integer := 0;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para revisar lançamentos neste grupo'; end if;
  for done_id in
    update public.ledger_entries set review_status = 'revisado', reviewed_by = auth.uid(), reviewed_at = now()
    where group_id = p_group_id and id = any(p_entry_ids) and review_status = 'para_revisar'
    returning id
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'ledger_entry.reviewed', 'ledger_entry', done_id::text, '{}'::jsonb);
    total := total + 1;
  end loop;
  return total;
end;
$$;

CREATE FUNCTION public.save_category_tree(p_group_id uuid, p_nodes jsonb, p_deleted jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  node jsonb;
  del jsonb;
  keys jsonb := '{}';
  new_id uuid;
  node_id uuid;
  new_parent uuid;
  target public.categories;
  deleted_ids uuid[];
  before jsonb;
  after jsonb;
  item record;
  bad record;
  created int := 0;
  updated int := 0;
  split_count int := 0;
  moved int;
  entry_count int := 0;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar rubricas neste grupo'; end if;
  if jsonb_typeof(p_nodes) <> 'array' or jsonb_typeof(p_deleted) <> 'array' then raise exception 'Dados inválidos'; end if;
  perform 1 from public.categories where group_id = p_group_id for update;
  select jsonb_object_agg(id, public.category_snapshot(id)) into before from public.categories where group_id = p_group_id;

  select coalesce(array_agg((value->>'id')::uuid), '{}') into deleted_ids from jsonb_array_elements(p_deleted);
  if exists (
    select 1 from unnest(deleted_ids) d
    where not exists (select 1 from public.categories c where c.id = d and c.group_id = p_group_id and not (c.parent_id is null and c.code is not null))
  ) then raise exception 'Rubrica excluída inválida (as raízes 1 e 2 não saem)'; end if;

  -- 1. chaves: rubricas existentes conferidas; novas inseridas fora da árvore (pai e código vêm depois)
  for node in select value from jsonb_array_elements(p_nodes) loop
    if char_length(trim(coalesce(node->>'name', ''))) not between 2 and 100 then
      raise exception 'Rubrica “%”: informe um nome com 2 a 100 caracteres', coalesce(trim(node->>'name'), '');
    end if;
    if nullif(node->>'id', '') is null then
      insert into public.categories(group_id, name) values (p_group_id, trim(node->>'name')) returning id into new_id;
      keys := keys || jsonb_build_object(node->>'key', new_id);
      created := created + 1;
    else
      node_id := (node->>'id')::uuid;
      if node_id = any(deleted_ids) or not exists (
        select 1 from public.categories where id = node_id and group_id = p_group_id and not (parent_id is null and code is not null)
      ) then raise exception 'Rubrica “%” não encontrada', node->>'name'; end if;
      keys := keys || jsonb_build_object(node->>'key', node_id);
    end if;
  end loop;

  -- 2. pai, posição, nome, conta contábil e ativa
  for node in select value from jsonb_array_elements(p_nodes) loop
    node_id := (keys->>(node->>'key'))::uuid;
    new_parent := coalesce(keys->>(node->>'parent'), case when node->>'parent' ~ '^[0-9a-f-]{36}$' then node->>'parent' end)::uuid;
    if new_parent is null or new_parent = any(deleted_ids)
      or not exists (select 1 from public.categories where id = new_parent and group_id = p_group_id) then
      raise exception 'Rubrica “%”: rubrica pai inválida ou excluída', node->>'name';
    end if;
    update public.categories set
      parent_id = new_parent,
      position = coalesce((node->>'position')::int, 0),
      name = trim(node->>'name'),
      ledger_code = nullif(trim(node->>'ledgerCode'), ''),
      active = coalesce((node->>'active')::boolean, true)
    where id = node_id;
  end loop;

  -- 3. árvore sem ciclos e com até 5 níveis: todas as rubricas com pai precisam ser alcançadas a partir das raízes
  with recursive tree as (
    select id, 0 as depth from public.categories where group_id = p_group_id and parent_id is null and code is not null
    union all
    select c.id, tree.depth + 1 from public.categories c join tree on c.parent_id = tree.id
    where tree.depth < 10 and not c.id = any(deleted_ids)
  )
  select
    (select count(*) from public.categories c where c.group_id = p_group_id and c.parent_id is not null and not c.id = any(deleted_ids)
       and not exists (select 1 from tree where tree.id = c.id)) as orphans,
    (select max(depth) from tree) as depth
  into bad;
  if bad.orphans > 0 then raise exception 'A árvore ficou com uma rubrica dentro dela mesma'; end if;
  if bad.depth > 4 then raise exception 'A árvore de rubricas tem no máximo 5 níveis (ex.: 2.1.1.1.1)'; end if;

  -- 4. exclusões: rateios para o destino (com evento no histórico de cada lançamento), depois as rubricas
  for del in select value from jsonb_array_elements(p_deleted) loop
    node_id := (del->>'id')::uuid;
    target := null;
    select * into target from public.categories
    where id = coalesce(keys->>(del->>'target'), case when del->>'target' ~ '^[0-9a-f-]{36}$' then del->>'target' end)::uuid
      and group_id = p_group_id and not id = any(deleted_ids);
    if target.id is null then
      if exists (select 1 from public.entry_splits where category_id = node_id) then
        raise exception 'Escolha a rubrica que recebe os rateios de “%”', before->(node_id::text)->>'name';
      end if;
      continue;
    end if;
    for item in
      select s.entry_id, count(*) as splits from public.entry_splits s where s.category_id = node_id group by s.entry_id
    loop
      entry_count := entry_count + 1;
      insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
      values (p_group_id, auth.uid(), 'ledger_entry.category_merged', 'ledger_entry', item.entry_id::text,
        jsonb_build_object('from', jsonb_build_array(jsonb_build_object('code', before->(node_id::text)->>'code', 'name', before->(node_id::text)->>'name')),
          'to', jsonb_build_object('id', target.id, 'name', target.name), 'splits', item.splits));
    end loop;
    update public.entry_splits set category_id = target.id where category_id = node_id;
    get diagnostics moved = row_count;
    split_count := split_count + moved;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'category.deleted', 'category', node_id::text,
      jsonb_build_object('before', before->(node_id::text), 'target_id', target.id, 'splits', moved));
  end loop;
  -- exclusões sem destino (sem rateios) também ficam na auditoria
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  select p_group_id, auth.uid(), 'category.deleted', 'category', d::text, jsonb_build_object('before', before->(d::text), 'splits', 0)
  from unnest(deleted_ids) d
  where not exists (select 1 from public.audit_events a where a.entity_type = 'category' and a.entity_id = d::text and a.action = 'category.deleted');
  update public.fee_settings set category_id = null where category_id = any(deleted_ids);
  update public.categories set parent_id = null where id = any(deleted_ids);
  delete from public.categories where id = any(deleted_ids);

  -- 5. códigos e tipos; rateio com o sinal errado para o novo ramo recusa tudo
  perform public.renumber_categories(p_group_id);
  select c.code, c.name, c.kind into bad
  from public.entry_splits s join public.categories c on c.id = s.category_id
  where c.group_id = p_group_id and ((c.kind = 'receita' and s.amount_cents < 0) or (c.kind = 'despesa' and s.amount_cents > 0))
  limit 1;
  if found then
    raise exception 'A rubrica % % ficou em %, mas tem rateios de %', bad.code, bad.name,
      case bad.kind when 'receita' then 'Receitas' else 'Despesas' end, case bad.kind when 'receita' then 'despesa (saída)' else 'receita (entrada)' end;
  end if;

  -- 6. auditoria das criadas e alteradas (inclusive código renumerado)
  for item in select id from public.categories where group_id = p_group_id loop
    after := public.category_snapshot(item.id);
    if not before ? item.id::text then
      insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
      values (p_group_id, auth.uid(), 'category.created', 'category', item.id::text, after);
    elsif before->(item.id::text) is distinct from after then
      updated := updated + 1;
      insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
      values (p_group_id, auth.uid(), 'category.updated', 'category', item.id::text, jsonb_build_object('before', before->(item.id::text), 'after', after));
    end if;
  end loop;

  return jsonb_build_object('created', created, 'updated', updated, 'deleted', coalesce(array_length(deleted_ids, 1), 0),
    'splits', split_count, 'entries', entry_count);
end;
$_$;

CREATE FUNCTION public.save_debt(p_group_id uuid, p_id uuid, p_associate_id uuid, p_debt_date date, p_amount_cents bigint, p_description text, p_agreement text, p_payments jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  result uuid := p_id;
  before_state jsonb;
  clean_description text := nullif(trim(p_description), '');
  clean_agreement text := nullif(trim(p_agreement), '');
  touched uuid[];
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para anotar dívidas'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id) then raise exception 'Associado não encontrado'; end if;
  if p_debt_date is null then raise exception 'Informe a data da dívida'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if clean_description is null or char_length(clean_description) not between 2 and 200 then raise exception 'Descrição: de 2 a 200 caracteres'; end if;
  if char_length(clean_agreement) > 300 then raise exception 'Acordo: no máximo 300 caracteres'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then raise exception 'Pagamentos inválidos'; end if;
  if exists (select 1 from jsonb_array_elements(p_payments) x where coalesce((x->>'amountCents')::bigint, 0) <= 0) then
    raise exception 'Informe o valor de cada pagamento';
  end if;
  if (select count(*) from jsonb_array_elements(p_payments)) <> (select count(distinct x->>'entryId') from jsonb_array_elements(p_payments) x) then
    raise exception 'Lançamento repetido nos pagamentos';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payments) x
    where not exists (select 1 from public.ledger_entries e where e.id = (x->>'entryId')::uuid and e.group_id = p_group_id)
      or public.debt_payment_cents((x->>'entryId')::uuid, p_associate_id) <= 0
  ) then raise exception 'Pagamento inválido: use um lançamento com rateio de receita deste associado'; end if;

  -- trava as dívidas do associado: as alocações de um lançamento são divididas entre elas
  perform 1 from public.debts where associate_id = p_associate_id for update;
  if p_id is not null then
    perform 1 from public.debts where id = p_id and group_id = p_group_id;
    if not found then raise exception 'Dívida não encontrada'; end if;
    before_state := public.debt_snapshot(p_id);
    update public.debts set associate_id = p_associate_id, debt_date = p_debt_date, amount_cents = p_amount_cents,
      description = clean_description, agreement = clean_agreement, updated_by = auth.uid(), updated_at = now()
    where id = p_id;
    delete from public.debt_payments where debt_id = p_id;
  else
    insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, agreement, created_by, updated_by)
    values (p_group_id, p_associate_id, p_debt_date, p_amount_cents, clean_description, clean_agreement, auth.uid(), auth.uid())
    returning id into result;
  end if;
  insert into public.debt_payments(debt_id, entry_id, amount_cents)
  select result, (x->>'entryId')::uuid, (x->>'amountCents')::bigint from jsonb_array_elements(p_payments) x;

  touched := coalesce((select array_agg((x->>'entryId')::uuid) from jsonb_array_elements(p_payments) x), '{}');
  perform public.check_debt_allocations(p_associate_id, touched, array[result]);

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'debt.created' else 'debt.updated' end, 'debt', result::text,
    jsonb_build_object('before', before_state, 'after', public.debt_snapshot(result)));
  return result;
end;
$$;

CREATE FUNCTION public.save_import_profile(p_group_id uuid, p_profile_id uuid, p_name text, p_format text, p_header_signature text, p_settings jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.section_snapshot(p_section_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('branch', s.branch, 'name', s.name, 'active', s.active) from public.sections s where s.id = p_section_id;
$$;

CREATE FUNCTION public.seed_accounts(p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.seed_categories(p_group_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare item record;
begin
  if exists (select 1 from public.categories where group_id = p_group_id and code is not null) then return; end if;
  for item in
    select code, name from (values
      ('1', 'Receitas'),
      ('1.1', 'Mensalidades'), ('1.2', 'Lojinha'), ('1.3', 'Pastelada'), ('1.4', 'Bufê de Sopas'),
      ('1.5', 'Campanhas financeiras'), ('1.6', 'Programa'),
      ('1.6.1', 'Acampamento de Grupo'), ('1.6.2', 'Acantonamento de Grupo'), ('1.6.3', 'Atividades da alcateia'),
      ('1.6.4', 'Atividades da tropa escoteira'), ('1.6.5', 'Atividades da tropa sênior'), ('1.6.6', 'Atividades do clã pioneiro'),
      ('1.7', 'Registros'), ('1.8', 'Materiais Escoteiros'),
      ('2', 'Despesas'),
      ('2.1', 'Despesas administrativas'),
      ('2.1.1', 'Cartório e contabilidades'), ('2.1.2', 'Telefone'), ('2.1.3', 'Redes sociais'), ('2.1.4', 'Domínio e hospedagem'),
      ('2.1.5', 'Material de limpeza'), ('2.1.6', 'Material de escritório'), ('2.1.7', 'Camisetas'), ('2.1.8', 'Impressões / papelaria'),
      ('2.2', 'Programa'),
      ('2.2.1', 'Escoteiro por um dia'), ('2.2.2', 'Acampamento de Grupo'), ('2.2.3', 'Acantonamento de Grupo'), ('2.2.4', 'Fórum de Jovens'),
      ('2.2.5', 'Indaba e CDEs'), ('2.2.6', 'Confraternização de encerramento'), ('2.2.7', 'Lenços'),
      ('2.2.8', 'Atividades Estratégicas Nacionais'), ('2.2.9', 'Loja Escoteira'), ('2.2.10', 'Atividades da alcateia'),
      ('2.2.11', 'Atividades da tropa escoteira'), ('2.2.12', 'Atividades da tropa sênior'), ('2.2.13', 'Atividades do clã pioneiro'),
      ('2.3', 'Gestão de Adultos'),
      ('2.3.1', 'Registros institucionais'), ('2.3.2', 'Cursos e capacitações'), ('2.3.3', 'Acampamento de adultos'),
      ('2.4', 'Manutenção dos espaços'),
      ('2.5', 'Pastelada'),
      ('2.5.1', 'Salão'), ('2.5.2', 'Ingredientes'), ('2.5.3', 'Bebidas'), ('2.5.4', 'Descartáveis'), ('2.5.5', 'Divulgação'),
      ('2.6', 'Bufê de Sopas'),
      ('2.6.1', 'Salão, decoração e limpeza'), ('2.6.2', 'Ingredientes'), ('2.6.3', 'Bebidas'), ('2.6.4', 'Descartáveis'),
      ('2.6.5', 'Divulgação e convites'),
      ('2.7', 'Eventos CML'),
      ('2.7.1', 'Almoço da Confirmação'), ('2.7.2', 'Noite das Massas'), ('2.7.3', 'Feijoada'), ('2.7.4', 'Chá da OASE'),
      ('2.7.5', 'Almoço Campeiro'), ('2.7.6', 'Jantar da Reforma'), ('2.7.7', 'Martin Lutherfest'), ('2.7.8', 'Confraternização de Advento'),
      ('2.8', 'Materiais Escoteiros'), ('2.9', 'Campanhas Financeiras')
    ) as t(code, name)
    order by public.category_code_key(code)
  loop
    insert into public.categories(group_id, code, name, kind, position, parent_id)
    values (p_group_id, item.code, item.name,
      case left(item.code, 1) when '1' then 'receita'::public.category_kind else 'despesa'::public.category_kind end,
      (public.category_code_key(item.code))[array_length(public.category_code_key(item.code), 1)],
      (select id from public.categories where group_id = p_group_id and code = regexp_replace(item.code, '\.[0-9]+$', '') and item.code like '%.%'));
  end loop;
  -- rubrica de mensalidade inicial (fee_category_ids usa só a configurada)
  insert into public.fee_settings(group_id, category_id)
  select p_group_id, id from public.categories where group_id = p_group_id and code = '1.1'
  on conflict (group_id) do nothing;
end;
$_$;

CREATE FUNCTION public.seed_payment_methods(p_group_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.payment_methods(group_id, name) values
    (p_group_id, 'PIX'), (p_group_id, 'Transferência'), (p_group_id, 'Boleto'),
    (p_group_id, 'Cartão de débito'), (p_group_id, 'Cartão de crédito'),
    (p_group_id, 'Dinheiro'), (p_group_id, 'Débito automático'), (p_group_id, 'Tarifa bancária')
  on conflict (group_id, name) do nothing;
$$;

CREATE FUNCTION public.set_account_active(p_account_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.set_category_active(p_category_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.set_entry_document_filed(p_entry_id uuid, p_filed boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare entry_group uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  update public.ledger_entries set document_filed = p_filed, updated_at = now() where id = p_entry_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.document_filed', 'ledger_entry', p_entry_id::text, jsonb_build_object('filed', p_filed));
end;
$$;

CREATE FUNCTION public.set_fee_associate_price(p_associate_id uuid, p_year integer, p_monthly_cents bigint, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare associate_group uuid; before_state jsonb; new_reason text := nullif(trim(p_reason), '');
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  select jsonb_build_object('monthly_cents', p.monthly_cents, 'reason', p.reason) into before_state
  from public.fee_associate_prices p where p.associate_id = p_associate_id and p.year = p_year;
  if p_monthly_cents is null then
    delete from public.fee_associate_prices where associate_id = p_associate_id and year = p_year;
  else
    if p_monthly_cents < 0 then raise exception 'Valor inválido'; end if;
    if new_reason is null or char_length(new_reason) not between 2 and 120 then raise exception 'Informe o motivo (2 a 120 caracteres)'; end if;
    insert into public.fee_associate_prices(group_id, associate_id, year, monthly_cents, reason, updated_by)
    values (associate_group, p_associate_id, p_year, p_monthly_cents, new_reason, auth.uid())
    on conflict (associate_id, year) do update set monthly_cents = excluded.monthly_cents, reason = excluded.reason,
      updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), case when p_monthly_cents is null then 'fee.price_removed' else 'fee.price_set' end, 'associate',
    p_associate_id::text, jsonb_build_object('year', p_year, 'before', before_state,
      'after', case when p_monthly_cents is null then null else jsonb_build_object('monthly_cents', p_monthly_cents, 'reason', new_reason) end));
end;
$$;

CREATE FUNCTION public.set_fee_exemption(p_associate_id uuid, p_year integer, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare associate_group uuid; reason text := nullif(trim(p_reason), '');
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if reason is null then
    delete from public.fee_exemptions where associate_id = p_associate_id and year = p_year;
  else
    if char_length(reason) not between 2 and 120 then raise exception 'Informe o motivo (2 a 120 caracteres)'; end if;
    insert into public.fee_exemptions(group_id, associate_id, year, reason, updated_by)
    values (associate_group, p_associate_id, p_year, reason, auth.uid())
    on conflict (associate_id, year) do update set reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), case when reason is null then 'fee.exemption_removed' else 'fee.exempted' end, 'associate', p_associate_id::text,
    jsonb_build_object('year', p_year, 'reason', reason));
end;
$$;

CREATE FUNCTION public.set_fee_record(p_associate_id uuid, p_year integer, p_month integer, p_status public.fee_status, p_note text, p_split_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  associate_group uuid;
  record_id uuid;
  before_state jsonb;
  categories uuid[];
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_month not between 3 and 12 then raise exception 'Mês inválido (março a dezembro)'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if char_length(p_note) > 200 then raise exception 'Nota: no máximo 200 caracteres'; end if;

  select id into record_id from public.fee_records where associate_id = p_associate_id and year = p_year and month = p_month for update;
  before_state := case when record_id is null then null else public.fee_record_snapshot(record_id) end;

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
    delete from public.fee_record_splits where fee_record_id = record_id;
    insert into public.fee_record_splits(fee_record_id, split_id)
    select record_id, x from (select distinct unnest(coalesce(p_split_ids, '{}')) as x) d;
  end if;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'fee.recorded', 'associate', p_associate_id::text,
    jsonb_build_object('year', p_year, 'month', p_month, 'before', before_state,
      'after', case when p_status is null then null else public.fee_record_snapshot(record_id) end));
end;
$$;

CREATE FUNCTION public.set_fee_settings(p_group_id uuid, p_due_rule public.fee_due_rule, p_due_day integer, p_category_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare before_state jsonb;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar as configurações de mensalidade'; end if;
  if p_due_rule is null then raise exception 'Escolha a regra de vencimento'; end if;
  if p_due_rule = 'dia_fixo' and coalesce(p_due_day, 0) not between 1 and 28 then raise exception 'Dia do vencimento entre 1 e 28'; end if;
  if p_due_rule = 'dia_util' and coalesce(p_due_day, 0) not between 1 and 20 then raise exception 'Dia útil entre 1 e 20'; end if;
  if p_category_id is not null and not exists (select 1 from public.categories where id = p_category_id and group_id = p_group_id) then
    raise exception 'Rubrica inválida';
  end if;
  select to_jsonb(s) - 'group_id' - 'updated_by' - 'updated_at' into before_state from public.fee_settings s where s.group_id = p_group_id;
  insert into public.fee_settings(group_id, due_rule, due_day, category_id, updated_by)
  values (p_group_id, p_due_rule, case when p_due_rule = 'fim_do_mes' then 10 else p_due_day end, p_category_id, auth.uid())
  on conflict (group_id) do update set due_rule = excluded.due_rule, due_day = excluded.due_day, category_id = excluded.category_id,
    updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'fee.settings_updated', 'group', p_group_id::text,
    jsonb_build_object('before', before_state, 'after', jsonb_build_object('due_rule', p_due_rule, 'due_day', p_due_day, 'category_id', p_category_id)));
end;
$$;

CREATE FUNCTION public.set_fee_year_settings(p_group_id uuid, p_year integer, p_monthly_cents bigint, p_discount_pct numeric, p_deadline date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare before_state jsonb;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar as configurações de mensalidade'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if coalesce(p_monthly_cents, 0) <= 0 then raise exception 'Informe o valor da mensalidade'; end if;
  if coalesce(p_discount_pct, 0) not between 0 and 100 then raise exception 'Desconto entre 0 e 100%%'; end if;
  if coalesce(p_discount_pct, 0) > 0 and p_deadline is null then raise exception 'Informe a data-limite do desconto'; end if;
  select to_jsonb(s) - 'group_id' - 'updated_by' - 'updated_at' into before_state from public.fee_year_settings s where s.group_id = p_group_id and s.year = p_year;
  insert into public.fee_year_settings(group_id, year, monthly_cents, annual_discount_pct, annual_deadline, updated_by)
  values (p_group_id, p_year, p_monthly_cents, coalesce(p_discount_pct, 0), p_deadline, auth.uid())
  on conflict (group_id, year) do update set monthly_cents = excluded.monthly_cents, annual_discount_pct = excluded.annual_discount_pct,
    annual_deadline = excluded.annual_deadline, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'fee.year_settings_updated', 'group', p_group_id::text,
    jsonb_build_object('year', p_year, 'before', before_state,
      'after', jsonb_build_object('monthly_cents', p_monthly_cents, 'annual_discount_pct', coalesce(p_discount_pct, 0), 'annual_deadline', p_deadline)));
end;
$$;

CREATE FUNCTION public.set_ledger_entry_account(p_entry_id uuid, p_account_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare entry_group uuid; old_account uuid;
begin
  select group_id, account_id into entry_group, old_account from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  if p_account_id is null or not exists (select 1 from public.accounts where id = p_account_id and group_id = entry_group and active) then
    raise exception 'Conta inválida';
  end if;
  if p_account_id = old_account then return; end if;
  update public.ledger_entries set account_id = p_account_id, updated_at = now() where id = p_entry_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.account_changed', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('from', old_account, 'to', p_account_id));
end;
$$;

CREATE FUNCTION public.set_ledger_entry_outside_statement(p_entry_id uuid, p_outside boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare entry_group uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  if coalesce(p_outside, false) and exists (select 1 from public.reconciliation_links where ledger_entry_id = p_entry_id) then
    raise exception 'O lançamento está conciliado com o extrato; desfaça o vínculo antes';
  end if;
  update public.ledger_entries set outside_statement = coalesce(p_outside, false), updated_at = now() where id = p_entry_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.outside_statement', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('outside_statement', coalesce(p_outside, false)));
end;
$$;

CREATE FUNCTION public.set_payment_method_active(p_payment_method_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.set_payment_method_default_account(p_payment_method_id uuid, p_account_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.statement_description_key(p_description text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select lower(regexp_replace(trim(coalesce(p_description, '')), '\s+', ' ', 'g'));
$$;

CREATE FUNCTION public.statement_line_fingerprint(p_account_id uuid, p_date date, p_amount_cents bigint, p_description text, p_occurrence integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select encode(sha256(convert_to(concat_ws('|', p_account_id::text, p_date::text, p_amount_cents::text,
    public.statement_description_key(p_description), p_occurrence::text), 'UTF8')), 'hex');
$$;

CREATE FUNCTION public.statement_line_snapshot(p_line_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object('account_id', l.account_id, 'line_date', l.line_date, 'description', l.description,
    'counterparty', l.counterparty, 'amount_cents', l.amount_cents, 'status', l.status, 'ignored_reason', l.ignored_reason)
  from public.statement_lines l where l.id = p_line_id;
$$;

CREATE FUNCTION public.unlink_reconciliation(p_statement_line_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare line_group uuid; set_ids uuid[];
begin
  select group_id into line_group from public.statement_lines where id = p_statement_line_id for update;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  select array_agg(distinct link_set_id) into set_ids from public.reconciliation_links where statement_line_id = p_statement_line_id;
  if set_ids is null then raise exception 'A linha não está conciliada'; end if;
  perform public.dissolve_reconciliation_sets(set_ids, 'desfeito');
end;
$$;

CREATE FUNCTION public.update_account(p_account_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text, p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.update_category(p_category_id uuid, p_parent_id uuid, p_name text, p_ledger_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare cat public.categories; parent public.categories; before_state jsonb; subtree uuid[]; height int;
begin
  select * into cat from public.categories where id = p_category_id for update;
  if cat.id is null or not public.can_edit_group(cat.group_id) then raise exception 'Rubrica não encontrada ou sem permissão'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Informe um nome com 2 a 100 caracteres'; end if;
  before_state := public.category_snapshot(p_category_id);
  if p_parent_id is distinct from cat.parent_id then
    if cat.parent_id is null and cat.code is not null then raise exception 'As rubricas raiz (1 Receitas, 2 Despesas) não mudam de lugar'; end if;
    if p_parent_id is null then raise exception 'Escolha a rubrica pai'; end if;
    select array_agg(id), max(depth) into subtree, height from public.category_subtree(p_category_id);
    if p_parent_id = any(subtree) then raise exception 'Uma rubrica não pode ficar dentro dela mesma'; end if;
    parent := public.check_category_parent(cat.group_id, p_parent_id, height);
    perform public.check_category_kind_fits(subtree, parent.kind);
    update public.categories set parent_id = parent.id, position = public.next_category_position(parent.id) where id = p_category_id;
  end if;
  update public.categories set name = trim(p_name), ledger_code = nullif(trim(p_ledger_code), '') where id = p_category_id;
  perform public.renumber_categories(cat.group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (cat.group_id, auth.uid(), 'category.updated', 'category', p_category_id::text,
    jsonb_build_object('before', before_state, 'after', public.category_snapshot(p_category_id)));
end;
$$;

CREATE FUNCTION public.update_ledger_entry(p_entry_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

  if char_length(p_notes) > 2000 then raise exception 'Observações: no máximo 2.000 caracteres'; end if;

  before_state := public.ledger_entry_snapshot(p_entry_id);

  update public.ledger_entries set
    entry_date = p_entry_date,
    name = trim(p_name),
    account_id = coalesce(p_account_id, old_account),
    payment_method_id = p_payment_method_id,
    document = nullif(trim(p_document), ''),
    document_filed = coalesce(p_document_filed, false),
    total_cents = p_total_cents,
    notes = nullif(trim(p_notes), ''),
    updated_at = now()
  where id = p_entry_id;

  delete from public.entry_splits where entry_id = p_entry_id;
  perform public.write_entry_splits(p_entry_id, entry_group, p_splits, before_state->'splits');

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.updated', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('before', before_state, 'after', public.ledger_entry_snapshot(p_entry_id)));
end;
$$;

CREATE FUNCTION public.update_patrol(p_patrol_id uuid, p_name text, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare patrol_group uuid; patrol_section uuid; before_state jsonb; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select group_id, section_id into patrol_group, patrol_section from public.patrols where id = p_patrol_id;
  if patrol_group is null or not public.can_manage_associates(patrol_group) then raise exception 'Patrulha não encontrada ou sem permissão'; end if;
  if char_length(clean_name) not between 2 and 60 then raise exception 'Informe um nome de patrulha com 2 a 60 caracteres'; end if;
  if exists (select 1 from public.patrols where section_id = patrol_section and lower(name) = lower(clean_name) and id <> p_patrol_id) then
    raise exception 'Já existe a patrulha % nesta seção', clean_name;
  end if;
  before_state := public.patrol_snapshot(p_patrol_id);
  update public.patrols set name = clean_name, active = coalesce(p_active, active), updated_at = now() where id = p_patrol_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (patrol_group, auth.uid(), 'patrol.updated', 'patrol', p_patrol_id::text,
    jsonb_build_object('before', before_state, 'after', public.patrol_snapshot(p_patrol_id)));
end;
$$;

CREATE FUNCTION public.update_payment_method(p_payment_method_id uuid, p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

CREATE FUNCTION public.update_section(p_section_id uuid, p_name text, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare section_group uuid; before_state jsonb; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select group_id into section_group from public.sections where id = p_section_id;
  if section_group is null or not public.can_manage_associates(section_group) then raise exception 'Seção não encontrada ou sem permissão'; end if;
  if char_length(clean_name) not between 2 and 60 then raise exception 'Informe um nome de seção com 2 a 60 caracteres'; end if;
  if exists (select 1 from public.sections where group_id = section_group and lower(name) = lower(clean_name) and id <> p_section_id) then
    raise exception 'Já existe a seção %', clean_name;
  end if;
  before_state := public.section_snapshot(p_section_id);
  update public.sections set name = clean_name, active = coalesce(p_active, active), updated_at = now() where id = p_section_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (section_group, auth.uid(), 'section.updated', 'section', p_section_id::text,
    jsonb_build_object('before', before_state, 'after', public.section_snapshot(p_section_id)));
end;
$$;

CREATE FUNCTION public.validate_entry_totals(p_total_cents bigint, p_splits jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare split_total bigint;
begin
  if p_total_cents = 0 then raise exception 'O total não pode ser zero'; end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then raise exception 'Informe ao menos uma rubrica'; end if;
  if exists (select 1 from jsonb_array_elements(p_splits) where coalesce((value->>'amount_cents')::bigint, 0) = 0) then
    raise exception 'O valor de cada rubrica não pode ser zero';
  end if;
  select coalesce(sum((value->>'amount_cents')::bigint), 0) into split_total from jsonb_array_elements(p_splits);
  if split_total <> p_total_cents then raise exception 'A soma das rubricas deve ser igual ao total'; end if;
end;
$$;

CREATE FUNCTION public.write_entry_splits(p_entry_id uuid, p_group_id uuid, p_splits jsonb, p_previous_splits jsonb DEFAULT '[]'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  split jsonb;
  split_category uuid;
  split_associate uuid;
  split_amount bigint;
  category_kind public.category_kind;
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
    values (p_entry_id, split_category, split_amount, trim(split->>'description'), split_associate);
  end loop;
end;
$$;

CREATE TABLE auth.sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT sessions_id_check CHECK ((id ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    google_sub text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sign_in_at timestamp with time zone,
    banned_until timestamp with time zone,
    CONSTRAINT users_email_check CHECK (((email = lower(btrim(email))) AND (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)))
);

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    kind public.account_kind DEFAULT 'corrente'::public.account_kind NOT NULL,
    bank text,
    branch text,
    number text,
    opening_balance_cents bigint DEFAULT 0 NOT NULL,
    opening_date date,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ledger_code public.ledger_code,
    CONSTRAINT accounts_bank_check CHECK ((char_length(bank) <= 60)),
    CONSTRAINT accounts_branch_check CHECK ((char_length(branch) <= 20)),
    CONSTRAINT accounts_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 60))),
    CONSTRAINT accounts_number_check CHECK ((char_length(number) <= 30))
);

CREATE TABLE public.associates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    branch public.scout_branch NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    section_id uuid,
    patrol_id uuid,
    birth_date date,
    promise_date date,
    joined_on date,
    notes text,
    review_status text DEFAULT 'revisado'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    transition_started_on date,
    registration public.associate_registration DEFAULT 'provisorio'::public.associate_registration NOT NULL,
    nickname text,
    CONSTRAINT associates_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120))),
    CONSTRAINT associates_nickname_check CHECK (((char_length(nickname) >= 1) AND (char_length(nickname) <= 8))),
    CONSTRAINT associates_notes_check CHECK ((char_length(notes) <= 500)),
    CONSTRAINT associates_patrol_needs_section CHECK (((patrol_id IS NULL) OR (section_id IS NOT NULL))),
    CONSTRAINT associates_review_status_check CHECK ((review_status = ANY (ARRAY['para_revisar'::text, 'revisado'::text])))
);

CREATE VIEW public.associate_audiences WITH (security_invoker='true') AS
 SELECT id AS associate_id,
    group_id,
    (
        CASE
            WHEN (branch = 'adulto'::public.scout_branch) THEN 'adulto'::text
            ELSE 'jovem'::text
        END)::public.control_audience AS audience
   FROM public.associates a;

CREATE TABLE public.associate_functions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    kind public.associate_function_kind NOT NULL,
    title text,
    started_on date,
    ended_on date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    section_id uuid,
    elected boolean DEFAULT false NOT NULL,
    CONSTRAINT associate_functions_check CHECK (((ended_on IS NULL) OR (started_on IS NULL) OR (ended_on >= started_on))),
    CONSTRAINT associate_functions_elected_board CHECK (((NOT elected) OR (kind = 'dirigente'::public.associate_function_kind))),
    CONSTRAINT associate_functions_section_only_scouter CHECK (((kind = 'escotista'::public.associate_function_kind) OR (section_id IS NULL))),
    CONSTRAINT associate_functions_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 80)))
);

CREATE TABLE public.sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    branch public.scout_branch NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sections_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 60)))
);

CREATE VIEW public.associate_function_rows WITH (security_invoker='true') AS
 SELECT f.id,
    f.group_id,
    f.associate_id,
    a.name AS associate_name,
    f.kind,
    f.title,
    f.started_on,
    f.ended_on,
    ((f.ended_on IS NULL) OR (f.ended_on > CURRENT_DATE)) AS active,
    f.created_at,
    f.section_id,
    s.name AS section,
    f.elected
   FROM ((public.associate_functions f
     JOIN public.associates a ON ((a.id = f.associate_id)))
     LEFT JOIN public.sections s ON ((s.id = f.section_id)));

CREATE TABLE public.associate_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    movement_date date NOT NULL,
    kind public.associate_movement_kind NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT associate_movements_reason_check CHECK ((char_length(reason) <= 120))
);

CREATE TABLE public.associate_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    move_date date NOT NULL,
    from_branch public.scout_branch NOT NULL,
    to_branch public.scout_branch NOT NULL,
    from_section_id uuid,
    to_section_id uuid,
    to_patrol_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patrols (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    section_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patrols_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 60)))
);

CREATE VIEW public.associate_rows WITH (security_invoker='true') AS
 SELECT a.id,
    a.group_id,
    a.name,
    a.branch,
    a.active,
    a.section_id,
    s.name AS section,
    a.patrol_id,
    p.name AS patrol,
    a.created_at,
    a.updated_at
   FROM ((public.associates a
     LEFT JOIN public.sections s ON ((s.id = a.section_id)))
     LEFT JOIN public.patrols p ON ((p.id = a.patrol_id)));

CREATE VIEW public.associate_profile_rows WITH (security_invoker='true') AS
 SELECT r.id,
    r.group_id,
    r.name,
    r.branch,
    r.active,
    r.section_id,
    r.section,
    r.patrol_id,
    r.patrol,
    r.created_at,
    r.updated_at,
    a.birth_date,
    a.promise_date,
    a.joined_on,
    a.notes,
        CASE
            WHEN r.active THEN NULL::date
            ELSE ( SELECT max(m.movement_date) AS max
               FROM public.associate_movements m
              WHERE ((m.associate_id = r.id) AND (m.kind = 'saida'::public.associate_movement_kind)))
        END AS left_on,
    a.review_status,
    a.transition_started_on,
    a.registration,
    a.nickname
   FROM (public.associate_rows r
     JOIN public.associates a ON ((a.id = r.id)));

CREATE TABLE public.audit_events (
    id bigint NOT NULL,
    group_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.control_item_audiences (
    item_id uuid NOT NULL,
    group_id uuid NOT NULL,
    audience public.control_audience NOT NULL,
    initial_status public.control_status
);

CREATE TABLE public.control_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    kind public.control_item_kind NOT NULL,
    value_kind public.control_value_kind DEFAULT 'situacao'::public.control_value_kind NOT NULL,
    directorate public.directorate NOT NULL,
    validity_months integer,
    remove_on_leave boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT control_items_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80))),
    CONSTRAINT control_items_validity_months_check CHECK (((validity_months >= 1) AND (validity_months <= 120)))
);

CREATE TABLE public.control_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid,
    relative_id uuid,
    item_id uuid NOT NULL,
    status public.control_status NOT NULL,
    status_date date,
    valid_until date,
    value_year integer,
    note text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT control_statuses_check CHECK ((num_nonnulls(associate_id, relative_id) = 1)),
    CONSTRAINT control_statuses_note_check CHECK ((char_length(note) <= 200)),
    CONSTRAINT control_statuses_value_year_check CHECK (((value_year >= 1900) AND (value_year <= 2100)))
);

CREATE VIEW public.control_status_rows WITH (security_invoker='true') AS
 SELECT id,
    group_id,
    associate_id,
    relative_id,
    item_id,
    status,
        CASE
            WHEN ((status = 'ok'::public.control_status) AND ((valid_until < CURRENT_DATE) OR (value_year < (EXTRACT(year FROM CURRENT_DATE))::integer))) THEN 'desatualizado'::public.control_status
            ELSE status
        END AS effective_status,
    status_date,
    valid_until,
    value_year,
    note,
    updated_at,
    updated_by
   FROM public.control_statuses s;

CREATE TABLE public.debt_payments (
    debt_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    amount_cents bigint NOT NULL,
    CONSTRAINT debt_payments_amount_positive CHECK ((amount_cents > 0))
);

CREATE TABLE public.debts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    debt_date date NOT NULL,
    amount_cents bigint NOT NULL,
    description text NOT NULL,
    agreement text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT debts_agreement_check CHECK ((char_length(agreement) <= 300)),
    CONSTRAINT debts_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT debts_description_check CHECK (((char_length(description) >= 2) AND (char_length(description) <= 200)))
);

CREATE TABLE public.entry_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entry_attachments_content_type_check CHECK ((content_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/heic'::text, 'image/heif'::text]))),
    CONSTRAINT entry_attachments_file_name_check CHECK (((length(btrim(file_name)) >= 1) AND (length(btrim(file_name)) <= 200))),
    CONSTRAINT entry_attachments_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760)))
);

CREATE TABLE public.entry_splits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    category_id uuid NOT NULL,
    amount_cents bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text NOT NULL,
    associate_id uuid,
    CONSTRAINT entry_splits_amount_cents_check CHECK ((amount_cents <> 0)),
    CONSTRAINT entry_splits_description_check CHECK (((char_length(description) >= 2) AND (char_length(description) <= 200)))
);

CREATE TABLE public.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    entry_date date NOT NULL,
    document text,
    total_cents bigint NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_method_id uuid NOT NULL,
    document_filed boolean DEFAULT false NOT NULL,
    name text NOT NULL,
    account_id uuid NOT NULL,
    outside_statement boolean DEFAULT false NOT NULL,
    notes text,
    review_status text DEFAULT 'revisado'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    CONSTRAINT ledger_entries_document_check CHECK ((char_length(document) <= 60)),
    CONSTRAINT ledger_entries_name_length CHECK (((char_length(name) >= 2) AND (char_length(name) <= 200))),
    CONSTRAINT ledger_entries_notes_check CHECK ((char_length(notes) <= 2000)),
    CONSTRAINT ledger_entries_review_status_check CHECK ((review_status = ANY (ARRAY['para_revisar'::text, 'revisado'::text]))),
    CONSTRAINT ledger_entries_total_cents_check CHECK ((total_cents <> 0))
);

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    default_account_id uuid,
    CONSTRAINT payment_methods_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 60)))
);

CREATE TABLE public.reconciliation_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statement_line_id uuid NOT NULL,
    ledger_entry_id uuid NOT NULL,
    amount_cents bigint NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    link_set_id uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT reconciliation_links_amount_cents_check CHECK ((amount_cents <> 0))
);

CREATE VIEW public.entry_split_rows WITH (security_invoker='true') AS
 SELECT s.id AS split_id,
    e.id AS entry_id,
    e.group_id,
    e.entry_date,
    e.name AS entry_name,
    e.account_id,
    acc.name AS account_name,
    acc.ledger_code AS account_ledger_code,
    e.payment_method_id,
    pm.name AS payment_method_name,
    e.document,
    e.document_filed,
    e.total_cents AS entry_total_cents,
    s.amount_cents,
    s.description,
    s.category_id,
    c.code AS category_code,
    c.name AS category_name,
    c.kind AS category_kind,
    c.ledger_code AS category_ledger_code,
    s.associate_id,
    a.name AS associate_name,
    x.external_ids,
    (EXISTS ( SELECT 1
           FROM public.reconciliation_links rl
          WHERE (rl.ledger_entry_id = e.id))) AS reconciled,
    e.outside_statement,
    concat_ws(' '::text, e.name, s.description, array_to_string(x.external_ids, ' '::text), e.notes, a.name) AS search_text,
    e.review_status
   FROM ((((((public.entry_splits s
     JOIN public.ledger_entries e ON ((e.id = s.entry_id)))
     JOIN public.payment_methods pm ON ((pm.id = e.payment_method_id)))
     JOIN public.accounts acc ON ((acc.id = e.account_id)))
     JOIN public.categories c ON ((c.id = s.category_id)))
     LEFT JOIN public.associates a ON ((a.id = s.associate_id)))
     CROSS JOIN LATERAL ( SELECT public.entry_external_ids(e.id) AS external_ids) x);

CREATE TABLE public.fee_associate_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    year integer NOT NULL,
    monthly_cents bigint NOT NULL,
    reason text NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_associate_prices_monthly_cents_check CHECK ((monthly_cents >= 0)),
    CONSTRAINT fee_associate_prices_reason_check CHECK (((char_length(reason) >= 2) AND (char_length(reason) <= 120))),
    CONSTRAINT fee_associate_prices_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);

CREATE TABLE public.fee_exemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    year integer NOT NULL,
    reason text NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_exemptions_reason_check CHECK (((char_length(reason) >= 2) AND (char_length(reason) <= 120))),
    CONSTRAINT fee_exemptions_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);

CREATE TABLE public.fee_record_splits (
    fee_record_id uuid NOT NULL,
    split_id uuid NOT NULL
);

CREATE TABLE public.fee_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    status public.fee_status NOT NULL,
    note text,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_records_month_check CHECK (((month >= 3) AND (month <= 12))),
    CONSTRAINT fee_records_note_check CHECK ((char_length(note) <= 200)),
    CONSTRAINT fee_records_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);

CREATE TABLE public.fee_settings (
    group_id uuid NOT NULL,
    due_rule public.fee_due_rule DEFAULT 'dia_fixo'::public.fee_due_rule NOT NULL,
    due_day integer DEFAULT 10 NOT NULL,
    category_id uuid,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_settings_due_day_check CHECK (((due_day >= 1) AND (due_day <= 28)))
);

CREATE VIEW public.fee_split_candidates WITH (security_invoker='true') AS
 SELECT s.id AS split_id,
    e.group_id,
    s.associate_id,
    e.id AS entry_id,
    e.entry_date,
    e.name AS entry_name,
    s.amount_cents,
    s.description,
    COALESCE(( SELECT array_agg(((r.year * 100) + r.month) ORDER BY r.year, r.month) AS array_agg
           FROM (public.fee_record_splits rs
             JOIN public.fee_records r ON ((r.id = rs.fee_record_id)))
          WHERE (rs.split_id = s.id)), '{}'::integer[]) AS linked_periods
   FROM (public.entry_splits s
     JOIN public.ledger_entries e ON ((e.id = s.entry_id)))
  WHERE ((s.associate_id IS NOT NULL) AND (s.category_id = ANY (public.fee_category_ids(e.group_id))));

CREATE TABLE public.fee_year_settings (
    group_id uuid NOT NULL,
    year integer NOT NULL,
    monthly_cents bigint NOT NULL,
    annual_discount_pct numeric(5,2) DEFAULT 0 NOT NULL,
    annual_deadline date,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_year_settings_annual_discount_pct_check CHECK (((annual_discount_pct >= (0)::numeric) AND (annual_discount_pct <= (100)::numeric))),
    CONSTRAINT fee_year_settings_monthly_cents_check CHECK ((monthly_cents > 0)),
    CONSTRAINT fee_year_settings_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT groups_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);

CREATE TABLE public.import_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    format text NOT NULL,
    header_signature text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_profiles_format_check CHECK ((format = ANY (ARRAY['csv'::text, 'ofx'::text]))),
    CONSTRAINT import_profiles_header_signature_check CHECK ((char_length(header_signature) <= 2000)),
    CONSTRAINT import_profiles_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80))),
    CONSTRAINT import_profiles_settings_check CHECK ((jsonb_typeof(settings) = 'object'::text))
);

CREATE TABLE public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    year integer NOT NULL,
    material_id uuid NOT NULL,
    location_id uuid NOT NULL,
    quantity integer NOT NULL,
    notes text,
    recorded_by uuid,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_counts_notes_check CHECK ((char_length(notes) <= 500)),
    CONSTRAINT inventory_counts_quantity_check CHECK ((quantity >= 0)),
    CONSTRAINT inventory_counts_year_check CHECK (((year >= 2000) AND (year <= 2100)))
);

CREATE TABLE public.inventory_families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_families_code_check CHECK ((code ~ '^[0-9]{3}$'::text)),
    CONSTRAINT inventory_families_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80)))
);

CREATE TABLE public.inventory_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT inventory_locations_check CHECK (((parent_id IS NULL) OR (parent_id <> id))),
    CONSTRAINT inventory_locations_description_check CHECK ((char_length(description) <= 300)),
    CONSTRAINT inventory_locations_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))
);

CREATE VIEW public.inventory_location_paths WITH (security_invoker='true') AS
 WITH RECURSIVE tree AS (
         SELECT inventory_locations.id,
            inventory_locations.group_id,
            inventory_locations.parent_id,
            inventory_locations.name,
            inventory_locations.active,
            inventory_locations.name AS path,
            0 AS depth,
            ARRAY[inventory_locations.id] AS ancestors,
            ARRAY[inventory_locations."position"] AS sort_key
           FROM public.inventory_locations
          WHERE (inventory_locations.parent_id IS NULL)
        UNION ALL
         SELECT l.id,
            l.group_id,
            l.parent_id,
            l.name,
            l.active,
            ((tree_1.path || ' › '::text) || l.name),
            (tree_1.depth + 1),
            (tree_1.ancestors || l.id),
            (tree_1.sort_key || l."position")
           FROM (public.inventory_locations l
             JOIN tree tree_1 ON ((l.parent_id = tree_1.id)))
        )
 SELECT id,
    group_id,
    parent_id,
    name,
    active,
    path,
    depth,
    ancestors,
    sort_key
   FROM tree;

CREATE TABLE public.inventory_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    family_id uuid,
    name text NOT NULL,
    tracking public.inventory_tracking NOT NULL,
    consumable boolean DEFAULT false NOT NULL,
    minimum_quantity integer,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_materials_check CHECK (((NOT consumable) OR (tracking = 'lot'::public.inventory_tracking))),
    CONSTRAINT inventory_materials_description_check CHECK ((char_length(description) <= 500)),
    CONSTRAINT inventory_materials_minimum_quantity_check CHECK ((minimum_quantity >= 0)),
    CONSTRAINT inventory_materials_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120)))
);

CREATE VIEW public.inventory_material_rows WITH (security_invoker='true') AS
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
            WHEN (m.tracking = 'lot'::public.inventory_tracking) THEN COALESCE(l.quantity, 0)
            ELSE COALESCE(u.quantity, 0)
        END AS quantity,
    COALESCE(l.lots, 0) AS lots,
    (COALESCE(l.value_cents, (0)::bigint) + COALESCE(u.value_cents, (0)::bigint)) AS estimated_value_cents,
    l.next_expiry,
    ((m.minimum_quantity IS NOT NULL) AND ((COALESCE(l.quantity, 0) + COALESCE(u.quantity, 0)) < m.minimum_quantity)) AS below_minimum,
    m.updated_at,
    public.inventory_search_normalize(concat_ws(' '::text, m.name, m.description, f.name, f.code, l.search_text, u.search_text)) AS search_text
   FROM (((public.inventory_materials m
     LEFT JOIN public.inventory_families f ON ((f.id = m.family_id)))
     LEFT JOIN LATERAL ( SELECT (sum(inventory_lots.quantity))::integer AS quantity,
            (count(*) FILTER (WHERE (inventory_lots.quantity > 0)))::integer AS lots,
            (sum((inventory_lots.quantity * COALESCE(inventory_lots.unit_value_cents, (0)::bigint))))::bigint AS value_cents,
            min(inventory_lots.expires_on) FILTER (WHERE (inventory_lots.quantity > 0)) AS next_expiry,
            string_agg(concat_ws(' '::text, inventory_lots.notes, inventory_lots.supplier), ' '::text) FILTER (WHERE (inventory_lots.quantity > 0)) AS search_text
           FROM public.inventory_lots
          WHERE (inventory_lots.material_id = m.id)) l ON (true))
     LEFT JOIN LATERAL ( SELECT (count(*))::integer AS quantity,
            (sum(COALESCE(inventory_units.unit_value_cents, (0)::bigint)))::bigint AS value_cents,
            string_agg(concat_ws(' '::text, inventory_units.tag, inventory_units.legacy_code, inventory_units.description, inventory_units.notes), ' '::text) AS search_text
           FROM public.inventory_units
          WHERE ((inventory_units.material_id = m.id) AND (inventory_units.written_off_at IS NULL))) u ON (true));

CREATE TABLE public.inventory_movements (
    id bigint NOT NULL,
    group_id uuid NOT NULL,
    kind public.inventory_movement_kind NOT NULL,
    material_id uuid NOT NULL,
    lot_id uuid,
    unit_id uuid,
    quantity integer,
    from_location_id uuid,
    to_location_id uuid,
    from_condition public.inventory_condition,
    to_condition public.inventory_condition,
    write_off_reason public.inventory_write_off_reason,
    notes text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    review_status public.inventory_review_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    review_notes text,
    channel text DEFAULT 'web'::text NOT NULL,
    CONSTRAINT inventory_movements_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'rapido'::text]))),
    CONSTRAINT inventory_movements_check CHECK (((lot_id IS NULL) OR (unit_id IS NULL))),
    CONSTRAINT inventory_movements_notes_check CHECK ((char_length(notes) <= 500)),
    CONSTRAINT inventory_movements_quantity_check CHECK ((quantity >= 0)),
    CONSTRAINT inventory_movements_review_notes_check CHECK ((char_length(review_notes) <= 500))
);

ALTER TABLE public.inventory_movements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.inventory_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE VIEW public.inventory_stock_by_location WITH (security_invoker='true') AS
 WITH stock AS (
         SELECT inventory_lots.group_id,
            inventory_lots.material_id,
            inventory_lots.location_id,
            inventory_lots.quantity,
            (inventory_lots.quantity * COALESCE(inventory_lots.unit_value_cents, (0)::bigint)) AS value_cents,
            inventory_lots.expires_on,
            inventory_lots.condition,
            inventory_lots.unit_value_cents
           FROM public.inventory_lots
          WHERE (inventory_lots.quantity > 0)
        UNION ALL
         SELECT inventory_units.group_id,
            inventory_units.material_id,
            inventory_units.location_id,
            1,
            COALESCE(inventory_units.unit_value_cents, (0)::bigint) AS "coalesce",
            NULL::date AS date,
            inventory_units.condition,
            inventory_units.unit_value_cents
           FROM public.inventory_units
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
    (array_agg(s.condition ORDER BY (public.inventory_condition_rank(s.condition)) DESC NULLS LAST))[1] AS worst_condition,
    COALESCE(c.conditions, '{}'::jsonb) AS conditions,
    min(s.unit_value_cents) AS min_unit_cents,
    max(s.unit_value_cents) AS max_unit_cents
   FROM (stock s
     LEFT JOIN by_condition c USING (group_id, material_id, location_id))
  GROUP BY s.group_id, s.material_id, s.location_id, c.conditions;

CREATE VIEW public.ledger_entry_rows AS
SELECT
    NULL::uuid AS entry_id,
    NULL::uuid AS group_id,
    NULL::date AS entry_date,
    NULL::timestamp with time zone AS created_at,
    NULL::text AS name,
    NULL::uuid AS account_id,
    NULL::text AS account_name,
    NULL::public.ledger_code AS account_ledger_code,
    NULL::uuid AS payment_method_id,
    NULL::text AS payment_method_name,
    NULL::text AS document,
    NULL::boolean AS document_filed,
    NULL::bigint AS total_cents,
    NULL::integer AS split_count,
    NULL::uuid[] AS category_ids,
    NULL::uuid[] AS associate_ids,
    NULL::boolean AS has_split_without_associate,
    NULL::text[] AS external_ids,
    NULL::boolean AS reconciled,
    NULL::boolean AS outside_statement,
    NULL::text AS search_text,
    NULL::text AS review_status;

CREATE TABLE public.memberships (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.member_role DEFAULT 'viewer'::public.member_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    inventory_role public.inventory_role DEFAULT 'viewer'::public.inventory_role NOT NULL,
    associates_role public.associates_role DEFAULT 'viewer'::public.associates_role NOT NULL
);

CREATE TABLE public.statement_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    account_id uuid NOT NULL,
    import_id uuid NOT NULL,
    line_date date NOT NULL,
    description text NOT NULL,
    kind text,
    counterparty text,
    external_id text,
    amount_cents bigint NOT NULL,
    balance_cents bigint,
    fingerprint text NOT NULL,
    status public.statement_line_status DEFAULT 'aberta'::public.statement_line_status NOT NULL,
    ignored_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    trn_type text,
    check_number text,
    reference text,
    payee text,
    CONSTRAINT statement_lines_amount_cents_check CHECK ((amount_cents <> 0)),
    CONSTRAINT statement_lines_check CHECK (((status <> 'ignorada'::public.statement_line_status) OR (ignored_reason IS NOT NULL))),
    CONSTRAINT statement_lines_check_number_check CHECK ((char_length(check_number) <= 60)),
    CONSTRAINT statement_lines_counterparty_check CHECK ((char_length(counterparty) <= 200)),
    CONSTRAINT statement_lines_description_check CHECK (((char_length(description) >= 1) AND (char_length(description) <= 500))),
    CONSTRAINT statement_lines_external_id_check CHECK ((char_length(external_id) <= 200)),
    CONSTRAINT statement_lines_ignored_reason_check CHECK ((char_length(ignored_reason) <= 200)),
    CONSTRAINT statement_lines_kind_check CHECK ((char_length(kind) <= 200)),
    CONSTRAINT statement_lines_payee_check CHECK ((char_length(payee) <= 200)),
    CONSTRAINT statement_lines_reference_check CHECK ((char_length(reference) <= 60)),
    CONSTRAINT statement_lines_trn_type_check CHECK ((char_length(trn_type) <= 20))
);

CREATE VIEW public.reconciliation_link_rows WITH (security_invoker='true') AS
 SELECT rl.id AS link_id,
    rl.link_set_id,
    l.group_id,
    l.account_id,
    rl.statement_line_id,
    l.line_date,
    l.description AS line_description,
    l.kind AS line_kind,
    l.counterparty AS line_counterparty,
    l.amount_cents AS line_amount_cents,
    l.external_id AS line_external_id,
    l.trn_type AS line_trn_type,
    rl.ledger_entry_id,
    e.entry_date,
    e.name AS entry_name,
    e.total_cents AS entry_total_cents,
    rl.amount_cents,
    rl.created_at
   FROM ((public.reconciliation_links rl
     JOIN public.statement_lines l ON ((l.id = rl.statement_line_id)))
     JOIN public.ledger_entries e ON ((e.id = rl.ledger_entry_id)));

CREATE TABLE public.reconciliation_rejections (
    statement_line_id uuid NOT NULL,
    ledger_entry_id uuid NOT NULL,
    rejected_by uuid,
    rejected_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.relative_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    associate_id uuid NOT NULL,
    relative_id uuid NOT NULL,
    kinship public.relative_kinship NOT NULL,
    kinship_note text,
    legal boolean DEFAULT false NOT NULL,
    financial boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT relative_links_check CHECK (((kinship <> 'outro'::public.relative_kinship) OR (kinship_note IS NOT NULL))),
    CONSTRAINT relative_links_kinship_note_check CHECK (((char_length(kinship_note) >= 1) AND (char_length(kinship_note) <= 40)))
);

CREATE TABLE public.relatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    associate_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT relatives_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 120))),
    CONSTRAINT relatives_notes_check CHECK ((char_length(notes) <= 200))
);

CREATE VIEW public.relative_link_rows WITH (security_invoker='true') AS
 SELECT l.id,
    l.group_id,
    l.associate_id,
    l.relative_id,
    r.name AS relative_name,
    r.associate_id AS relative_associate_id,
    l.kinship,
    l.kinship_note,
    l.legal,
    l.financial,
    l."position",
    ( SELECT (count(*))::integer AS count
           FROM public.relative_links o
          WHERE ((o.relative_id = l.relative_id) AND (o.id <> l.id))) AS sibling_count
   FROM (public.relative_links l
     JOIN public.relatives r ON ((r.id = l.relative_id)));

CREATE TABLE public.statement_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    account_id uuid NOT NULL,
    profile_id uuid,
    profile_settings jsonb,
    file_name text NOT NULL,
    imported_by uuid,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    period_from date NOT NULL,
    period_to date NOT NULL,
    line_count integer DEFAULT 0 NOT NULL,
    duplicate_count integer DEFAULT 0 NOT NULL,
    opening_balance_cents bigint,
    closing_balance_cents bigint,
    CONSTRAINT statement_imports_check CHECK ((period_from <= period_to)),
    CONSTRAINT statement_imports_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 255)))
);

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_group_id_name_key UNIQUE (group_id, name);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.associate_functions
    ADD CONSTRAINT associate_functions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.associate_movements
    ADD CONSTRAINT associate_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.associate_moves
    ADD CONSTRAINT associate_moves_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.associates
    ADD CONSTRAINT associates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_group_code_key UNIQUE (group_id, code) DEFERRABLE;

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.control_item_audiences
    ADD CONSTRAINT control_item_audiences_pkey PRIMARY KEY (item_id, audience);

ALTER TABLE ONLY public.control_items
    ADD CONSTRAINT control_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_associate_id_item_id_key UNIQUE (associate_id, item_id);

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_relative_id_item_id_key UNIQUE (relative_id, item_id);

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_pkey PRIMARY KEY (debt_id, entry_id);

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.entry_attachments
    ADD CONSTRAINT entry_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.entry_attachments
    ADD CONSTRAINT entry_attachments_storage_path_key UNIQUE (storage_path);

ALTER TABLE ONLY public.entry_splits
    ADD CONSTRAINT entry_splits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fee_associate_prices
    ADD CONSTRAINT fee_associate_prices_associate_id_year_key UNIQUE (associate_id, year);

ALTER TABLE ONLY public.fee_associate_prices
    ADD CONSTRAINT fee_associate_prices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fee_exemptions
    ADD CONSTRAINT fee_exemptions_associate_id_year_key UNIQUE (associate_id, year);

ALTER TABLE ONLY public.fee_exemptions
    ADD CONSTRAINT fee_exemptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fee_record_splits
    ADD CONSTRAINT fee_record_splits_pkey PRIMARY KEY (fee_record_id, split_id);

ALTER TABLE ONLY public.fee_records
    ADD CONSTRAINT fee_records_associate_id_year_month_key UNIQUE (associate_id, year, month);

ALTER TABLE ONLY public.fee_records
    ADD CONSTRAINT fee_records_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fee_settings
    ADD CONSTRAINT fee_settings_pkey PRIMARY KEY (group_id);

ALTER TABLE ONLY public.fee_year_settings
    ADD CONSTRAINT fee_year_settings_pkey PRIMARY KEY (group_id, year);

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_group_id_name_key UNIQUE (group_id, name);

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_group_id_year_material_id_location_id_key UNIQUE (group_id, year, material_id, location_id);

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_families
    ADD CONSTRAINT inventory_families_group_id_code_key UNIQUE (group_id, code);

ALTER TABLE ONLY public.inventory_families
    ADD CONSTRAINT inventory_families_group_id_id_key UNIQUE (group_id, id);

ALTER TABLE ONLY public.inventory_families
    ADD CONSTRAINT inventory_families_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_group_id_id_key UNIQUE (group_id, id);

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_group_id_id_key UNIQUE (group_id, id);

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_group_id_id_key UNIQUE (group_id, id);

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_units
    ADD CONSTRAINT inventory_units_group_id_id_key UNIQUE (group_id, id);

ALTER TABLE ONLY public.inventory_units
    ADD CONSTRAINT inventory_units_group_id_tag_key UNIQUE (group_id, tag);

ALTER TABLE ONLY public.inventory_units
    ADD CONSTRAINT inventory_units_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_one_group_per_user UNIQUE (user_id);

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (group_id, user_id);

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_id_section_id_key UNIQUE (id, section_id);

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_group_id_name_key UNIQUE (group_id, name);

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reconciliation_links
    ADD CONSTRAINT reconciliation_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reconciliation_links
    ADD CONSTRAINT reconciliation_links_statement_line_id_ledger_entry_id_key UNIQUE (statement_line_id, ledger_entry_id);

ALTER TABLE ONLY public.reconciliation_rejections
    ADD CONSTRAINT reconciliation_rejections_pkey PRIMARY KEY (statement_line_id, ledger_entry_id);

ALTER TABLE ONLY public.relative_links
    ADD CONSTRAINT relative_links_associate_id_relative_id_key UNIQUE (associate_id, relative_id);

ALTER TABLE ONLY public.relative_links
    ADD CONSTRAINT relative_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.relatives
    ADD CONSTRAINT relatives_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_id_group_id_branch_key UNIQUE (id, group_id, branch);

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_id_group_id_key UNIQUE (id, group_id);

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.statement_imports
    ADD CONSTRAINT statement_imports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.statement_lines
    ADD CONSTRAINT statement_lines_account_id_fingerprint_key UNIQUE (account_id, fingerprint);

ALTER TABLE ONLY public.statement_lines
    ADD CONSTRAINT statement_lines_pkey PRIMARY KEY (id);

CREATE INDEX sessions_expires_idx ON auth.sessions USING btree (expires_at);

CREATE INDEX sessions_user_idx ON auth.sessions USING btree (user_id);

CREATE INDEX accounts_group_idx ON public.accounts USING btree (group_id);

CREATE INDEX associate_functions_associate_idx ON public.associate_functions USING btree (associate_id);

CREATE INDEX associate_functions_group_idx ON public.associate_functions USING btree (group_id);

CREATE INDEX associate_functions_section_idx ON public.associate_functions USING btree (section_id);

CREATE INDEX associate_movements_associate_idx ON public.associate_movements USING btree (associate_id, movement_date);

CREATE INDEX associate_movements_group_idx ON public.associate_movements USING btree (group_id);

CREATE INDEX associate_moves_associate_idx ON public.associate_moves USING btree (associate_id, move_date);

CREATE INDEX associate_moves_group_idx ON public.associate_moves USING btree (group_id);

CREATE INDEX associates_group_name_idx ON public.associates USING btree (group_id, name);

CREATE INDEX associates_review_idx ON public.associates USING btree (group_id) WHERE (review_status = 'para_revisar'::text);

CREATE INDEX associates_section_idx ON public.associates USING btree (section_id);

CREATE INDEX audit_events_entity_idx ON public.audit_events USING btree (entity_type, entity_id);

CREATE INDEX audit_events_group_created_idx ON public.audit_events USING btree (group_id, created_at DESC);

CREATE INDEX categories_group_idx ON public.categories USING btree (group_id);

CREATE INDEX categories_parent_idx ON public.categories USING btree (parent_id);

CREATE INDEX control_item_audiences_group_idx ON public.control_item_audiences USING btree (group_id);

CREATE INDEX control_items_group_idx ON public.control_items USING btree (group_id, directorate, "position");

CREATE UNIQUE INDEX control_items_group_name_idx ON public.control_items USING btree (group_id, lower(name));

CREATE INDEX control_statuses_group_idx ON public.control_statuses USING btree (group_id);

CREATE INDEX control_statuses_item_idx ON public.control_statuses USING btree (item_id);

CREATE INDEX debt_payments_entry_idx ON public.debt_payments USING btree (entry_id);

CREATE INDEX debts_associate_idx ON public.debts USING btree (associate_id);

CREATE INDEX debts_group_date_idx ON public.debts USING btree (group_id, debt_date);

CREATE INDEX entry_attachments_entry_idx ON public.entry_attachments USING btree (entry_id);

CREATE INDEX entry_attachments_group_idx ON public.entry_attachments USING btree (group_id);

CREATE INDEX entry_splits_associate_idx ON public.entry_splits USING btree (associate_id);

CREATE INDEX entry_splits_category_idx ON public.entry_splits USING btree (category_id);

CREATE INDEX entry_splits_entry_idx ON public.entry_splits USING btree (entry_id);

CREATE INDEX fee_associate_prices_group_year_idx ON public.fee_associate_prices USING btree (group_id, year);

CREATE INDEX fee_exemptions_group_year_idx ON public.fee_exemptions USING btree (group_id, year);

CREATE INDEX fee_record_splits_split_idx ON public.fee_record_splits USING btree (split_id);

CREATE INDEX fee_records_group_year_idx ON public.fee_records USING btree (group_id, year);

CREATE INDEX import_profiles_signature_idx ON public.import_profiles USING btree (group_id, header_signature);

CREATE INDEX inventory_counts_year_idx ON public.inventory_counts USING btree (group_id, year);

CREATE UNIQUE INDEX inventory_families_name_idx ON public.inventory_families USING btree (group_id, lower(name));

CREATE UNIQUE INDEX inventory_locations_name_idx ON public.inventory_locations USING btree (group_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE INDEX inventory_locations_parent_idx ON public.inventory_locations USING btree (group_id, parent_id);

CREATE INDEX inventory_lots_expires_idx ON public.inventory_lots USING btree (group_id, expires_on) WHERE ((expires_on IS NOT NULL) AND (quantity > 0));

CREATE INDEX inventory_lots_location_idx ON public.inventory_lots USING btree (group_id, location_id);

CREATE INDEX inventory_lots_material_idx ON public.inventory_lots USING btree (group_id, material_id);

CREATE INDEX inventory_materials_family_idx ON public.inventory_materials USING btree (group_id, family_id);

CREATE UNIQUE INDEX inventory_materials_name_idx ON public.inventory_materials USING btree (group_id, lower(name));

CREATE INDEX inventory_movements_group_date_idx ON public.inventory_movements USING btree (group_id, created_at DESC);

CREATE INDEX inventory_movements_material_idx ON public.inventory_movements USING btree (group_id, material_id, created_at DESC);

CREATE INDEX inventory_movements_review_idx ON public.inventory_movements USING btree (group_id, review_status) WHERE (review_status = 'para_revisar'::public.inventory_review_status);

CREATE INDEX inventory_units_location_idx ON public.inventory_units USING btree (group_id, location_id);

CREATE INDEX inventory_units_material_idx ON public.inventory_units USING btree (group_id, material_id);

CREATE INDEX ledger_entries_account_date_idx ON public.ledger_entries USING btree (account_id, entry_date);

CREATE INDEX ledger_entries_group_date_idx ON public.ledger_entries USING btree (group_id, entry_date DESC);

CREATE INDEX ledger_entries_group_filed_idx ON public.ledger_entries USING btree (group_id) WHERE (NOT document_filed);

CREATE INDEX ledger_entries_review_idx ON public.ledger_entries USING btree (group_id) WHERE (review_status = 'para_revisar'::text);

CREATE INDEX memberships_user_idx ON public.memberships USING btree (user_id);

CREATE UNIQUE INDEX patrols_section_name_key ON public.patrols USING btree (section_id, lower(name));

CREATE INDEX payment_methods_default_account_idx ON public.payment_methods USING btree (default_account_id);

CREATE INDEX payment_methods_group_idx ON public.payment_methods USING btree (group_id);

CREATE INDEX reconciliation_links_entry_idx ON public.reconciliation_links USING btree (ledger_entry_id);

CREATE INDEX reconciliation_links_line_idx ON public.reconciliation_links USING btree (statement_line_id);

CREATE INDEX reconciliation_links_set_idx ON public.reconciliation_links USING btree (link_set_id);

CREATE INDEX reconciliation_rejections_entry_idx ON public.reconciliation_rejections USING btree (ledger_entry_id);

CREATE INDEX relative_links_group_idx ON public.relative_links USING btree (group_id);

CREATE INDEX relative_links_relative_idx ON public.relative_links USING btree (relative_id);

CREATE INDEX relatives_associate_idx ON public.relatives USING btree (associate_id);

CREATE INDEX relatives_group_idx ON public.relatives USING btree (group_id);

CREATE UNIQUE INDEX sections_group_name_key ON public.sections USING btree (group_id, lower(name));

CREATE INDEX statement_imports_account_idx ON public.statement_imports USING btree (account_id, imported_at DESC);

CREATE INDEX statement_lines_account_date_idx ON public.statement_lines USING btree (account_id, line_date);

CREATE UNIQUE INDEX statement_lines_external_idx ON public.statement_lines USING btree (account_id, external_id, line_date, amount_cents) WHERE (external_id IS NOT NULL);

CREATE INDEX statement_lines_import_idx ON public.statement_lines USING btree (import_id);

CREATE INDEX statement_lines_open_idx ON public.statement_lines USING btree (account_id, line_date) WHERE (status = 'aberta'::public.statement_line_status);

CREATE OR REPLACE VIEW public.ledger_entry_rows WITH (security_invoker='true') AS
 SELECT e.id AS entry_id,
    e.group_id,
    e.entry_date,
    e.created_at,
    e.name,
    e.account_id,
    acc.name AS account_name,
    acc.ledger_code AS account_ledger_code,
    e.payment_method_id,
    pm.name AS payment_method_name,
    e.document,
    e.document_filed,
    e.total_cents,
    (count(s.id))::integer AS split_count,
    COALESCE(array_agg(DISTINCT s.category_id) FILTER (WHERE (s.category_id IS NOT NULL)), '{}'::uuid[]) AS category_ids,
    COALESCE(array_agg(DISTINCT s.associate_id) FILTER (WHERE (s.associate_id IS NOT NULL)), '{}'::uuid[]) AS associate_ids,
    COALESCE(bool_or((s.associate_id IS NULL)), false) AS has_split_without_associate,
    x.external_ids,
    (EXISTS ( SELECT 1
           FROM public.reconciliation_links rl
          WHERE (rl.ledger_entry_id = e.id))) AS reconciled,
    e.outside_statement,
    concat_ws(' '::text, e.name, string_agg(s.description, ' '::text), array_to_string(x.external_ids, ' '::text), e.notes, string_agg(DISTINCT a.name, ' '::text)) AS search_text,
    e.review_status
   FROM (((((public.ledger_entries e
     JOIN public.payment_methods pm ON ((pm.id = e.payment_method_id)))
     JOIN public.accounts acc ON ((acc.id = e.account_id)))
     LEFT JOIN public.entry_splits s ON ((s.entry_id = e.id)))
     LEFT JOIN public.associates a ON ((a.id = s.associate_id)))
     CROSS JOIN LATERAL ( SELECT public.entry_external_ids(e.id) AS external_ids) x)
  GROUP BY e.id, pm.name, acc.name, acc.ledger_code, x.external_ids;

CREATE TRIGGER associate_movements_sync_active AFTER INSERT OR DELETE ON public.associate_movements FOR EACH ROW EXECUTE FUNCTION public.associates_sync_active();

CREATE TRIGGER associates_clear_transition BEFORE UPDATE ON public.associates FOR EACH ROW EXECUTE FUNCTION public.associates_clear_transition();

CREATE TRIGGER groups_seed_control_items AFTER INSERT ON public.groups FOR EACH ROW EXECUTE FUNCTION public.groups_seed_control_items();

CREATE TRIGGER ledger_entry_audit AFTER INSERT ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.audit_ledger_entry_created();

CREATE TRIGGER ledger_entry_reconciliation_on_delete BEFORE DELETE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_entry_reconciliation_guard();

CREATE TRIGGER ledger_entry_reconciliation_on_update AFTER UPDATE OF total_cents, account_id ON public.ledger_entries FOR EACH ROW WHEN (((old.total_cents IS DISTINCT FROM new.total_cents) OR (old.account_id IS DISTINCT FROM new.account_id))) EXECUTE FUNCTION public.ledger_entry_reconciliation_guard();

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associate_functions
    ADD CONSTRAINT associate_functions_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associate_functions
    ADD CONSTRAINT associate_functions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.associate_functions
    ADD CONSTRAINT associate_functions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associate_functions
    ADD CONSTRAINT associate_functions_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.associate_movements
    ADD CONSTRAINT associate_movements_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associate_movements
    ADD CONSTRAINT associate_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.associate_movements
    ADD CONSTRAINT associate_movements_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associate_moves
    ADD CONSTRAINT associate_moves_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associate_moves
    ADD CONSTRAINT associate_moves_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.associate_moves
    ADD CONSTRAINT associate_moves_from_section_id_fkey FOREIGN KEY (from_section_id) REFERENCES public.sections(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.associate_moves
    ADD CONSTRAINT associate_moves_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associate_moves
    ADD CONSTRAINT associate_moves_to_patrol_id_fkey FOREIGN KEY (to_patrol_id) REFERENCES public.patrols(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.associate_moves
    ADD CONSTRAINT associate_moves_to_section_id_fkey FOREIGN KEY (to_section_id) REFERENCES public.sections(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.associates
    ADD CONSTRAINT associates_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.associates
    ADD CONSTRAINT associates_patrol_fkey FOREIGN KEY (patrol_id, section_id) REFERENCES public.patrols(id, section_id);

ALTER TABLE ONLY public.associates
    ADD CONSTRAINT associates_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.associates
    ADD CONSTRAINT associates_section_fkey FOREIGN KEY (section_id, group_id, branch) REFERENCES public.sections(id, group_id, branch);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.control_item_audiences
    ADD CONSTRAINT control_item_audiences_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.control_item_audiences
    ADD CONSTRAINT control_item_audiences_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.control_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.control_items
    ADD CONSTRAINT control_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.control_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_relative_id_fkey FOREIGN KEY (relative_id) REFERENCES public.relatives(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.control_statuses
    ADD CONSTRAINT control_statuses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES public.debts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.debt_payments
    ADD CONSTRAINT debt_payments_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.ledger_entries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.debts
    ADD CONSTRAINT debts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.entry_attachments
    ADD CONSTRAINT entry_attachments_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.ledger_entries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.entry_attachments
    ADD CONSTRAINT entry_attachments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.entry_attachments
    ADD CONSTRAINT entry_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.entry_splits
    ADD CONSTRAINT entry_splits_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id);

ALTER TABLE ONLY public.entry_splits
    ADD CONSTRAINT entry_splits_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);

ALTER TABLE ONLY public.entry_splits
    ADD CONSTRAINT entry_splits_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.ledger_entries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_associate_prices
    ADD CONSTRAINT fee_associate_prices_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_associate_prices
    ADD CONSTRAINT fee_associate_prices_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_associate_prices
    ADD CONSTRAINT fee_associate_prices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fee_exemptions
    ADD CONSTRAINT fee_exemptions_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_exemptions
    ADD CONSTRAINT fee_exemptions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_exemptions
    ADD CONSTRAINT fee_exemptions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fee_record_splits
    ADD CONSTRAINT fee_record_splits_fee_record_id_fkey FOREIGN KEY (fee_record_id) REFERENCES public.fee_records(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_record_splits
    ADD CONSTRAINT fee_record_splits_split_id_fkey FOREIGN KEY (split_id) REFERENCES public.entry_splits(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_records
    ADD CONSTRAINT fee_records_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_records
    ADD CONSTRAINT fee_records_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_records
    ADD CONSTRAINT fee_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fee_settings
    ADD CONSTRAINT fee_settings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fee_settings
    ADD CONSTRAINT fee_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_settings
    ADD CONSTRAINT fee_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fee_year_settings
    ADD CONSTRAINT fee_year_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fee_year_settings
    ADD CONSTRAINT fee_year_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_group_id_location_id_fkey FOREIGN KEY (group_id, location_id) REFERENCES public.inventory_locations(group_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_group_id_material_id_fkey FOREIGN KEY (group_id, material_id) REFERENCES public.inventory_materials(group_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_families
    ADD CONSTRAINT inventory_families_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inventory_locations
    ADD CONSTRAINT inventory_locations_group_id_parent_id_fkey FOREIGN KEY (group_id, parent_id) REFERENCES public.inventory_locations(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_group_id_location_id_fkey FOREIGN KEY (group_id, location_id) REFERENCES public.inventory_locations(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_group_id_material_id_fkey FOREIGN KEY (group_id, material_id) REFERENCES public.inventory_materials(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_group_id_family_id_fkey FOREIGN KEY (group_id, family_id) REFERENCES public.inventory_families(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_materials
    ADD CONSTRAINT inventory_materials_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_group_id_lot_id_fkey FOREIGN KEY (group_id, lot_id) REFERENCES public.inventory_lots(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_group_id_material_id_fkey FOREIGN KEY (group_id, material_id) REFERENCES public.inventory_materials(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_group_id_unit_id_fkey FOREIGN KEY (group_id, unit_id) REFERENCES public.inventory_units(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_units
    ADD CONSTRAINT inventory_units_group_id_location_id_fkey FOREIGN KEY (group_id, location_id) REFERENCES public.inventory_locations(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.inventory_units
    ADD CONSTRAINT inventory_units_group_id_material_id_fkey FOREIGN KEY (group_id, material_id) REFERENCES public.inventory_materials(group_id, id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id);

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.patrols
    ADD CONSTRAINT patrols_section_id_group_id_fkey FOREIGN KEY (section_id, group_id) REFERENCES public.sections(id, group_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_default_account_id_fkey FOREIGN KEY (default_account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reconciliation_links
    ADD CONSTRAINT reconciliation_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reconciliation_links
    ADD CONSTRAINT reconciliation_links_ledger_entry_id_fkey FOREIGN KEY (ledger_entry_id) REFERENCES public.ledger_entries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reconciliation_links
    ADD CONSTRAINT reconciliation_links_statement_line_id_fkey FOREIGN KEY (statement_line_id) REFERENCES public.statement_lines(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reconciliation_rejections
    ADD CONSTRAINT reconciliation_rejections_ledger_entry_id_fkey FOREIGN KEY (ledger_entry_id) REFERENCES public.ledger_entries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reconciliation_rejections
    ADD CONSTRAINT reconciliation_rejections_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reconciliation_rejections
    ADD CONSTRAINT reconciliation_rejections_statement_line_id_fkey FOREIGN KEY (statement_line_id) REFERENCES public.statement_lines(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.relative_links
    ADD CONSTRAINT relative_links_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.relative_links
    ADD CONSTRAINT relative_links_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.relative_links
    ADD CONSTRAINT relative_links_relative_id_fkey FOREIGN KEY (relative_id) REFERENCES public.relatives(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.relatives
    ADD CONSTRAINT relatives_associate_id_fkey FOREIGN KEY (associate_id) REFERENCES public.associates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.relatives
    ADD CONSTRAINT relatives_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.statement_imports
    ADD CONSTRAINT statement_imports_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.statement_imports
    ADD CONSTRAINT statement_imports_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.statement_imports
    ADD CONSTRAINT statement_imports_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.statement_imports
    ADD CONSTRAINT statement_imports_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.import_profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.statement_lines
    ADD CONSTRAINT statement_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.statement_lines
    ADD CONSTRAINT statement_lines_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.statement_lines
    ADD CONSTRAINT statement_lines_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.statement_imports(id) ON DELETE CASCADE;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit" ON public.audit_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.memberships m
  WHERE ((m.group_id = audit_events.group_id) AND (m.user_id = auth.uid()) AND (m.role = 'admin'::public.member_role)))));

ALTER TABLE public.associate_functions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.associate_movements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.associate_moves ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.associates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.control_item_audiences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.control_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.control_statuses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editors manage associates" ON public.associates USING (public.can_edit_group(group_id)) WITH CHECK (public.can_edit_group(group_id));

CREATE POLICY "editors read debt payments" ON public.debt_payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.debts d
  WHERE ((d.id = debt_payments.debt_id) AND public.can_edit_group(d.group_id)))));

CREATE POLICY "editors read debts" ON public.debts FOR SELECT USING (public.can_edit_group(group_id));

ALTER TABLE public.entry_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entry_splits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fee_associate_prices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fee_exemptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fee_record_splits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fee_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fee_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fee_year_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.import_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_families ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_materials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read accounts" ON public.accounts FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read associate functions" ON public.associate_functions FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read associate movements" ON public.associate_movements FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read associate moves" ON public.associate_moves FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read associates" ON public.associates FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read categories" ON public.categories FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read control item audiences" ON public.control_item_audiences FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read control items" ON public.control_items FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read control statuses" ON public.control_statuses FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read entries" ON public.ledger_entries FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read entry attachments" ON public.entry_attachments FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read fee associate prices" ON public.fee_associate_prices FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read fee exemptions" ON public.fee_exemptions FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read fee record splits" ON public.fee_record_splits FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.fee_records r
  WHERE ((r.id = fee_record_splits.fee_record_id) AND public.is_group_member(r.group_id)))));

CREATE POLICY "members read fee records" ON public.fee_records FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read fee settings" ON public.fee_settings FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read fee year settings" ON public.fee_year_settings FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read groups" ON public.groups FOR SELECT USING (public.is_group_member(id));

CREATE POLICY "members read import profiles" ON public.import_profiles FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read inventory counts" ON public.inventory_counts FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read inventory families" ON public.inventory_families FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read inventory locations" ON public.inventory_locations FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read inventory lots" ON public.inventory_lots FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read inventory materials" ON public.inventory_materials FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read inventory movements" ON public.inventory_movements FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read inventory units" ON public.inventory_units FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read memberships" ON public.memberships FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read patrols" ON public.patrols FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read payment methods" ON public.payment_methods FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read reconciliation links" ON public.reconciliation_links FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.statement_lines l
  WHERE ((l.id = reconciliation_links.statement_line_id) AND public.is_group_member(l.group_id)))));

CREATE POLICY "members read reconciliation rejections" ON public.reconciliation_rejections FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.statement_lines l
  WHERE ((l.id = reconciliation_rejections.statement_line_id) AND public.is_group_member(l.group_id)))));

CREATE POLICY "members read relative links" ON public.relative_links FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read relatives" ON public.relatives FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read sections" ON public.sections FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read splits" ON public.entry_splits FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.ledger_entries e
  WHERE ((e.id = entry_splits.entry_id) AND public.is_group_member(e.group_id)))));

CREATE POLICY "members read statement imports" ON public.statement_imports FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "members read statement lines" ON public.statement_lines FOR SELECT USING (public.is_group_member(group_id));

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patrols ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reconciliation_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reconciliation_rejections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.relative_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.relatives ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.statement_imports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.statement_lines ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO geas_auth;

GRANT USAGE ON SCHEMA public TO authenticated;

REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT ALL ON FUNCTION auth.uid() TO authenticated;
GRANT ALL ON FUNCTION auth.uid() TO geas_auth;

REVOKE ALL ON FUNCTION public.account_balance_before(p_account_id uuid, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.account_balance_before(p_account_id uuid, p_date date) TO authenticated;

REVOKE ALL ON FUNCTION public.account_snapshot(p_account_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.add_associate_movement(p_associate_id uuid, p_date date, p_kind public.associate_movement_kind, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_associate_movement(p_associate_id uuid, p_date date, p_kind public.associate_movement_kind, p_reason text) TO authenticated;

REVOKE ALL ON FUNCTION public.add_entry_attachment(p_entry_id uuid, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.add_entry_attachment(p_entry_id uuid, p_storage_path text, p_file_name text, p_content_type text, p_size_bytes bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_add_member(p_group_id uuid, p_email text, p_role public.member_role, p_inventory_role public.inventory_role, p_associates_role public.associates_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_add_member(p_group_id uuid, p_email text, p_role public.member_role, p_inventory_role public.inventory_role, p_associates_role public.associates_role) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_bootstrap_group(p_admin_email text, p_group_name text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_change_associates_role(p_group_id uuid, p_user_id uuid, p_role public.associates_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_change_associates_role(p_group_id uuid, p_user_id uuid, p_role public.associates_role) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_change_inventory_role(p_group_id uuid, p_user_id uuid, p_role public.inventory_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_change_inventory_role(p_group_id uuid, p_user_id uuid, p_role public.inventory_role) TO authenticated;

GRANT ALL ON FUNCTION public.admin_change_member_role(p_group_id uuid, p_user_id uuid, p_role public.member_role) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_remove_member(p_group_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_remove_member(p_group_id uuid, p_user_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.associate_audience_of(p_associate_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associate_function_snapshot(p_function_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associate_snapshot(p_associate_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associates_add_function(p_associate_id uuid, p_kind public.associate_function_kind, p_title text, p_started_on date, p_section_id uuid, p_elected boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_add_function(p_associate_id uuid, p_kind public.associate_function_kind, p_title text, p_started_on date, p_section_id uuid, p_elected boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_check_details(p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associates_check_function_section(p_group_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_current uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associates_check_placement(p_group_id uuid, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associates_create(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_create(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_create_quick(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_create_quick(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_delete_function(p_function_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_delete_function(p_function_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_end_function(p_function_id uuid, p_ended_on date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_end_function(p_function_id uuid, p_ended_on date) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_function_taken(p_associate_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text, p_except uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associates_leave(p_associate_id uuid, p_date date, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_leave(p_associate_id uuid, p_date date, p_reason text) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_move(p_associate_id uuid, p_date date, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_move(p_associate_id uuid, p_date date, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_next_branch(p_branch public.scout_branch) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associates_rejoin(p_associate_id uuid, p_date date, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_rejoin(p_associate_id uuid, p_date date, p_reason text) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_review(p_group_id uuid, p_associate_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_review(p_group_id uuid, p_associate_ids uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_seed_control_items(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_seed_control_items(p_group_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_set_transition(p_associate_id uuid, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_set_transition(p_associate_id uuid, p_date date) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_sync_active() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.associates_update(p_associate_id uuid, p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text, p_registration public.associate_registration, p_nickname text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_update(p_associate_id uuid, p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text, p_registration public.associate_registration, p_nickname text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.associates_update_function(p_function_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text, p_started_on date, p_ended_on date, p_elected boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.associates_update_function(p_function_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text, p_started_on date, p_ended_on date, p_elected boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.can_delete_attachment_object(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_delete_attachment_object(p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.can_read_attachment_object(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_read_attachment_object(p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.can_write_attachment_object(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_write_attachment_object(p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.category_snapshot(p_category_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.category_subtree(p_category_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.check_category_kind_fits(p_ids uuid[], p_kind public.category_kind) FROM PUBLIC;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.categories TO authenticated;

REVOKE ALL ON FUNCTION public.check_category_parent(p_group_id uuid, p_parent_id uuid, p_height integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.check_debt_allocations(p_associate_id uuid, p_entry_ids uuid[], p_debt_ids uuid[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.confirm_fee_suggestions(p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_fee_suggestions(p_items jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.control_item_applies(p_item_id uuid, p_audience public.control_audience) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_item_check(p_group_id uuid, p_item_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_item_create(p_group_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer, p_remove_on_leave boolean, p_value_kind public.control_value_kind) FROM PUBLIC;
GRANT ALL ON FUNCTION public.control_item_create(p_group_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer, p_remove_on_leave boolean, p_value_kind public.control_value_kind) TO authenticated;

REVOKE ALL ON FUNCTION public.control_item_place(p_item_id uuid, p_position integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.control_item_place(p_item_id uuid, p_position integer) TO authenticated;

REVOKE ALL ON FUNCTION public.control_item_save_audiences(p_item_id uuid, p_group_id uuid, p_audiences jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_item_snapshot(p_item_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_item_update(p_item_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer, p_remove_on_leave boolean, p_active boolean, p_value_kind public.control_value_kind) FROM PUBLIC;
GRANT ALL ON FUNCTION public.control_item_update(p_item_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer, p_remove_on_leave boolean, p_active boolean, p_value_kind public.control_value_kind) TO authenticated;

REVOKE ALL ON FUNCTION public.control_items_renumber(p_group_id uuid, p_directorate public.directorate) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_items_seed(p_group_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_status_check(p_group_id uuid, p_item_id uuid, p_audience public.control_audience, p_who text, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer, OUT o_status public.control_status, OUT o_valid_until date) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_status_clear(p_associate_id uuid, p_item_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.control_status_clear(p_associate_id uuid, p_item_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.control_status_clear_relative(p_relative_id uuid, p_item_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.control_status_clear_relative(p_relative_id uuid, p_item_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.control_status_set(p_associate_id uuid, p_item_id uuid, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.control_status_set(p_associate_id uuid, p_item_id uuid, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer) TO authenticated;

REVOKE ALL ON FUNCTION public.control_status_set_relative(p_relative_id uuid, p_item_id uuid, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.control_status_set_relative(p_relative_id uuid, p_item_id uuid, p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year integer) TO authenticated;

REVOKE ALL ON FUNCTION public.control_status_snapshot(p_associate_id uuid, p_item_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_status_snapshot_relative(p_relative_id uuid, p_item_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.control_statuses_init(p_group_id uuid, p_associate_id uuid, p_relative_id uuid, p_audience public.control_audience) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_account(p_group_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text, p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_account(p_group_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text, p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_category(p_group_id uuid, p_parent_id uuid, p_name text, p_ledger_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_category(p_group_id uuid, p_parent_id uuid, p_name text, p_ledger_code text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_entries_from_statement_lines(p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_entries_from_statement_lines(p_items jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.create_entry_from_statement_line(p_statement_line_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_entry_from_statement_line(p_statement_line_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_ledger_entry(p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_ledger_entry(p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_patrol(p_section_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_patrol(p_section_id uuid, p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_payment_method(p_group_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_payment_method(p_group_id uuid, p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_quick_ledger_entry(p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_total_cents bigint, p_category_id uuid, p_description text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_quick_ledger_entry(p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_total_cents bigint, p_category_id uuid, p_description text, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_section(p_group_id uuid, p_branch public.scout_branch, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_section(p_group_id uuid, p_branch public.scout_branch, p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.debt_money(p_cents bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.debt_payment_cents(p_entry_id uuid, p_associate_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.debt_rows(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.debt_rows(p_group_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.debt_snapshot(p_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_associate_movement(p_movement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_associate_movement(p_movement_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_debt(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_debt(p_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_entry_attachment(p_attachment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_entry_attachment(p_attachment_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_import_profile(p_profile_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_import_profile(p_profile_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_ledger_entry(p_entry_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_ledger_entry(p_entry_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_statement_import(p_import_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_statement_import(p_import_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.dissolve_reconciliation_sets(p_set_ids uuid[], p_reason text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.entry_external_ids(p_entry_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fallback_account(p_group_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.fee_category_ids(p_group_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fee_record_snapshot(p_record_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.group_users(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.group_users(p_group_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.groups_seed_control_items() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ignore_statement_line(p_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ignore_statement_line(p_id uuid, p_reason text) TO authenticated;

REVOKE ALL ON FUNCTION public.ignore_statement_lines(p_ids uuid[], p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ignore_statement_lines(p_ids uuid[], p_reason text) TO authenticated;

REVOKE ALL ON FUNCTION public.import_associates(p_group_id uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_associates(p_group_id uuid, p_rows jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.import_statement_lines(p_account_id uuid, p_profile_id uuid, p_profile_settings jsonb, p_file_name text, p_period_from date, p_period_to date, p_opening_balance_cents bigint, p_closing_balance_cents bigint, p_lines jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_statement_lines(p_account_id uuid, p_profile_id uuid, p_profile_settings jsonb, p_file_name text, p_period_from date, p_period_to date, p_opening_balance_cents bigint, p_closing_balance_cents bigint, p_lines jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_add_lot(p_material_id uuid, p_location_id uuid, p_quantity integer, p_condition public.inventory_condition, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text, p_variant text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_add_lot(p_material_id uuid, p_location_id uuid, p_quantity integer, p_condition public.inventory_condition, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text, p_variant text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_add_unit(p_material_id uuid, p_location_id uuid, p_tag text, p_legacy_code text, p_description text, p_condition public.inventory_condition, p_unit_value_cents bigint, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_add_unit(p_material_id uuid, p_location_id uuid, p_tag text, p_legacy_code text, p_description text, p_condition public.inventory_condition, p_unit_value_cents bigint, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_adjust_lot(p_lot_id uuid, p_quantity integer, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_adjust_lot(p_lot_id uuid, p_quantity integer, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_check_location(p_group_id uuid, p_location_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.inventory_check_tag(p_group_id uuid, p_material_id uuid, p_unit_id uuid, p_tag text) FROM PUBLIC;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_lots TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_lock_lot(p_lot_id uuid) FROM PUBLIC;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_units TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_lock_unit(p_unit_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.inventory_log(p_group_id uuid, p_kind public.inventory_movement_kind, p_material_id uuid, p_lot_id uuid, p_unit_id uuid, p_quantity integer, p_from_location uuid, p_to_location uuid, p_from_condition public.inventory_condition, p_to_condition public.inventory_condition, p_reason public.inventory_write_off_reason, p_notes text, p_details jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.inventory_matching_lot(p_material_id uuid, p_location_id uuid, p_condition public.inventory_condition, p_expires_on date, p_variant text, p_except uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.inventory_merged_value(p_value bigint, p_quantity integer, p_added_value bigint, p_added integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.inventory_next_location_position(p_group_id uuid, p_parent_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.inventory_next_tag(p_family_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_next_tag(p_family_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_place_location(p_id uuid, p_target uuid, p_place text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_place_location(p_id uuid, p_target uuid, p_place text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_quick(p_action text, p_args jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_quick(p_action text, p_args jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_record_count(p_material_id uuid, p_location_id uuid, p_year integer, p_quantity integer, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_record_count(p_material_id uuid, p_location_id uuid, p_year integer, p_quantity integer, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_review_movements(p_group_id uuid, p_ids bigint[], p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_review_movements(p_group_id uuid, p_ids bigint[], p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_save_family(p_group_id uuid, p_id uuid, p_name text, p_code text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_save_family(p_group_id uuid, p_id uuid, p_name text, p_code text, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_save_location(p_group_id uuid, p_id uuid, p_parent_id uuid, p_name text, p_description text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_save_location(p_group_id uuid, p_id uuid, p_parent_id uuid, p_name text, p_description text, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_save_material(p_group_id uuid, p_id uuid, p_family_id uuid, p_name text, p_tracking public.inventory_tracking, p_consumable boolean, p_minimum_quantity integer, p_description text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_save_material(p_group_id uuid, p_id uuid, p_family_id uuid, p_name text, p_tracking public.inventory_tracking, p_consumable boolean, p_minimum_quantity integer, p_description text, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_set_lot_condition(p_lot_id uuid, p_condition public.inventory_condition, p_quantity integer, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_set_lot_condition(p_lot_id uuid, p_condition public.inventory_condition, p_quantity integer, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_set_unit_condition(p_unit_id uuid, p_condition public.inventory_condition, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_set_unit_condition(p_unit_id uuid, p_condition public.inventory_condition, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_split_lot(p_lot public.inventory_lots, p_quantity integer, p_location_id uuid, p_condition public.inventory_condition) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.inventory_transfer_lot(p_lot_id uuid, p_to_location_id uuid, p_quantity integer, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_transfer_lot(p_lot_id uuid, p_to_location_id uuid, p_quantity integer, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_transfer_unit(p_unit_id uuid, p_to_location_id uuid, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_transfer_unit(p_unit_id uuid, p_to_location_id uuid, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_update_lot(p_lot_id uuid, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text, p_variant text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_update_lot(p_lot_id uuid, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text, p_variant text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_update_unit(p_unit_id uuid, p_tag text, p_legacy_code text, p_description text, p_unit_value_cents bigint, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_update_unit(p_unit_id uuid, p_tag text, p_legacy_code text, p_description text, p_unit_value_cents bigint, p_acquired_on date, p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_write_off_lot(p_lot_id uuid, p_quantity integer, p_reason public.inventory_write_off_reason, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_write_off_lot(p_lot_id uuid, p_quantity integer, p_reason public.inventory_write_off_reason, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.inventory_write_off_unit(p_unit_id uuid, p_reason public.inventory_write_off_reason, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inventory_write_off_unit(p_unit_id uuid, p_reason public.inventory_write_off_reason, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.ledger_entry_history(p_entry_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ledger_entry_history(p_entry_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ledger_entry_reconciliation_guard() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ledger_entry_snapshot(p_entry_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.link_reconciliation(p_statement_line_ids uuid[], p_ledger_entry_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_reconciliation(p_statement_line_ids uuid[], p_ledger_entry_ids uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.move_ledger_entries_account(p_entry_ids uuid[], p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_ledger_entries_account(p_entry_ids uuid[], p_account_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.next_category_position(p_parent_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.patrol_snapshot(p_patrol_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pay_debts(p_group_id uuid, p_associate_id uuid, p_entry_id uuid, p_allocations jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pay_debts(p_group_id uuid, p_associate_id uuid, p_entry_id uuid, p_allocations jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.preview_statement_lines(p_account_id uuid, p_period_from date, p_period_to date, p_lines jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.preview_statement_lines(p_account_id uuid, p_period_from date, p_period_to date, p_lines jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.realized_by_month(p_group_id uuid, p_year integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.realized_by_month(p_group_id uuid, p_year integer) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_reconciliation_suggestion(p_statement_line_id uuid, p_ledger_entry_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_reconciliation_suggestion(p_statement_line_id uuid, p_ledger_entry_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.relative_link_snapshot(p_link_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.relatives_check_associate(p_associate_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.relatives_check_details(p_group_id uuid, p_name text, p_relative_associate_id uuid, p_notes text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.relatives_check_kinship(p_kinship public.relative_kinship, p_kinship_note text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.relatives_create(p_associate_id uuid, p_name text, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean, p_relative_associate_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.relatives_create(p_associate_id uuid, p_name text, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean, p_relative_associate_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.relatives_insert_link(p_group_id uuid, p_associate_id uuid, p_relative_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.relatives_link(p_associate_id uuid, p_relative_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.relatives_link(p_associate_id uuid, p_relative_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.relatives_rename(p_relative_id uuid, p_name text, p_relative_associate_id uuid, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.relatives_rename(p_relative_id uuid, p_name text, p_relative_associate_id uuid, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.relatives_unlink(p_link_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.relatives_unlink(p_link_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.relatives_update_link(p_link_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.relatives_update_link(p_link_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.rename_import_profile(p_profile_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rename_import_profile(p_profile_id uuid, p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.renumber_categories(p_group_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.reopen_statement_line(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reopen_statement_line(p_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_entry_account(p_group_id uuid, p_payment_method_id uuid, p_account_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.review_ledger_entries(p_group_id uuid, p_entry_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.review_ledger_entries(p_group_id uuid, p_entry_ids uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.save_category_tree(p_group_id uuid, p_nodes jsonb, p_deleted jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_category_tree(p_group_id uuid, p_nodes jsonb, p_deleted jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.save_debt(p_group_id uuid, p_id uuid, p_associate_id uuid, p_debt_date date, p_amount_cents bigint, p_description text, p_agreement text, p_payments jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_debt(p_group_id uuid, p_id uuid, p_associate_id uuid, p_debt_date date, p_amount_cents bigint, p_description text, p_agreement text, p_payments jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.save_import_profile(p_group_id uuid, p_profile_id uuid, p_name text, p_format text, p_header_signature text, p_settings jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_import_profile(p_group_id uuid, p_profile_id uuid, p_name text, p_format text, p_header_signature text, p_settings jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.section_snapshot(p_section_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.seed_accounts(p_group_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.seed_categories(p_group_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.seed_payment_methods(p_group_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.set_account_active(p_account_id uuid, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_account_active(p_account_id uuid, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_category_active(p_category_id uuid, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_category_active(p_category_id uuid, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_entry_document_filed(p_entry_id uuid, p_filed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_entry_document_filed(p_entry_id uuid, p_filed boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_fee_associate_price(p_associate_id uuid, p_year integer, p_monthly_cents bigint, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_fee_associate_price(p_associate_id uuid, p_year integer, p_monthly_cents bigint, p_reason text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_fee_exemption(p_associate_id uuid, p_year integer, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_fee_exemption(p_associate_id uuid, p_year integer, p_reason text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_fee_record(p_associate_id uuid, p_year integer, p_month integer, p_status public.fee_status, p_note text, p_split_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_fee_record(p_associate_id uuid, p_year integer, p_month integer, p_status public.fee_status, p_note text, p_split_ids uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.set_fee_settings(p_group_id uuid, p_due_rule public.fee_due_rule, p_due_day integer, p_category_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_fee_settings(p_group_id uuid, p_due_rule public.fee_due_rule, p_due_day integer, p_category_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_fee_year_settings(p_group_id uuid, p_year integer, p_monthly_cents bigint, p_discount_pct numeric, p_deadline date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_fee_year_settings(p_group_id uuid, p_year integer, p_monthly_cents bigint, p_discount_pct numeric, p_deadline date) TO authenticated;

REVOKE ALL ON FUNCTION public.set_ledger_entry_account(p_entry_id uuid, p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_ledger_entry_account(p_entry_id uuid, p_account_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_ledger_entry_outside_statement(p_entry_id uuid, p_outside boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_ledger_entry_outside_statement(p_entry_id uuid, p_outside boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_payment_method_active(p_payment_method_id uuid, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_payment_method_active(p_payment_method_id uuid, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.set_payment_method_default_account(p_payment_method_id uuid, p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_payment_method_default_account(p_payment_method_id uuid, p_account_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.statement_line_snapshot(p_line_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.unlink_reconciliation(p_statement_line_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unlink_reconciliation(p_statement_line_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_account(p_account_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text, p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_account(p_account_id uuid, p_name text, p_kind public.account_kind, p_bank text, p_branch text, p_number text, p_opening_balance_cents bigint, p_opening_date date, p_ledger_code text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_category(p_category_id uuid, p_parent_id uuid, p_name text, p_ledger_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_category(p_category_id uuid, p_parent_id uuid, p_name text, p_ledger_code text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_ledger_entry(p_entry_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_ledger_entry(p_entry_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text, p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid, p_notes text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_patrol(p_patrol_id uuid, p_name text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_patrol(p_patrol_id uuid, p_name text, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.update_payment_method(p_payment_method_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_payment_method(p_payment_method_id uuid, p_name text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_section(p_section_id uuid, p_name text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_section(p_section_id uuid, p_name text, p_active boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.write_entry_splits(p_entry_id uuid, p_group_id uuid, p_splits jsonb, p_previous_splits jsonb) FROM PUBLIC;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.sessions TO geas_auth;

GRANT SELECT,UPDATE ON TABLE auth.users TO geas_auth;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.accounts TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associates TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associate_audiences TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associate_functions TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sections TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associate_function_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associate_movements TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associate_moves TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.patrols TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associate_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.associate_profile_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.audit_events TO authenticated;

GRANT SELECT,USAGE ON SEQUENCE public.audit_events_id_seq TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.control_item_audiences TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.control_items TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.control_statuses TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.control_status_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.debt_payments TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.debts TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.entry_attachments TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.entry_splits TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ledger_entries TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment_methods TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reconciliation_links TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.entry_split_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fee_associate_prices TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fee_exemptions TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fee_record_splits TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fee_records TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fee_settings TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fee_split_candidates TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fee_year_settings TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.groups TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.import_profiles TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_counts TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_families TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_locations TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_location_paths TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_materials TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_material_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_movements TO authenticated;

GRANT SELECT,USAGE ON SEQUENCE public.inventory_movements_id_seq TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_stock_by_location TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ledger_entry_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.memberships TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.statement_lines TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reconciliation_link_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reconciliation_rejections TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.relative_links TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.relatives TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.relative_link_rows TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.statement_imports TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO authenticated;
