-- 006 — Importação por CSV (contrato em apps/gestao/docs/importacao.md, código em lib/import/).
--
-- Um envio (vários arquivos) é gravado numa transação só por `import_batch`, que chama uma função por tipo de arquivo
-- na ordem do contrato. As linhas chegam já conferidas pela pré-visualização (lib/import/plan.ts), mas o banco confere
-- tudo de novo: as funções reaproveitam as checagens e escritas auditadas que já existem (associates_create,
-- associates_update, associates_leave, create_section, create_patrol…). Qualquer erro desfaz o envio inteiro, com o
-- arquivo e a linha na mensagem.
--
-- Substitui `import_associates` (só nome, ramo, seção, patrulha e status).

drop function public.import_associates(uuid, jsonb);

-- Nome comparável: sem acento, maiúsculas nem espaços repetidos (o mesmo que normalizeText em lib/text.ts).
create function public.import_name_key(p_text text) returns text
  language sql immutable set search_path to '' as $$
  select regexp_replace(trim(public.inventory_search_normalize(p_text)), '\s+', ' ', 'g');
$$;

-- Pessoa pelo id; senão nome + nascimento; senão nome sem nascimento com um só candidato (lib/import/plan.ts,
-- PlanContext.findPerson). Null quando não há; erro quando é ambíguo.
create function public.import_find_associate(p_group_id uuid, p_id uuid, p_name text, p_birth date) returns uuid
  language plpgsql stable security definer set search_path to '' as $$
declare
  key text := public.import_name_key(p_name);
  found uuid;
  candidates int;
  exact int;
  undated int;
begin
  if p_id is not null then
    select id into found from public.associates where id = p_id and group_id = p_group_id;
    if found is null then raise exception 'id % não encontrado no app', p_id; end if;
    return found;
  end if;
  if key = '' then return null; end if;
  select count(*), count(*) filter (where birth_date = p_birth), count(*) filter (where birth_date is null)
  into candidates, exact, undated
  from public.associates where group_id = p_group_id and public.import_name_key(name) = key;
  if p_birth is not null then
    if exact > 1 then raise exception 'há % pessoas "%" com o mesmo nascimento', exact, p_name; end if;
    if exact = 1 then
      select id into found from public.associates where group_id = p_group_id and public.import_name_key(name) = key and birth_date = p_birth;
      return found;
    end if;
    if undated > 1 then raise exception 'há % pessoas "%" sem nascimento no app: informe o id', undated, p_name; end if;
    if undated = 1 and candidates = 1 then
      select id into found from public.associates where group_id = p_group_id and public.import_name_key(name) = key;
      return found;
    end if;
    return null;
  end if;
  if candidates > 1 then raise exception 'há % pessoas "%": informe o nascimento ou o id', candidates, p_name; end if;
  select id into found from public.associates where group_id = p_group_id and public.import_name_key(name) = key;
  return found;
end;
$$;

-- Seção do ramo pelo nome, criada se não existir.
create function public.import_section(p_group_id uuid, p_branch public.scout_branch, p_name text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare found uuid;
begin
  select id into found from public.sections
  where group_id = p_group_id and branch = p_branch and public.import_name_key(name) = public.import_name_key(p_name);
  return coalesce(found, public.create_section(p_group_id, p_branch, p_name));
end;
$$;

create function public.import_patrol(p_section_id uuid, p_name text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare found uuid;
begin
  select id into found from public.patrols
  where section_id = p_section_id and public.import_name_key(name) = public.import_name_key(p_name);
  return coalesce(found, public.create_patrol(p_section_id, p_name));
end;
$$;

-- Texto e data de uma linha (chave ausente ou vazia = null).
create function public.import_text(p_row jsonb, p_key text) returns text
  language sql immutable set search_path to '' as $$
  select nullif(regexp_replace(trim(coalesce(p_row->>p_key, '')), '\s+', ' ', 'g'), '');
$$;

create function public.import_date(p_row jsonb, p_key text) returns date
  language sql immutable set search_path to '' as $$
  select (public.import_text(p_row, p_key))::date;
$$;

-- secoes.csv ----------------------------------------------------------------------------------------------------------

create function public.import_sections(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  line int;
  branch public.scout_branch;
  section_id uuid;
  patrol_id uuid;
  current_active boolean;
  current_name text;
  changed int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para importar no Associados'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      branch := (r->>'branch')::public.scout_branch;
      section_id := public.import_section(p_group_id, branch, public.import_text(r, 'section'));
      if public.import_text(r, 'patrol') is not null then
        patrol_id := public.import_patrol(section_id, public.import_text(r, 'patrol'));
        if r ? 'active' then
          select active, name into current_active, current_name from public.patrols where id = patrol_id;
          if current_active is distinct from (r->>'active')::boolean then
            perform public.update_patrol(patrol_id, current_name, (r->>'active')::boolean);
          end if;
        end if;
      elsif r ? 'active' then
        select active, name into current_active, current_name from public.sections where id = section_id;
        if current_active is distinct from (r->>'active')::boolean then
          perform public.update_section(section_id, current_name, (r->>'active')::boolean);
        end if;
      end if;
      changed := changed + 1;
    exception when others then
      raise exception 'secoes.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('rows', changed);
end;
$$;

-- pessoas.csv ---------------------------------------------------------------------------------------------------------

create function public.import_people(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  line int;
  a public.associates%rowtype;
  person_id uuid;
  branch public.scout_branch;
  section_id uuid;
  patrol_id uuid;
  created int := 0;
  updated int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para importar no Associados'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      person_id := public.import_find_associate(p_group_id, (r->>'id')::uuid, r->>'name', public.import_date(r, 'birth'));

      if person_id is null then
        branch := (r->>'branch')::public.scout_branch;
        if branch is null then raise exception 'ramo é obrigatório para cadastrar'; end if;
        section_id := case when public.import_text(r, 'section') is not null then public.import_section(p_group_id, branch, public.import_text(r, 'section')) end;
        patrol_id := case when section_id is not null and public.import_text(r, 'patrol') is not null then public.import_patrol(section_id, public.import_text(r, 'patrol')) end;
        person_id := public.associates_create(p_group_id, r->>'name', branch, section_id, patrol_id,
          public.import_date(r, 'birth'), public.import_date(r, 'promise'), public.import_date(r, 'joined'), public.import_text(r, 'notes'));
        if public.import_text(r, 'nickname') is not null or r ? 'registration' then
          select * into a from public.associates where id = person_id;
          perform public.associates_update(person_id, a.name, a.birth_date, a.promise_date, a.joined_on, a.notes,
            coalesce((r->>'registration')::public.associate_registration, a.registration), public.import_text(r, 'nickname'));
        end if;
        if r->>'situation' = 'desligado' then
          perform public.associates_leave(person_id, public.import_date(r, 'left'), public.import_text(r, 'leftReason'));
        end if;
        created := created + 1;
        continue;
      end if;

      select * into a from public.associates where id = person_id;
      branch := coalesce((r->>'branch')::public.scout_branch, a.branch);
      -- Seção e patrulha: a pré-visualização sempre manda as duas chaves (null = sem); sem a chave, ficam as atuais.
      section_id := case
        when not r ? 'section' then a.section_id
        when public.import_text(r, 'section') is null then null
        else public.import_section(p_group_id, branch, public.import_text(r, 'section')) end;
      patrol_id := case
        when not r ? 'patrol' then a.patrol_id
        when public.import_text(r, 'patrol') is null or section_id is null then null
        else public.import_patrol(section_id, public.import_text(r, 'patrol')) end;
      perform public.associates_update(person_id,
        coalesce(public.import_text(r, 'name'), a.name),
        coalesce(public.import_date(r, 'birth'), a.birth_date),
        coalesce(public.import_date(r, 'promise'), a.promise_date),
        coalesce(public.import_date(r, 'joined'), a.joined_on),
        coalesce(public.import_text(r, 'notes'), a.notes),
        coalesce((r->>'registration')::public.associate_registration, a.registration),
        coalesce(public.import_text(r, 'nickname'), a.nickname),
        branch, section_id, patrol_id);
      -- Com uma única movimentação (a entrada do cadastro), ela acompanha a data de entrada corrigida.
      if public.import_date(r, 'joined') is not null
        and (select count(*) from public.associate_movements where associate_id = person_id) = 1 then
        update public.associate_movements set movement_date = public.import_date(r, 'joined')
        where associate_id = person_id and kind = 'entrada' and movement_date <> public.import_date(r, 'joined');
      end if;
      if r->>'situation' = 'desligado' and a.active then
        perform public.associates_leave(person_id, public.import_date(r, 'left'), public.import_text(r, 'leftReason'));
      end if;
      updated := updated + 1;
    exception when others then
      raise exception 'pessoas.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated);
end;
$$;

-- Envio ---------------------------------------------------------------------------------------------------------------

-- p_files: [{ "kind": "pessoas", "rows": [...] }, …], na ordem do contrato. Devolve o resultado por tipo.
create function public.import_batch(p_group_id uuid, p_files jsonb) returns jsonb
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
      else null end;
    if done is null then raise exception 'A importação de %.csv não está disponível', kind; end if;
    result := result || jsonb_build_object(kind, done);
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'import.batch', 'group', p_group_id::text, result);
  return result;
end;
$$;

revoke all on function public.import_name_key(text) from public;
revoke all on function public.import_find_associate(uuid, uuid, text, date) from public;
revoke all on function public.import_section(uuid, public.scout_branch, text) from public;
revoke all on function public.import_patrol(uuid, text) from public;
revoke all on function public.import_text(jsonb, text) from public;
revoke all on function public.import_date(jsonb, text) from public;
revoke all on function public.import_sections(uuid, jsonb) from public;
revoke all on function public.import_people(uuid, jsonb) from public;
revoke all on function public.import_batch(uuid, jsonb) from public;
grant execute on function public.import_batch(uuid, jsonb) to authenticated;
grant execute on function public.import_name_key(text) to authenticated;
