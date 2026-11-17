-- Perfis de leitura fora da importação (Configurações › Perfis de leitura): renomear e excluir,
-- validados e auditados como as demais escritas. Excluir não apaga importações: statement_imports.profile_id
-- vira nulo (on delete set null) e a cópia profile_settings continua registrando como cada arquivo foi lido.

create function public.rename_import_profile(p_profile_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
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

create function public.delete_import_profile(p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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

revoke all on function public.rename_import_profile(uuid, text) from public, anon;
revoke all on function public.delete_import_profile(uuid) from public, anon;
grant execute on function public.rename_import_profile(uuid, text) to authenticated;
grant execute on function public.delete_import_profile(uuid) to authenticated;
