-- Exclusão de material do inventário (cadastro errado ou material sem estoque).
-- Só permite se não houver saldo: lotes com quantidade > 0 ou peças ainda não baixadas.
-- Apaga movimentos, lotes zerados, peças baixadas e o material; contagens anuais caem em cascade.
-- A exclusão fica em audit_events (histórico de movimentos do material some junto).

create or replace function public.inventory_delete_material(p_material_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.inventory_materials;
begin
  select * into m from public.inventory_materials where id = p_material_id for update;
  if m.id is null or not public.can_edit_inventory(m.group_id) then
    raise exception 'Material não encontrado ou sem permissão';
  end if;
  if exists (select 1 from public.inventory_lots where material_id = m.id and quantity > 0)
    or exists (select 1 from public.inventory_units where material_id = m.id and written_off_at is null) then
    raise exception 'Esvazie o estoque (baixe lotes e peças) antes de excluir o material';
  end if;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (m.group_id, auth.uid(), 'inventory.material_deleted', 'inventory_material', m.id::text,
    jsonb_build_object(
      'name', m.name,
      'tracking', m.tracking,
      'family_id', m.family_id,
      'lots', (select count(*)::int from public.inventory_lots where material_id = m.id),
      'units', (select count(*)::int from public.inventory_units where material_id = m.id),
      'movements', (select count(*)::int from public.inventory_movements where material_id = m.id)
    ));

  -- Ordem: movimentos referenciam lotes/peças; depois lotes e peças; material por último (counts em cascade).
  delete from public.inventory_movements where material_id = m.id;
  delete from public.inventory_lots where material_id = m.id;
  delete from public.inventory_units where material_id = m.id;
  delete from public.inventory_materials where id = m.id;
end;
$$;

revoke all on function public.inventory_delete_material(uuid) from public;
grant execute on function public.inventory_delete_material(uuid) to authenticated;
