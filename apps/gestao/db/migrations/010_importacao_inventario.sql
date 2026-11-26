-- 010 — Importação por CSV: inventario-lotes.csv e inventario-pecas.csv (contrato em apps/gestao/docs/importacao.md).
--
-- Carga com substituição: apaga o inventário do grupo e cria tudo de novo pelas funções inventory_* (auditadas, com
-- movimentos de entrada). Só enquanto todo movimento do grupo veio de uma importação: os movimentos da carga ficam no
-- canal `importacao` (novo), e qualquer registro feito pelo app (canal web ou rapido) barra a substituição.
-- As peças vêm depois dos lotes no mesmo envio (lib/import/plan.ts exige inventario-lotes.csv junto).

alter table public.inventory_movements drop constraint inventory_movements_channel_check;
alter table public.inventory_movements add constraint inventory_movements_channel_check check (channel in ('web', 'rapido', 'importacao'));

create or replace function public.inventory_log(p_group_id uuid, p_kind public.inventory_movement_kind, p_material_id uuid, p_lot_id uuid,
  p_unit_id uuid, p_quantity integer, p_from_location uuid, p_to_location uuid, p_from_condition public.inventory_condition,
  p_to_condition public.inventory_condition, p_reason public.inventory_write_off_reason, p_notes text, p_details jsonb) returns bigint
  language plpgsql security definer set search_path to '' as $$
declare
  new_id bigint;
  source text := case current_setting('inventory.channel', true) when 'rapido' then 'rapido' when 'importacao' then 'importacao' else 'web' end;
  reviewed boolean := source <> 'rapido' and public.can_manage_inventory(p_group_id);
begin
  insert into public.inventory_movements(group_id, kind, material_id, lot_id, unit_id, quantity, from_location_id, to_location_id,
    from_condition, to_condition, write_off_reason, notes, details, review_status, reviewed_by, reviewed_at, created_by, channel)
  values (p_group_id, p_kind, p_material_id, p_lot_id, p_unit_id, p_quantity, p_from_location, p_to_location,
    p_from_condition, p_to_condition, p_reason, public.inventory_clean(p_notes), coalesce(p_details, '{}'::jsonb),
    case when reviewed then 'revisado'::public.inventory_review_status else 'para_revisar' end,
    case when reviewed then auth.uid() end, case when reviewed then now() end, auth.uid(), source)
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'inventory.' || p_kind, case when p_unit_id is not null then 'inventory_unit' when p_lot_id is not null then 'inventory_lot' else 'inventory_material' end,
    coalesce(p_unit_id, p_lot_id, p_material_id)::text, jsonb_build_object('movement_id', new_id, 'channel', source) || coalesce(p_details, '{}'::jsonb));
  return new_id;
end;
$$;

-- Divisão pelo caminho "A › B › C": acha ou cria cada nível (novas vão para o fim das irmãs, na ordem do arquivo).
create function public.import_inventory_location(p_group_id uuid, p_path text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare part text; parent uuid; found uuid;
begin
  for part in select btrim(value) from regexp_split_to_table(p_path, '\s*[›>]\s*') value where btrim(value) <> '' loop
    select id into found from public.inventory_locations
    where group_id = p_group_id and parent_id is not distinct from parent and public.import_name_key(name) = public.import_name_key(part);
    parent := coalesce(found, public.inventory_save_location(p_group_id, null, parent, part, null));
  end loop;
  if parent is null then raise exception 'divisão vazia'; end if;
  return parent;
end;
$$;

create function public.import_inventory_family(p_group_id uuid, p_code text, p_name text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare found uuid;
begin
  if p_name is null then return null; end if;
  select id into found from public.inventory_families where group_id = p_group_id and public.import_name_key(name) = public.import_name_key(p_name);
  return coalesce(found, public.inventory_save_family(p_group_id, null, p_name, p_code));
end;
$$;

create function public.import_inventory_material(p_group_id uuid, p_row jsonb, p_tracking public.inventory_tracking) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare m public.inventory_materials%rowtype;
begin
  select * into m from public.inventory_materials where group_id = p_group_id and public.import_name_key(name) = public.import_name_key(p_row->>'material');
  if m.id is not null then
    if m.tracking <> p_tracking then raise exception '% já é material %', m.name, case m.tracking when 'lot' then 'por quantidade' else 'por peça' end; end if;
    return m.id;
  end if;
  return public.inventory_save_material(p_group_id, null,
    public.import_inventory_family(p_group_id, public.import_text(p_row, 'familyCode'), public.import_text(p_row, 'family')),
    p_row->>'material', p_tracking, coalesce((p_row->>'consumable')::boolean, false), (p_row->>'minimum')::int,
    public.import_text(p_row, 'materialDescription'));
end;
$$;

-- Apaga o inventário do grupo (das folhas para a raiz), só se nada foi registrado pelo app.
create function public.import_inventory_wipe(p_group_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare app int;
begin
  select count(*) into app from public.inventory_movements where group_id = p_group_id and channel <> 'importacao';
  if app > 0 then
    raise exception 'O inventário já tem % registros feitos no app: a carga por CSV só substitui um inventário vazio ou carregado por CSV', app;
  end if;
  delete from public.inventory_movements where group_id = p_group_id;
  delete from public.inventory_counts where group_id = p_group_id;
  delete from public.inventory_lots where group_id = p_group_id;
  delete from public.inventory_units where group_id = p_group_id;
  delete from public.inventory_materials where group_id = p_group_id;
  delete from public.inventory_families where group_id = p_group_id;
  while exists (select 1 from public.inventory_locations where group_id = p_group_id) loop
    delete from public.inventory_locations l where l.group_id = p_group_id
      and not exists (select 1 from public.inventory_locations c where c.parent_id = l.id);
  end loop;
end;
$$;

create function public.import_inventory_lots(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  line int;
  material uuid;
  location uuid;
  y record;
  lots int := 0;
  counts int := 0;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Sem permissão para importar no Inventário'; end if;
  perform public.import_inventory_wipe(p_group_id);
  perform set_config('inventory.channel', 'importacao', true);
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      location := public.import_inventory_location(p_group_id, r->>'location');
      material := public.import_inventory_material(p_group_id, r, 'lot');
      if coalesce((r->>'quantity')::int, 0) > 0 then
        perform public.inventory_add_lot(material, location, (r->>'quantity')::int, (r->>'condition')::public.inventory_condition,
          (r->>'unitValue')::bigint, public.import_date(r, 'expires'), null, 'nao_informada', null, null, public.import_text(r, 'notes'),
          public.import_text(r, 'variant'));
        lots := lots + 1;
      end if;
      for y in select key, value from jsonb_each_text(coalesce(r->'counts', '{}'::jsonb)) loop
        perform public.inventory_record_count(material, location, y.key::int, y.value::int, 'Importação CSV');
        counts := counts + 1;
      end loop;
    exception when others then
      raise exception 'inventario-lotes.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  perform set_config('inventory.channel', '', true);
  return jsonb_build_object('lots', lots, 'counts', counts);
end;
$$;

create function public.import_inventory_units(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  line int;
  units int := 0;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Sem permissão para importar no Inventário'; end if;
  perform set_config('inventory.channel', 'importacao', true);
  for r in select value from jsonb_array_elements(p_rows) loop
    line := (r->>'line')::int;
    begin
      perform public.inventory_add_unit(public.import_inventory_material(p_group_id, r, 'unit'),
        public.import_inventory_location(p_group_id, r->>'location'), public.import_text(r, 'tag'), public.import_text(r, 'legacyCode'),
        public.import_text(r, 'description'), (r->>'condition')::public.inventory_condition, (r->>'unitValue')::bigint, null,
        'nao_informada', null, null, public.import_text(r, 'notes'));
      units := units + 1;
    exception when others then
      raise exception 'inventario-pecas.csv, linha %: %', line, sqlerrm;
    end;
  end loop;
  perform set_config('inventory.channel', '', true);
  return jsonb_build_object('units', units);
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
      when 'inventario-lotes' then public.import_inventory_lots(p_group_id, rows)
      when 'inventario-pecas' then public.import_inventory_units(p_group_id, rows)
      else null end;
    if done is null then raise exception 'A importação de %.csv não está disponível', kind; end if;
    result := result || jsonb_build_object(kind, done);
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'import.batch', 'group', p_group_id::text, result);
  return result;
end;
$$;

revoke all on function public.import_inventory_location(uuid, text) from public;
revoke all on function public.import_inventory_family(uuid, text, text) from public;
revoke all on function public.import_inventory_material(uuid, jsonb, public.inventory_tracking) from public;
revoke all on function public.import_inventory_wipe(uuid) from public;
revoke all on function public.import_inventory_lots(uuid, jsonb) from public;
revoke all on function public.import_inventory_units(uuid, jsonb) from public;
