-- 009 — Importação por CSV: vida-escoteira.csv (contrato em apps/gestao/docs/importacao.md).
--
-- Uma linha do payload por pessoa, com só os tipos presentes no arquivo (`periods`, `exclusions`, `events`, `stars`,
-- `notes`): cada tipo presente substitui o que a pessoa tem no app, pelas funções life_* (auditadas, com as mesmas
-- checagens de sobreposição, datas e motivos). Períodos entram com origem `planilha`.

create function public.import_life(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  x jsonb;
  line int;
  person uuid;
  old record;
  people int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para importar no Associados'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      person := public.import_cited_associate(p_group_id, r);

      if r ? 'periods' then
        for old in select id from public.associate_life_periods where associate_id = person loop
          perform public.life_period_delete(old.id);
        end loop;
        if jsonb_array_length(r->'periods') > 0 then perform public.life_periods_add(person, r->'periods', 'planilha'); end if;
      end if;

      if r ? 'exclusions' then
        for old in select id from public.associate_life_exclusions where associate_id = person loop
          perform public.life_exclusion_delete(old.id);
        end loop;
        for x in select value from jsonb_array_elements(r->'exclusions') loop
          perform public.life_exclusion_save(person, null, (x->>'started_on')::date, (x->>'ended_on')::date, x->>'reason', x->>'note');
        end loop;
      end if;

      if r ? 'events' then
        for old in select id from public.associate_life_events where associate_id = person loop
          perform public.life_event_delete(old.id);
        end loop;
        for x in select value from jsonb_array_elements(r->'events') loop
          perform public.life_event_save(person, null, (x->>'date')::date, x->>'title', x->>'description');
        end loop;
      end if;

      if r ? 'stars' then
        for old in select star from public.associate_stars where associate_id = person loop
          perform public.life_star_deliver(person, old.star, null);
          perform public.life_star_set_branch(person, old.star, null);
        end loop;
        for x in select value from jsonb_array_elements(r->'stars') loop
          if public.import_text(x, 'branch') is not null then
            perform public.life_star_set_branch(person, (x->>'star')::int, (x->>'branch')::public.scout_branch);
          end if;
          if public.import_text(x, 'delivered') is not null then
            perform public.life_star_deliver(person, (x->>'star')::int, (x->>'delivered')::date);
          end if;
        end loop;
      end if;

      if r ? 'notes' then perform public.life_notes_set(person, r->>'notes'); end if;
      people := people + 1;
    exception when others then
      raise exception 'vida-escoteira.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('people', people);
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
      when 'vida-escoteira' then public.import_life(p_group_id, rows)
      else null end;
    if done is null then raise exception 'A importação de %.csv não está disponível', kind; end if;
    result := result || jsonb_build_object(kind, done);
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'import.batch', 'group', p_group_id::text, result);
  return result;
end;
$$;

revoke all on function public.import_life(uuid, jsonb) from public;
