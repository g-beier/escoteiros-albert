-- Seções e patrulhas cadastradas: Ramo › Seção (Alcateia, Tropa Escoteira…) › Patrulha (opcional).
-- A seção em texto livre do associado é descartada (decidido: o cadastro recomeça do zero).
-- Seções e patrulhas só são gravadas pelas funções auditadas abaixo; associados seguem com a
-- política "editors manage associates", e as chaves estrangeiras compostas garantem que a seção
-- é do mesmo grupo e ramo do associado e que a patrulha é da seção dele.

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  -- o ramo não muda depois de criada (os associados dependem dele)
  branch public.scout_branch not null,
  name text not null check (char_length(name) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id),
  unique (id, group_id, branch)
);
create unique index sections_group_name_key on public.sections(group_id, lower(name));
alter table public.sections enable row level security;
create policy "members read sections" on public.sections for select using (public.is_group_member(group_id));

create table public.patrols (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  section_id uuid not null,
  name text not null check (char_length(name) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (section_id, group_id) references public.sections(id, group_id) on delete cascade,
  unique (id, section_id)
);
create unique index patrols_section_name_key on public.patrols(section_id, lower(name));
alter table public.patrols enable row level security;
create policy "members read patrols" on public.patrols for select using (public.is_group_member(group_id));

alter table public.associates drop column section;
alter table public.associates
  add column section_id uuid,
  add column patrol_id uuid,
  add constraint associates_section_fkey foreign key (section_id, group_id, branch) references public.sections(id, group_id, branch),
  add constraint associates_patrol_fkey foreign key (patrol_id, section_id) references public.patrols(id, section_id),
  add constraint associates_patrol_needs_section check (patrol_id is null or section_id is not null);
create index associates_section_idx on public.associates(section_id);

-- Leitura dos associados com os nomes da seção e da patrulha.
create view public.associate_rows with (security_invoker = true) as
select a.id, a.group_id, a.name, a.branch, a.active,
  a.section_id, s.name as section, a.patrol_id, p.name as patrol,
  a.created_at, a.updated_at
from public.associates a
left join public.sections s on s.id = a.section_id
left join public.patrols p on p.id = a.patrol_id;
grant select on public.associate_rows to authenticated;

-- Funções auditadas ---------------------------------------------------------------

create function public.section_snapshot(p_section_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('branch', s.branch, 'name', s.name, 'active', s.active) from public.sections s where s.id = p_section_id;
$$;
revoke all on function public.section_snapshot(uuid) from public, anon, authenticated;

create function public.patrol_snapshot(p_patrol_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('section_id', p.section_id, 'name', p.name, 'active', p.active) from public.patrols p where p.id = p_patrol_id;
$$;
revoke all on function public.patrol_snapshot(uuid) from public, anon, authenticated;

create function public.create_section(p_group_id uuid, p_branch public.scout_branch, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar seções neste grupo'; end if;
  if p_branch is null then raise exception 'Escolha o ramo da seção'; end if;
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

-- Nome e ativa/inativa. O ramo não muda.
create function public.update_section(p_section_id uuid, p_name text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare section_group uuid; before_state jsonb; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select group_id into section_group from public.sections where id = p_section_id;
  if section_group is null or not public.can_edit_group(section_group) then raise exception 'Seção não encontrada ou sem permissão'; end if;
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

create function public.create_patrol(p_section_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare section_group uuid; new_id uuid; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select group_id into section_group from public.sections where id = p_section_id;
  if section_group is null or not public.can_edit_group(section_group) then raise exception 'Seção não encontrada ou sem permissão'; end if;
  if char_length(clean_name) not between 2 and 60 then raise exception 'Informe um nome de patrulha com 2 a 60 caracteres'; end if;
  if exists (select 1 from public.patrols where section_id = p_section_id and lower(name) = lower(clean_name)) then
    raise exception 'Já existe a patrulha % nesta seção', clean_name;
  end if;
  insert into public.patrols(group_id, section_id, name) values (section_group, p_section_id, clean_name) returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (section_group, auth.uid(), 'patrol.created', 'patrol', new_id::text, public.patrol_snapshot(new_id));
  return new_id;
end;
$$;

create function public.update_patrol(p_patrol_id uuid, p_name text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare patrol_group uuid; patrol_section uuid; before_state jsonb; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select group_id, section_id into patrol_group, patrol_section from public.patrols where id = p_patrol_id;
  if patrol_group is null or not public.can_edit_group(patrol_group) then raise exception 'Patrulha não encontrada ou sem permissão'; end if;
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

revoke all on function public.create_section(uuid, public.scout_branch, text) from public;
revoke all on function public.update_section(uuid, text, boolean) from public;
revoke all on function public.create_patrol(uuid, text) from public;
revoke all on function public.update_patrol(uuid, text, boolean) from public;
grant execute on function public.create_section(uuid, public.scout_branch, text) to authenticated;
grant execute on function public.update_section(uuid, text, boolean) to authenticated;
grant execute on function public.create_patrol(uuid, text) to authenticated;
grant execute on function public.update_patrol(uuid, text, boolean) to authenticated;

-- Importação de associados (016): seção e patrulha passam a ser nomes de cadastros existentes.
-- Linhas: [{ id?, name, branch, section?, patrol?, active }]. A seção é procurada pelo nome (sem
-- diferenciar maiúsculas) entre as do grupo no ramo da linha; a patrulha, dentro dessa seção.
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
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para gerir associados neste grupo'; end if;
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
