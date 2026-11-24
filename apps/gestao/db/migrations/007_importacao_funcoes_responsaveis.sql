-- 007 — Importação por CSV: funcoes.csv e responsaveis.csv (contrato em apps/gestao/docs/importacao.md).
--
-- Mesmo padrão de 006: as linhas chegam conferidas por lib/import/plan.ts (com `functionId`, `linkId`, `relativeId`
-- quando o plano achou o registro) e são gravadas pelas funções auditadas que já existem (associates_add_function,
-- associates_update_function, relatives_create, relatives_link, relatives_update_link, relatives_rename).

-- Pessoa citada por outro arquivo: precisa existir (no app ou criada antes, no mesmo envio).
create function public.import_cited_associate(p_group_id uuid, p_row jsonb) returns uuid
  language plpgsql stable security definer set search_path to '' as $$
declare found uuid;
begin
  found := public.import_find_associate(p_group_id, (p_row->>'personId')::uuid, p_row->>'person', public.import_date(p_row, 'personBirth'));
  if found is null then raise exception '"%" não encontrada (cadastre em pessoas.csv)', p_row->>'person'; end if;
  return found;
end;
$$;

-- Seção só pelo nome (função de escotista): a seção define o ramo.
create function public.import_section_by_name(p_group_id uuid, p_name text) returns uuid
  language plpgsql stable security definer set search_path to '' as $$
declare found uuid; total int;
begin
  select count(*), min(id::text)::uuid into total, found from public.sections
  where group_id = p_group_id and branch <> 'adulto' and public.import_name_key(name) = public.import_name_key(p_name);
  if total = 0 then raise exception 'seção "%" não cadastrada', p_name; end if;
  if total > 1 then raise exception 'há % seções "%" em ramos diferentes', total, p_name; end if;
  return found;
end;
$$;

-- funcoes.csv ---------------------------------------------------------------------------------------------------------

create function public.import_functions(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  line int;
  person uuid;
  section_id uuid;
  kind public.associate_function_kind;
  f public.associate_functions%rowtype;
  new_id uuid;
  created int := 0;
  updated int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para importar no Associados'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      person := public.import_cited_associate(p_group_id, r);
      kind := (r->>'kind')::public.associate_function_kind;
      section_id := case when public.import_text(r, 'section') is not null then public.import_section_by_name(p_group_id, public.import_text(r, 'section')) end;
      if r ? 'functionId' then
        select * into f from public.associate_functions where id = (r->>'functionId')::uuid and associate_id = person;
        if f.id is null then raise exception 'função não encontrada'; end if;
        perform public.associates_update_function(f.id, f.kind, f.section_id, coalesce(public.import_text(r, 'title'), f.title),
          coalesce(public.import_date(r, 'started'), f.started_on), coalesce(public.import_date(r, 'ended'), f.ended_on),
          coalesce((r->>'elected')::boolean, f.elected));
        updated := updated + 1;
      else
        new_id := public.associates_add_function(person, kind, public.import_text(r, 'title'), public.import_date(r, 'started'),
          section_id, coalesce((r->>'elected')::boolean, false));
        if public.import_date(r, 'ended') is not null then
          perform public.associates_update_function(new_id, kind, section_id, public.import_text(r, 'title'), public.import_date(r, 'started'),
            public.import_date(r, 'ended'), coalesce((r->>'elected')::boolean, false));
        end if;
        created := created + 1;
      end if;
    exception when others then
      raise exception 'funcoes.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated);
end;
$$;

-- responsaveis.csv ----------------------------------------------------------------------------------------------------

create function public.import_relatives(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  line int;
  youth uuid;
  rel_assoc uuid;
  rel public.relatives%rowtype;
  link public.relative_links%rowtype;
  total int;
  kinship public.relative_kinship;
  note text;
  created int := 0;
  updated int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para importar no Associados'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      youth := public.import_cited_associate(p_group_id, r);
      kinship := (r->>'kinship')::public.relative_kinship;
      note := public.import_text(r, 'kinshipNote');
      rel_assoc := null;
      if r ? 'relativeAssociateId' then
        select id into rel_assoc from public.associates where id = (r->>'relativeAssociateId')::uuid and group_id = p_group_id;
        if rel_assoc is null then raise exception 'associado do responsável não encontrado'; end if;
      elsif public.import_text(r, 'relativeAssociate') is not null then
        rel_assoc := public.import_find_associate(p_group_id, null, public.import_text(r, 'relativeAssociate'), null);
        if rel_assoc is null then raise exception 'associado "%" não encontrado', public.import_text(r, 'relativeAssociate'); end if;
      end if;

      rel := null;
      if r ? 'relativeId' then
        select * into rel from public.relatives where id = (r->>'relativeId')::uuid and group_id = p_group_id;
        if rel.id is null then raise exception 'responsável não encontrado'; end if;
      else
        select count(*) into total from public.relatives
        where group_id = p_group_id and public.import_name_key(name) = public.import_name_key(r->>'relative');
        if total > 1 then raise exception 'há % responsáveis "%" no app', total, r->>'relative'; end if;
        select * into rel from public.relatives
        where group_id = p_group_id and public.import_name_key(name) = public.import_name_key(r->>'relative');
        if rel.id is null and rel_assoc is not null then
          select * into rel from public.relatives where group_id = p_group_id and associate_id = rel_assoc order by created_at limit 1;
        end if;
      end if;

      if rel.id is null then
        rel.id := public.relatives_create(youth, r->>'relative', kinship, note, coalesce((r->>'legal')::boolean, false),
          coalesce((r->>'financial')::boolean, false), rel_assoc);
        if public.import_text(r, 'notes') is not null then
          perform public.relatives_rename(rel.id, r->>'relative', rel_assoc, public.import_text(r, 'notes'));
        end if;
        created := created + 1;
        continue;
      end if;

      select * into link from public.relative_links where associate_id = youth and relative_id = rel.id;
      if link.id is null then
        perform public.relatives_link(youth, rel.id, kinship, note, coalesce((r->>'legal')::boolean, false), coalesce((r->>'financial')::boolean, false));
        created := created + 1;
      else
        perform public.relatives_update_link(link.id, kinship,
          coalesce(note, case when kinship = link.kinship then link.kinship_note end),
          coalesce((r->>'legal')::boolean, link.legal), coalesce((r->>'financial')::boolean, link.financial));
        updated := updated + 1;
      end if;
      if (rel_assoc is not null and rel_assoc is distinct from rel.associate_id)
        or (public.import_text(r, 'notes') is not null and public.import_text(r, 'notes') is distinct from rel.notes) then
        perform public.relatives_rename(rel.id, rel.name, coalesce(rel_assoc, rel.associate_id), coalesce(public.import_text(r, 'notes'), rel.notes));
      end if;
    exception when others then
      raise exception 'responsaveis.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated);
end;
$$;

-- Envio: mesmos tipos de 006 e os novos, na ordem do contrato ------------------------------------------------------

create or replace function public.import_batch(p_group_id uuid, p_files jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  f jsonb;
  kind text;
  rows jsonb;
  result jsonb := '{}'::jsonb;
  done jsonb;
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then raise exception 'Nada para importar'; end if;
  for f in select value from jsonb_array_elements(p_files) loop
    kind := f->>'kind';
    rows := coalesce(f->'rows', '[]'::jsonb);
    if jsonb_typeof(rows) <> 'array' then raise exception '%: linhas inválidas', kind; end if;
    if jsonb_array_length(rows) > 5000 then raise exception '%.csv: no máximo 5.000 linhas', kind; end if;
    if jsonb_array_length(rows) = 0 then continue; end if;
    done := case kind
      when 'secoes' then public.import_sections(p_group_id, rows)
      when 'pessoas' then public.import_people(p_group_id, rows)
      when 'funcoes' then public.import_functions(p_group_id, rows)
      when 'responsaveis' then public.import_relatives(p_group_id, rows)
      else null end;
    if done is null then raise exception 'A importação de %.csv não está disponível', kind; end if;
    result := result || jsonb_build_object(kind, done);
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'import.batch', 'group', p_group_id::text, result);
  return result;
end;
$$;

revoke all on function public.import_cited_associate(uuid, jsonb) from public;
revoke all on function public.import_section_by_name(uuid, text) from public;
revoke all on function public.import_functions(uuid, jsonb) from public;
revoke all on function public.import_relatives(uuid, jsonb) from public;
