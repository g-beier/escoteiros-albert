-- Atividades (Azmut → Gestão): calendário, locais, lobinhos, base de jogos/atividades.
-- Escrita pelas funções auditadas; leitura para membros do grupo.
-- Materiais do inventário Azmut ficam de fora — fase posterior liga ao inventário do Gestão.

-- Papéis ---------------------------------------------------------------------------------------
create type public.activities_role as enum ('manager', 'chief', 'viewer');
alter table public.memberships add column activities_role public.activities_role not null default 'viewer';

create or replace function public.activities_role_of(p_group_id uuid)
returns public.activities_role language sql stable security definer set search_path = '' as $$
  select case when role = 'admin' then 'manager'::public.activities_role else activities_role end
  from public.memberships where group_id = p_group_id and user_id = auth.uid();
$$;

create or replace function public.can_manage_activities(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.activities_role_of(p_group_id) = 'manager', false);
$$;

create or replace function public.can_edit_activities(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.activities_role_of(p_group_id) in ('manager', 'chief'), false);
$$;

create or replace function public.admin_change_activities_role(p_group_id uuid, p_user_id uuid, p_role public.activities_role)
returns void language plpgsql security definer set search_path = '' as $$
declare old_role public.activities_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem alterar papéis';
  end if;
  select activities_role into old_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if old_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  update public.memberships set activities_role = p_role where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.activities_role_changed', 'user', p_user_id::text, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

-- Tipos ----------------------------------------------------------------------------------------
create type public.activity_kind as enum ('normal', 'bivaque', 'acampamento', 'museu', 'cacador');
create type public.activity_base_category as enum ('cerimonia', 'cancao', 'jogo', 'atividade', 'rotina');

-- Locais ---------------------------------------------------------------------------------------
create table public.activity_venues (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  owner_name text check (char_length(owner_name) <= 120),
  phone text check (char_length(phone) <= 40),
  website text check (char_length(website) <= 200),
  address text check (char_length(address) <= 300),
  police text check (char_length(police) <= 200),
  hospital text check (char_length(hospital) <= 200),
  notes text check (char_length(notes) <= 1000),
  safety_items jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

-- Lobinhos / jovens ----------------------------------------------------------------------------
create table public.activity_youth (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  pack text not null check (char_length(pack) between 1 and 40),
  birth_date date,
  guardian text check (char_length(guardian) <= 120),
  progress jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activity_youth_group_pack_idx on public.activity_youth(group_id, pack, active, name);

-- Variáveis alternativas de progressão ---------------------------------------------------------
create table public.activity_progress_alts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  axis smallint not null check (axis >= 1),
  block smallint not null check (block >= 1),
  description text not null check (char_length(description) between 2 and 300),
  created_at timestamptz not null default now()
);

create index activity_progress_alts_block_idx on public.activity_progress_alts(group_id, axis, block);

-- Base de jogos / atividades -------------------------------------------------------------------
create table public.activity_base (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 160),
  description text check (char_length(description) <= 4000),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  category public.activity_base_category,
  areas text[] not null default '{}',
  progress jsonb not null default '[]'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activity_base_group_idx on public.activity_base(group_id, active, name);
create index activity_base_category_idx on public.activity_base(group_id, category);

-- Atividades (calendário) ----------------------------------------------------------------------
-- schedule: [{ id, date, start, duration, name?, category?, description, responsible?, materials? }]
-- authorization_doc: { venueId?, venueName?, notes?, costs[], menu[], safety{} }
-- (coluna não se chama "authorization": palavra reservada no Postgres)
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  kind public.activity_kind not null default 'normal',
  title text check (char_length(title) <= 160),
  starts_on date not null,
  ends_on date,
  start_time time not null,
  end_time time,
  schedule jsonb not null default '[]'::jsonb,
  authorization_doc jsonb,
  attendance uuid[] not null default '{}',
  plan_actions text[] not null default '{}',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index activities_group_date_idx on public.activities(group_id, starts_on);

-- RLS ------------------------------------------------------------------------------------------
alter table public.activity_venues enable row level security;
alter table public.activity_youth enable row level security;
alter table public.activity_progress_alts enable row level security;
alter table public.activity_base enable row level security;
alter table public.activities enable row level security;

create policy "members read activity venues" on public.activity_venues for select using (public.is_group_member(group_id));
create policy "members read activity youth" on public.activity_youth for select using (public.is_group_member(group_id));
create policy "members read activity progress alts" on public.activity_progress_alts for select using (public.is_group_member(group_id));
create policy "members read activity base" on public.activity_base for select using (public.is_group_member(group_id));
create policy "members read activities" on public.activities for select using (public.is_group_member(group_id));

-- Sem policies de write diretas: só as funções abaixo.

-- Touch ----------------------------------------------------------------------------------------
create or replace function public.touch_activity_row()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger activity_venues_touch before update on public.activity_venues for each row execute function public.touch_activity_row();
create trigger activity_youth_touch before update on public.activity_youth for each row execute function public.touch_activity_row();
create trigger activity_base_touch before update on public.activity_base for each row execute function public.touch_activity_row();
create trigger activities_touch before update on public.activities for each row execute function public.touch_activity_row();

-- CRUD atividades ------------------------------------------------------------------------------
create or replace function public.activity_save(
  p_group_id uuid,
  p_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_starts_on date,
  p_ends_on date,
  p_start_time time,
  p_end_time time,
  p_schedule jsonb default '[]'::jsonb,
  p_authorization jsonb default null,
  p_attendance uuid[] default '{}',
  p_plan_actions text[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_edit_activities(p_group_id) then raise exception 'Sem permissão para editar atividades'; end if;
  if p_id is null then
    insert into public.activities(group_id, kind, title, starts_on, ends_on, start_time, end_time, schedule, authorization_doc, attendance, plan_actions, created_by)
    values (p_group_id, p_kind, nullif(trim(p_title), ''), p_starts_on, p_ends_on, p_start_time, p_end_time,
      coalesce(p_schedule, '[]'::jsonb), p_authorization, coalesce(p_attendance, '{}'), coalesce(p_plan_actions, '{}'), auth.uid())
    returning id into v_id;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'activity.created', 'activity', v_id::text, jsonb_build_object('kind', p_kind, 'starts_on', p_starts_on));
  else
    update public.activities set
      kind = p_kind,
      title = nullif(trim(p_title), ''),
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      start_time = p_start_time,
      end_time = p_end_time,
      schedule = coalesce(p_schedule, schedule),
      authorization_doc = p_authorization,
      attendance = coalesce(p_attendance, attendance),
      plan_actions = coalesce(p_plan_actions, plan_actions)
    where id = p_id and group_id = p_group_id
    returning id into v_id;
    if v_id is null then raise exception 'Atividade não encontrada'; end if;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'activity.updated', 'activity', v_id::text, jsonb_build_object('kind', p_kind, 'starts_on', p_starts_on));
  end if;
  return v_id;
end;
$$;

create or replace function public.activity_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.activities;
begin
  select * into v_row from public.activities where id = p_id;
  if v_row.id is null then raise exception 'Atividade não encontrada'; end if;
  if not public.can_edit_activities(v_row.group_id) then raise exception 'Sem permissão para excluir atividades'; end if;
  delete from public.activities where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (v_row.group_id, auth.uid(), 'activity.deleted', 'activity', p_id::text, jsonb_build_object('starts_on', v_row.starts_on, 'kind', v_row.kind));
end;
$$;

-- Grants ---------------------------------------------------------------------------------------
revoke all on function public.activities_role_of(uuid) from public, anon;
revoke all on function public.can_manage_activities(uuid) from public, anon;
revoke all on function public.can_edit_activities(uuid) from public, anon;
revoke all on function public.admin_change_activities_role(uuid, uuid, public.activities_role) from public, anon;
revoke all on function public.activity_save(uuid, uuid, public.activity_kind, text, date, date, time, time, jsonb, jsonb, uuid[], text[]) from public, anon;
revoke all on function public.activity_delete(uuid) from public, anon;

grant execute on function public.activities_role_of(uuid) to authenticated;
grant execute on function public.can_manage_activities(uuid) to authenticated;
grant execute on function public.can_edit_activities(uuid) to authenticated;
grant execute on function public.admin_change_activities_role(uuid, uuid, public.activities_role) to authenticated;
grant execute on function public.activity_save(uuid, uuid, public.activity_kind, text, date, date, time, time, jsonb, jsonb, uuid[], text[]) to authenticated;
grant execute on function public.activity_delete(uuid) to authenticated;
