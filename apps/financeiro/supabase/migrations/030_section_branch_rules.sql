-- Regras da divisão Ramo › Seção › Equipe no banco (antes só no app):
-- Adultos não têm seção (são só o ramo) e só Lobinho, Escoteiro e Sênior dividem a seção em
-- equipes (patrulhas); o Clã Pioneiro não se divide. O ramo da seção não muda, então basta
-- conferir ao criar. Seções e patrulhas já existentes fora da regra continuam (nada é apagado).

create or replace function public.create_section(p_group_id uuid, p_branch public.scout_branch, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar seções neste grupo'; end if;
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

create or replace function public.create_patrol(p_section_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare section_group uuid; section_branch public.scout_branch; new_id uuid;
  clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  select group_id, branch into section_group, section_branch from public.sections where id = p_section_id;
  if section_group is null or not public.can_edit_group(section_group) then raise exception 'Seção não encontrada ou sem permissão'; end if;
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
