-- Inventário: registro rápido (telas de celular, /inventario/rapido). Uma função despacha para as funções inventory_*
-- existentes, que continuam conferindo as permissões, depois de marcar a transação como `inventory.channel = rapido`.
-- O inventory_log (044) lê o setting: tudo o que vem daqui fica para revisar, mesmo do gestor ou do administrador.
-- Os argumentos vão em jsonb; os nomes ficam em lib/server/inventory/quick.ts.

create or replace function public.inventory_quick(p_action text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  result uuid;
begin
  perform set_config('inventory.channel', 'rapido', true);
  case p_action
    when 'add_lot' then
      result := public.inventory_add_lot((a->>'material_id')::uuid, (a->>'location_id')::uuid, (a->>'quantity')::integer,
        (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, (a->>'expires_on')::date, today,
        coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes');
    when 'add_unit' then
      result := public.inventory_add_unit((a->>'material_id')::uuid, (a->>'location_id')::uuid, a->>'tag', null, null,
        (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, today,
        coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes');
    when 'new_material' then
      result := public.inventory_save_material((a->>'group_id')::uuid, null, (a->>'family_id')::uuid, a->>'name',
        (a->>'tracking')::public.inventory_tracking, coalesce((a->>'consumable')::boolean, false), null, null, true);
      if (a->>'tracking') = 'lot' then
        perform public.inventory_add_lot(result, (a->>'location_id')::uuid, (a->>'quantity')::integer,
          (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, (a->>'expires_on')::date, today,
          coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes');
      else
        perform public.inventory_add_unit(result, (a->>'location_id')::uuid, a->>'tag', null, null,
          (a->>'condition')::public.inventory_condition, (a->>'unit_value_cents')::bigint, today,
          coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes');
      end if;
    when 'write_off_lot' then
      perform public.inventory_write_off_lot((a->>'lot_id')::uuid, (a->>'quantity')::integer, (a->>'reason')::public.inventory_write_off_reason, a->>'notes');
    when 'write_off_unit' then
      perform public.inventory_write_off_unit((a->>'unit_id')::uuid, (a->>'reason')::public.inventory_write_off_reason, a->>'notes');
    when 'set_lot_condition' then
      result := public.inventory_set_lot_condition((a->>'lot_id')::uuid, (a->>'condition')::public.inventory_condition, (a->>'quantity')::integer, a->>'notes');
    when 'set_unit_condition' then
      perform public.inventory_set_unit_condition((a->>'unit_id')::uuid, (a->>'condition')::public.inventory_condition, a->>'notes');
    when 'transfer_lot' then
      result := public.inventory_transfer_lot((a->>'lot_id')::uuid, (a->>'to_location_id')::uuid, (a->>'quantity')::integer, a->>'notes');
    when 'transfer_unit' then
      perform public.inventory_transfer_unit((a->>'unit_id')::uuid, (a->>'to_location_id')::uuid, a->>'notes');
    when 'adjust_lot' then
      perform public.inventory_adjust_lot((a->>'lot_id')::uuid, (a->>'quantity')::integer, a->>'notes');
    else
      raise exception 'Ação de registro rápido desconhecida: %', p_action;
  end case;
  -- O setting vale até o fim da transação: desliga para não marcar o que vier depois nela.
  perform set_config('inventory.channel', '', true);
  return jsonb_build_object('id', result);
end;
$$;

revoke all on function public.inventory_quick(text, jsonb) from public, anon;
grant execute on function public.inventory_quick(text, jsonb) to authenticated;
