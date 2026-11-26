-- 011 — Edição em massa na lista de Materiais (seleção por linha: um material numa divisão).
--
-- Uma chamada, uma transação: cada linha passa pelas funções inventory_* de sempre (transferência, condição, baixa,
-- cadastro do material), que conferem a permissão, juntam lotes iguais e registram o movimento auditado (do
-- Colaborador fica para revisar). Ações:
--   transferir   {to_location_id}           todos os lotes e peças do material naquela divisão vão para outra
--   condicao     {condition}                todos os lotes e peças do material naquela divisão passam à condição
--   baixa        {reason}                   baixa de tudo o que o material tem naquela divisão
--   familia      {family_id | null}         família do material (vale em todas as divisões)
--   consumivel   {value: boolean}           consumível ou não (só material por quantidade; vale em todas as divisões)
-- `p_targets`: [{material_id, location_id}] (location_id nulo = material sem estoque, só para familia/consumivel).
-- Devolve quantas linhas mudaram (lotes e peças nas ações de estoque; materiais nas de cadastro).

create function public.inventory_bulk(p_group_id uuid, p_action text, p_targets jsonb, p_args jsonb, p_notes text default null)
  returns integer
  language plpgsql security definer set search_path to '' as $$
declare
  target jsonb;
  material public.inventory_materials;
  lot record;
  unit record;
  changed integer := 0;
  to_location uuid := nullif(p_args->>'to_location_id', '')::uuid;
  new_condition public.inventory_condition := nullif(p_args->>'condition', '')::public.inventory_condition;
  reason public.inventory_write_off_reason := nullif(p_args->>'reason', '')::public.inventory_write_off_reason;
  family public.inventory_families;
  done uuid[] := '{}';
begin
  if not public.can_edit_inventory(p_group_id) then raise exception 'Sem permissão para alterar o inventário'; end if;
  if p_action not in ('transferir', 'condicao', 'baixa', 'familia', 'consumivel') then raise exception 'Ação desconhecida: %', p_action; end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then raise exception 'Selecione pelo menos um material'; end if;
  if jsonb_array_length(p_targets) > 1000 then raise exception 'Selecione até 1000 linhas de cada vez'; end if;
  if p_action = 'transferir' then perform public.inventory_check_location(p_group_id, to_location); end if;
  if p_action = 'baixa' and reason is null then raise exception 'Escolha o motivo da baixa'; end if;
  if p_action = 'familia' and p_args ? 'family_id' and nullif(p_args->>'family_id', '') is not null then
    select * into family from public.inventory_families where id = (p_args->>'family_id')::uuid and group_id = p_group_id;
    if family.id is null then raise exception 'Família não encontrada'; end if;
  end if;
  if p_action = 'consumivel' and jsonb_typeof(p_args->'value') <> 'boolean' then raise exception 'Informe se é consumível'; end if;

  for target in select * from jsonb_array_elements(p_targets) loop
    select * into material from public.inventory_materials
    where id = (target->>'material_id')::uuid and group_id = p_group_id for update;
    if material.id is null then raise exception 'Material não encontrado'; end if;

    if p_action in ('familia', 'consumivel') then
      if material.id = any(done) then continue; end if;
      done := done || material.id;
      if p_action = 'familia' then
        if material.family_id is not distinct from family.id then continue; end if;
        if exists (select 1 from public.inventory_units u where u.material_id = material.id and u.tag is not null
                   and substr(u.tag, 6, 3) is distinct from family.code) then
          raise exception 'O material % tem peças com etiqueta de outra família: troque a família no cadastro dele', material.name;
        end if;
        perform public.inventory_save_material(p_group_id, material.id, family.id, material.name, material.tracking, material.consumable,
          material.minimum_quantity, material.description, material.active);
      else
        if material.consumable = (p_args->>'value')::boolean then continue; end if;
        if material.tracking <> 'lot' and (p_args->>'value')::boolean then
          raise exception 'O material % é controlado por peça: consumível é só por quantidade', material.name;
        end if;
        perform public.inventory_save_material(p_group_id, material.id, material.family_id, material.name, material.tracking,
          (p_args->>'value')::boolean, material.minimum_quantity, material.description, material.active);
      end if;
      changed := changed + 1;
      continue;
    end if;

    -- Ações de estoque: tudo o que o material tem naquela divisão.
    if nullif(target->>'location_id', '') is null then continue; end if;
    for lot in select id, condition from public.inventory_lots
               where material_id = material.id and location_id = (target->>'location_id')::uuid and quantity > 0 order by id loop
      if p_action = 'transferir' then
        if to_location = (target->>'location_id')::uuid then continue; end if;
        perform public.inventory_transfer_lot(lot.id, to_location, null, p_notes);
      elsif p_action = 'condicao' then
        if lot.condition is not distinct from new_condition then continue; end if;
        perform public.inventory_set_lot_condition(lot.id, new_condition, null, p_notes);
      else
        perform public.inventory_write_off_lot(lot.id, null, reason, p_notes);
      end if;
      changed := changed + 1;
    end loop;
    for unit in select id, condition from public.inventory_units
                where material_id = material.id and location_id = (target->>'location_id')::uuid and written_off_at is null order by id loop
      if p_action = 'transferir' then
        if to_location = (target->>'location_id')::uuid then continue; end if;
        perform public.inventory_transfer_unit(unit.id, to_location, p_notes);
      elsif p_action = 'condicao' then
        if unit.condition is not distinct from new_condition then continue; end if;
        perform public.inventory_set_unit_condition(unit.id, new_condition, p_notes);
      else
        perform public.inventory_write_off_unit(unit.id, reason, p_notes);
      end if;
      changed := changed + 1;
    end loop;
  end loop;
  return changed;
end;
$$;

revoke all on function public.inventory_bulk(uuid, text, jsonb, jsonb, text) from public;
grant execute on function public.inventory_bulk(uuid, text, jsonb, jsonb, text) to authenticated;
