-- Inventário: divisões reordenadas arrastando (como as rubricas), no lugar das setas sobe/desce (034).
-- inventory_place_location solta a divisão antes, depois ou dentro (no fim) de outra e renumera as irmãs.

drop function if exists public.inventory_move_location(uuid, integer);

create or replace function public.inventory_place_location(p_id uuid, p_target uuid, p_place text)
returns void language plpgsql security definer set search_path = '' as $$
declare loc public.inventory_locations; target public.inventory_locations; new_parent uuid; ids uuid[]; idx integer;
begin
  select * into loc from public.inventory_locations where id = p_id;
  if loc.id is null or not public.can_manage_inventory(loc.group_id) then raise exception 'Divisão não encontrada ou sem permissão'; end if;
  select * into target from public.inventory_locations where id = p_target and group_id = loc.group_id;
  if target.id is null then raise exception 'Divisão de destino não encontrada'; end if;
  if p_place not in ('before', 'after', 'inside') then raise exception 'Solte antes, depois ou dentro de uma divisão'; end if;
  if p_id = p_target then raise exception 'Uma divisão não pode ficar dentro dela mesma'; end if;
  new_parent := case when p_place = 'inside' then target.id else target.parent_id end;
  if new_parent is not null and p_id = any(coalesce((select ancestors from public.inventory_location_paths where id = new_parent), '{}'::uuid[])) then
    raise exception 'Uma divisão não pode ficar dentro dela mesma';
  end if;
  if new_parent is distinct from loc.parent_id then
    if new_parent is not null and not (select active from public.inventory_locations where id = new_parent) then
      raise exception 'Reative a divisão de destino antes de pôr outra dentro dela';
    end if;
    if exists (select 1 from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from new_parent
      and lower(name) = lower(loc.name) and id <> p_id) then
      raise exception 'Já existe a divisão % neste nível', loc.name;
    end if;
  end if;
  -- Trava as irmãs de destino durante a renumeração.
  perform 1 from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from new_parent for update;
  select coalesce(array_agg(id order by position, lower(name)), '{}') into ids
  from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from new_parent and id <> p_id;
  idx := case when p_place = 'inside' then cardinality(ids) + 1 else array_position(ids, p_target) + (p_place = 'after')::int end;
  ids := ids[1:idx - 1] || p_id || ids[idx:];
  update public.inventory_locations set parent_id = new_parent where id = p_id;
  update public.inventory_locations l set position = o.ord - 1 from unnest(ids) with ordinality as o(id, ord) where l.id = o.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (loc.group_id, auth.uid(), 'inventory.location_moved', 'inventory_location', p_id::text,
    jsonb_build_object('name', loc.name, 'from_parent_id', loc.parent_id, 'parent_id', new_parent, 'from', loc.position, 'to', idx - 1));
end;
$$;

revoke all on function public.inventory_place_location(uuid, uuid, text) from public, anon;
grant execute on function public.inventory_place_location(uuid, uuid, text) to authenticated;
