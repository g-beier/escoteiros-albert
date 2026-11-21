-- Módulo Associados (apps/gestao/docs/associados/): papel próprio, cadastro completo e passagens.
--
-- Papel por módulo, no padrão do Inventário (032): o administrador do grupo é secretaria; os demais têm
-- `memberships.associates_role` (secretaria = manager, consulta = viewer). Durante a transição, a
-- tesouraria (can_edit_group) continua podendo cadastrar associados, seções e equipes.
--
-- Períodos no grupo reaproveitam `associate_movements` (022: entrada/saída). `associates.active` continua
-- coluna, mantida em sincronia por associates_leave/associates_rejoin. Passagens (mudança de ramo, seção
-- ou equipe, inclusive pioneiro → adulto) ficam em `associate_moves`.
-- Escrita do módulo só pelas funções auditadas abaixo; a política "editors manage associates" (004)
-- e as escritas diretas do Financeiro continuam como estão.

-- Papel ----------------------------------------------------------------------------------------
create type public.associates_role as enum ('manager', 'viewer');
alter table public.memberships add column associates_role public.associates_role not null default 'viewer';

create function public.associates_role_of(p_group_id uuid)
returns public.associates_role language sql stable security definer set search_path = '' as $$
  select case when role = 'admin' then 'manager'::public.associates_role else associates_role end
  from public.memberships where group_id = p_group_id and user_id = auth.uid();
$$;

create function public.can_manage_associates(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.associates_role_of(p_group_id) = 'manager', false) or public.can_edit_group(p_group_id);
$$;

create function public.admin_change_associates_role(p_group_id uuid, p_user_id uuid, p_role public.associates_role)
returns void language plpgsql security definer set search_path = '' as $$
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

-- Cadastro -------------------------------------------------------------------------------------
alter table public.associates
  add column birth_date date,
  add column promise_date date,
  add column joined_on date, -- entrada original no grupo; nulo = desconhecida
  add column notes text check (char_length(notes) <= 500);

-- Passagens: mudança de ramo, seção ou equipe com data.
create table public.associate_moves (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  move_date date not null,
  from_branch public.scout_branch not null,
  to_branch public.scout_branch not null,
  from_section_id uuid references public.sections(id) on delete set null,
  to_section_id uuid references public.sections(id) on delete set null,
  to_patrol_id uuid references public.patrols(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index associate_moves_associate_idx on public.associate_moves(associate_id, move_date);
create index associate_moves_group_idx on public.associate_moves(group_id);
alter table public.associate_moves enable row level security;
create policy "members read associate moves" on public.associate_moves for select using (public.is_group_member(group_id));

-- Leitura do cadastro completo: associate_rows + dados pessoais e a data da última saída (se desligado).
create view public.associate_profile_rows with (security_invoker = true) as
select r.id, r.group_id, r.name, r.branch, r.active,
  r.section_id, r.section, r.patrol_id, r.patrol,
  r.created_at, r.updated_at,
  a.birth_date, a.promise_date, a.joined_on, a.notes,
  case when r.active then null else (
    select max(m.movement_date) from public.associate_movements m where m.associate_id = r.id and m.kind = 'saida'
  ) end as left_on
from public.associate_rows r
join public.associates a on a.id = r.id;
grant select on public.associate_profile_rows to authenticated;

-- Funções auditadas ----------------------------------------------------------------------------

create function public.associate_snapshot(p_associate_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', a.name, 'branch', a.branch, 'section_id', a.section_id, 'patrol_id', a.patrol_id,
    'active', a.active, 'birth_date', a.birth_date, 'promise_date', a.promise_date, 'joined_on', a.joined_on, 'notes', a.notes)
  from public.associates a where a.id = p_associate_id;
$$;

-- Confere ramo, seção e equipe (mensagens claras antes das chaves estrangeiras compostas).
create function public.associates_check_placement(p_group_id uuid, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
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

-- Confere e limpa os dados pessoais; devolve o nome limpo.
create function public.associates_check_details(p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text)
returns text language plpgsql stable security definer set search_path = '' as $$
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

create function public.associates_create(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid,
  p_birth_date date, p_promise_date date, p_joined_on date, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associate.created', 'associate', new_id::text, public.associate_snapshot(new_id));
  return new_id;
end;
$$;

-- Dados pessoais. Ramo, seção e equipe só mudam por passagem (associates_move).
create function public.associates_update(p_associate_id uuid, p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare associate_group uuid; before_state jsonb; clean_name text;
begin
  select group_id into associate_group from public.associates where id = p_associate_id for update;
  if associate_group is null or not public.can_manage_associates(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  clean_name := public.associates_check_details(p_name, p_birth_date, p_promise_date, p_joined_on, p_notes);
  before_state := public.associate_snapshot(p_associate_id);
  update public.associates set name = clean_name, birth_date = p_birth_date, promise_date = p_promise_date,
    joined_on = p_joined_on, notes = nullif(trim(p_notes), ''), updated_at = now()
  where id = p_associate_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'associate.updated', 'associate', p_associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.associate_snapshot(p_associate_id)));
end;
$$;

-- Passagem: troca de ramo, seção ou equipe (pioneiro → adulto zera seção e equipe).
create function public.associates_move(p_associate_id uuid, p_date date, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; new_id uuid;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes da passagem'; end if;
  if p_date is null then raise exception 'Informe a data da passagem'; end if;
  if p_date > current_date then raise exception 'A data da passagem não pode ser futura'; end if;
  perform public.associates_check_placement(a.group_id, p_branch, p_section_id, p_patrol_id);
  if a.branch = p_branch and a.section_id is not distinct from p_section_id and a.patrol_id is not distinct from p_patrol_id then
    raise exception 'A passagem não muda ramo, seção nem equipe';
  end if;
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

-- Desligamento: movimento de saída e active = false.
create function public.associates_leave(p_associate_id uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; last_entry date;
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
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.left', 'associate', a.id::text,
    jsonb_build_object('date', p_date, 'reason', nullif(trim(p_reason), '')));
end;
$$;

-- Reingresso: movimento de entrada e active = true.
create function public.associates_rejoin(p_associate_id uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
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

-- Seções e equipes (028/030): agora pela secretaria (ou tesouraria, na transição). Só muda a checagem.
create or replace function public.create_section(p_group_id uuid, p_branch public.scout_branch, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
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

create or replace function public.update_section(p_section_id uuid, p_name text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
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

create or replace function public.create_patrol(p_section_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
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

create or replace function public.update_patrol(p_patrol_id uuid, p_name text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
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

-- Importação de associados (028): mesma função, agora pela secretaria (ou tesouraria, na transição).
create or replace function public.import_associates(p_group_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
      values (p_group_id, row_name, row_branch, row_section, row_patrol, row_active);
      created := created + 1;
    else
      update public.associates set branch = row_branch, section_id = row_section, patrol_id = row_patrol, active = row_active, updated_at = now()
      where id = row_id and group_id = p_group_id;
      if not found then raise exception 'Linha %: associado não encontrado', idx; end if;
      updated := updated + 1;
    end if;
  end loop;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associates.imported', 'associate', p_group_id::text,
    jsonb_build_object('created', created, 'updated', updated));
  return jsonb_build_object('created', created, 'updated', updated);
end;
$$;

-- Permissões das funções -----------------------------------------------------------------------
-- Auxiliares internas: só chamadas por outras funções security definer.
revoke all on function public.associate_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.associates_check_placement(uuid, public.scout_branch, uuid, uuid) from public, anon, authenticated;
revoke all on function public.associates_check_details(text, date, date, date, text) from public, anon, authenticated;

revoke all on function public.admin_change_associates_role(uuid, uuid, public.associates_role) from public, anon;
revoke all on function public.associates_create(uuid, text, public.scout_branch, uuid, uuid, date, date, date, text) from public, anon;
revoke all on function public.associates_update(uuid, text, date, date, date, text) from public, anon;
revoke all on function public.associates_move(uuid, date, public.scout_branch, uuid, uuid) from public, anon;
revoke all on function public.associates_leave(uuid, date, text) from public, anon;
revoke all on function public.associates_rejoin(uuid, date, text) from public, anon;

grant execute on function public.admin_change_associates_role(uuid, uuid, public.associates_role) to authenticated;
grant execute on function public.associates_create(uuid, text, public.scout_branch, uuid, uuid, date, date, date, text) to authenticated;
grant execute on function public.associates_update(uuid, text, date, date, date, text) to authenticated;
grant execute on function public.associates_move(uuid, date, public.scout_branch, uuid, uuid) to authenticated;
grant execute on function public.associates_leave(uuid, date, text) to authenticated;
grant execute on function public.associates_rejoin(uuid, date, text) to authenticated;
