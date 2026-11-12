-- Importação de associados em massa (CSV lido no navegador). Tudo ou nada, auditado.
-- Linhas: [{ id?, name, branch, section?, active }]. Com id, atualiza ramo, seção e status do associado
-- (o nome não muda: é por ele que o arquivo foi casado); sem id, cadastra.
create function public.import_associates(p_group_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb;
  idx bigint;
  row_id uuid;
  row_name text;
  row_branch public.scout_branch;
  row_section text;
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
    row_section := nullif(trim(coalesce(row_data->>'section', '')), '');
    if char_length(row_section) > 60 then raise exception 'Linha %: seção com até 60 caracteres', idx; end if;
    row_active := coalesce((row_data->>'active')::boolean, true);
    row_id := nullif(row_data->>'id', '')::uuid;

    if row_id is null then
      insert into public.associates(group_id, name, branch, section, active) values (p_group_id, row_name, row_branch, row_section, row_active);
      created := created + 1;
    else
      update public.associates set branch = row_branch, section = row_section, active = row_active, updated_at = now()
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

revoke all on function public.import_associates(uuid, jsonb) from public;
grant execute on function public.import_associates(uuid, jsonb) to authenticated;
