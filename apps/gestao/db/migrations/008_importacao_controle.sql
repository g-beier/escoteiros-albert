-- 008 — Importação por CSV: itens-controle.csv e controle.csv (Doc 22; contrato em apps/gestao/docs/importacao.md).
--
-- Itens pelas funções control_item_create/control_item_update; situações por control_status_set(_relative), que
-- conferem público, item ativo, ano e validade. Célula vazia não chega aqui (não muda nada); numa célula preenchida,
-- o que ela não diz fica como estava: observação, data da situação (se a situação não mudou), ano e validade (se ok).

create function public.import_control_items(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  line int;
  item public.control_items%rowtype;
  created int := 0;
  updated int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para importar no Associados'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      item := null;
      if r ? 'itemId' then
        select * into item from public.control_items where id = (r->>'itemId')::uuid and group_id = p_group_id;
        if item.id is null then raise exception 'item não encontrado'; end if;
      else
        select * into item from public.control_items
        where group_id = p_group_id and public.import_name_key(name) = public.import_name_key(r->>'name');
      end if;
      if item.id is null then
        perform public.control_item_create(p_group_id, r->>'name', (r->>'kind')::public.control_item_kind,
          (r->>'directorate')::public.directorate, r->'audiences', (r->>'validityMonths')::int, coalesce((r->>'removeOnLeave')::boolean, false),
          coalesce((r->>'valueKind')::public.control_value_kind, 'situacao'));
        created := created + 1;
      else
        perform public.control_item_update(item.id, item.name, coalesce((r->>'kind')::public.control_item_kind, item.kind),
          coalesce((r->>'directorate')::public.directorate, item.directorate), r->'audiences',
          coalesce((r->>'validityMonths')::int, item.validity_months), coalesce((r->>'removeOnLeave')::boolean, item.remove_on_leave),
          item.active, coalesce((r->>'valueKind')::public.control_value_kind, item.value_kind));
        updated := updated + 1;
      end if;
    exception when others then
      raise exception 'itens-controle.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated);
end;
$$;

-- Responsável de uma linha de controle: pelo id; senão pelo nome entre os responsáveis do jovem; senão nome único.
create function public.import_control_relative(p_group_id uuid, p_row jsonb) returns uuid
  language plpgsql stable security definer set search_path to '' as $$
declare youth uuid; found uuid; total int;
begin
  if p_row ? 'relativeId' then
    select id into found from public.relatives where id = (p_row->>'relativeId')::uuid and group_id = p_group_id;
    if found is null then raise exception 'responsável não encontrado'; end if;
    return found;
  end if;
  if public.import_text(p_row, 'youth') is not null then
    youth := public.import_find_associate(p_group_id, null, public.import_text(p_row, 'youth'), public.import_date(p_row, 'youthBirth'));
    if youth is null then raise exception 'jovem "%" não encontrado', public.import_text(p_row, 'youth'); end if;
  end if;
  select count(*), min(r.id::text)::uuid into total, found from public.relatives r
  where r.group_id = p_group_id and public.import_name_key(r.name) = public.import_name_key(p_row->>'relative')
    and (youth is null or exists (select 1 from public.relative_links l where l.relative_id = r.id and l.associate_id = youth));
  if total = 0 then raise exception 'responsável "%" não encontrado', p_row->>'relative'; end if;
  if total > 1 then raise exception 'há % responsáveis "%": informe o jovem', total, p_row->>'relative'; end if;
  return found;
end;
$$;

create function public.import_controls(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  c jsonb;
  line int;
  person uuid;
  relative uuid;
  item public.control_items%rowtype;
  cur public.control_statuses%rowtype;
  status public.control_status;
  keeps boolean;
  cells int := 0;
  people int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para importar no Associados'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      person := null;
      relative := null;
      if r->>'audience' = 'responsavel' then relative := public.import_control_relative(p_group_id, r);
      else person := public.import_cited_associate(p_group_id, r);
      end if;
      for c in select value from jsonb_array_elements(coalesce(r->'cells', '[]'::jsonb)) loop
        item := null;
        if c ? 'itemId' then select * into item from public.control_items where id = (c->>'itemId')::uuid and group_id = p_group_id;
        else select * into item from public.control_items where group_id = p_group_id and public.import_name_key(name) = public.import_name_key(c->>'item');
        end if;
        if item.id is null then raise exception 'item "%" não encontrado', c->>'item'; end if;
        cur := null;
        select * into cur from public.control_statuses
        where item_id = item.id and (associate_id = person or relative_id = relative);
        status := (c->>'status')::public.control_status;
        -- ano e validade ficam quando a célula só confirma ok (ou só traz a observação)
        keeps := status is null or status = 'ok';
        begin
          if person is not null then
            perform public.control_status_set(person, item.id, status,
              coalesce(public.import_date(c, 'statusDate'), case when status is not distinct from cur.status then cur.status_date end),
              case when c ? 'validUntil' then public.import_date(c, 'validUntil') when item.value_kind = 'data' and keeps then cur.valid_until end,
              coalesce(public.import_text(c, 'note'), cur.note),
              coalesce((c->>'year')::int, case when keeps then cur.value_year end));
          else
            perform public.control_status_set_relative(relative, item.id, status,
              coalesce(public.import_date(c, 'statusDate'), case when status is not distinct from cur.status then cur.status_date end),
              case when c ? 'validUntil' then public.import_date(c, 'validUntil') when item.value_kind = 'data' and keeps then cur.valid_until end,
              coalesce(public.import_text(c, 'note'), cur.note),
              coalesce((c->>'year')::int, case when keeps then cur.value_year end));
          end if;
        exception when others then
          raise exception '%: %', item.name, sqlerrm;
        end;
        cells := cells + 1;
      end loop;
      people := people + 1;
    exception when others then
      raise exception 'controle.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('updated', people, 'cells', cells);
end;
$$;

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
      when 'itens-controle' then public.import_control_items(p_group_id, rows)
      when 'pessoas' then public.import_people(p_group_id, rows)
      when 'funcoes' then public.import_functions(p_group_id, rows)
      when 'responsaveis' then public.import_relatives(p_group_id, rows)
      when 'controle' then public.import_controls(p_group_id, rows)
      else null end;
    if done is null then raise exception 'A importação de %.csv não está disponível', kind; end if;
    result := result || jsonb_build_object(kind, done);
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'import.batch', 'group', p_group_id::text, result);
  return result;
end;
$$;

revoke all on function public.import_control_items(uuid, jsonb) from public;
revoke all on function public.import_control_relative(uuid, jsonb) from public;
revoke all on function public.import_controls(uuid, jsonb) from public;
