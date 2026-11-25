-- 017 — Ordem dos materiais dentro de cada divisão, escolhida pelo Editor (arrastar).
--
-- A ordem da lista não é só alfabética ou de valor: segue a proximidade no lugar onde o material fica guardado ou a
-- lógica dos itens. Vale por divisão: o mesmo material pode estar em posições diferentes em cada divisão. Material sem
-- posição vai para o fim, por nome. Uma chamada grava a ordem inteira da divisão (a tela é um rascunho salvo de uma vez).

create table public.inventory_material_positions (
  group_id uuid not null references public.groups(id) on delete cascade,
  material_id uuid not null references public.inventory_materials(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (location_id, material_id)
);

create index inventory_material_positions_group_idx on public.inventory_material_positions(group_id);

alter table public.inventory_material_positions enable row level security;
create policy "members read inventory material positions" on public.inventory_material_positions
  for select using (public.can_read_inventory(group_id));
grant select on table public.inventory_material_positions to authenticated;

/** Grava a ordem dos materiais de uma divisão: `p_material_ids` na ordem da tela; os que ficarem de fora perdem a
 * posição (vão para o fim, por nome). Só Editor do Inventário. Devolve quantos materiais ficaram com posição. */
create function public.inventory_order_materials(p_location_id uuid, p_material_ids uuid[]) returns integer
  language plpgsql security definer set search_path to '' as $$
declare loc public.inventory_locations; ids uuid[] := coalesce(p_material_ids, '{}'); before_ids uuid[];
begin
  select * into loc from public.inventory_locations where id = p_location_id;
  if loc.id is null or not public.can_manage_inventory(loc.group_id) then raise exception 'Divisão não encontrada ou sem permissão'; end if;
  if cardinality(ids) > 1000 then raise exception 'No máximo 1000 materiais por divisão'; end if;
  if array_position(ids, null) is not null then raise exception 'Material inválido'; end if;
  if (select count(distinct x) from unnest(ids) x) <> cardinality(ids) then raise exception 'Material repetido na ordem'; end if;
  if (select count(*) from public.inventory_materials where id = any(ids) and group_id = loc.group_id) <> cardinality(ids) then
    raise exception 'Material não encontrado';
  end if;
  perform 1 from public.inventory_locations where id = loc.id for update;
  select coalesce(array_agg(material_id order by position), '{}') into before_ids
  from public.inventory_material_positions where location_id = loc.id;
  if before_ids = ids then return cardinality(ids); end if;
  delete from public.inventory_material_positions where location_id = loc.id and not (material_id = any(ids));
  insert into public.inventory_material_positions(group_id, material_id, location_id, position)
  select loc.group_id, o.id, loc.id, o.ord - 1 from unnest(ids) with ordinality as o(id, ord)
  on conflict (location_id, material_id) do update set position = excluded.position;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (loc.group_id, auth.uid(), 'inventory.materials_ordered', 'inventory_location', loc.id::text,
    jsonb_build_object('name', loc.name, 'before', to_jsonb(before_ids), 'after', to_jsonb(ids)));
  return cardinality(ids);
end;
$$;

revoke all on function public.inventory_order_materials(uuid, uuid[]) from public;
grant execute on function public.inventory_order_materials(uuid, uuid[]) to authenticated;
