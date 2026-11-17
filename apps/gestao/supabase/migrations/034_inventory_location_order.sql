-- Inventário: ordem das divisões escolhida pelo gestor (não alfabética).
-- Cada divisão tem uma posição entre as irmãs; a árvore segue as posições (sort_key = posições do caminho).
-- Divisão nova, ou que muda de superior, entra no fim das irmãs; inventory_move_location sobe/desce uma casa.

alter table public.inventory_locations add column position integer not null default 0;

-- Divisões existentes: a ordem alfabética de hoje vira a posição inicial.
update public.inventory_locations l set position = o.pos
from (select id, row_number() over (partition by group_id, parent_id order by lower(name)) - 1 as pos from public.inventory_locations) o
where o.id = l.id;

-- Mesmas colunas da 032, mais sort_key no fim (create or replace só aceita coluna nova no fim).
create or replace view public.inventory_location_paths with (security_invoker = true) as
with recursive tree as (
  select id, group_id, parent_id, name, active, name::text as path, 0 as depth, array[id] as ancestors, array[position] as sort_key
  from public.inventory_locations where parent_id is null
  union all
  select l.id, l.group_id, l.parent_id, l.name, l.active, tree.path || ' › ' || l.name, tree.depth + 1, tree.ancestors || l.id, tree.sort_key || l.position
  from public.inventory_locations l join tree on l.parent_id = tree.id
)
select id, group_id, parent_id, name, active, path, depth, ancestors, sort_key from tree;

-- Próxima posição entre as filhas de uma divisão (ou entre as raízes).
create or replace function public.inventory_next_location_position(p_group_id uuid, p_parent_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(max(position) + 1, 0) from public.inventory_locations where group_id = p_group_id and parent_id is not distinct from p_parent_id;
$$;

create or replace function public.inventory_save_location(p_group_id uuid, p_id uuid, p_parent_id uuid, p_name text, p_description text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare clean_name text := public.inventory_clean(p_name); result uuid := p_id; old_parent uuid;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Sem permissão para alterar divisões'; end if;
  if clean_name is null or char_length(clean_name) > 80 then raise exception 'Informe um nome de divisão com até 80 caracteres'; end if;
  if p_parent_id is not null and not exists (select 1 from public.inventory_locations where id = p_parent_id and group_id = p_group_id) then
    raise exception 'Divisão superior não encontrada';
  end if;
  if exists (select 1 from public.inventory_locations where group_id = p_group_id and parent_id is not distinct from p_parent_id
    and lower(name) = lower(clean_name) and id is distinct from p_id) then
    raise exception 'Já existe a divisão % neste nível', clean_name;
  end if;
  if p_id is null then
    insert into public.inventory_locations(group_id, parent_id, name, description, active, position)
    values (p_group_id, p_parent_id, clean_name, public.inventory_clean(p_description), coalesce(p_active, true), public.inventory_next_location_position(p_group_id, p_parent_id))
    returning id into result;
  else
    select parent_id into old_parent from public.inventory_locations where id = p_id and group_id = p_group_id;
    if not found then raise exception 'Divisão não encontrada'; end if;
    if p_parent_id is not null and p_id = any(coalesce((select ancestors from public.inventory_location_paths where id = p_parent_id), '{}'::uuid[])) then
      raise exception 'Uma divisão não pode ficar dentro dela mesma';
    end if;
    if not coalesce(p_active, true) and (
      exists (select 1 from public.inventory_lots where location_id = p_id and quantity > 0)
      or exists (select 1 from public.inventory_units where location_id = p_id and written_off_at is null)
      or exists (select 1 from public.inventory_locations where parent_id = p_id and active)
    ) then raise exception 'Esvazie a divisão (materiais e subdivisões ativas) antes de inativá-la'; end if;
    update public.inventory_locations set parent_id = p_parent_id, name = clean_name, description = public.inventory_clean(p_description), active = coalesce(p_active, true),
      position = case when p_parent_id is distinct from old_parent then public.inventory_next_location_position(p_group_id, p_parent_id) else position end
    where id = p_id;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'inventory.location_created' else 'inventory.location_updated' end, 'inventory_location', result::text,
    jsonb_build_object('name', clean_name, 'parent_id', p_parent_id, 'active', coalesce(p_active, true)));
  return result;
end;
$$;

-- Sobe (p_offset = -1) ou desce (+1) a divisão entre as irmãs. Renumera as irmãs (0, 1, 2…) antes de trocar,
-- para posições repetidas ou com buracos não atrapalharem.
create or replace function public.inventory_move_location(p_id uuid, p_offset integer)
returns void language plpgsql security definer set search_path = '' as $$
declare loc public.inventory_locations; siblings integer; current_pos integer; target integer;
begin
  select * into loc from public.inventory_locations where id = p_id;
  if loc.id is null or not public.can_manage_inventory(loc.group_id) then raise exception 'Divisão não encontrada ou sem permissão'; end if;
  if p_offset not in (-1, 1) then raise exception 'Mova uma posição por vez'; end if;
  -- Trava as irmãs (mesma superior) durante a troca.
  perform 1 from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from loc.parent_id for update;
  update public.inventory_locations l set position = o.pos
  from (select id, row_number() over (order by position, lower(name)) - 1 as pos
        from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from loc.parent_id) o
  where o.id = l.id;
  select count(*), max(position) filter (where id = p_id) into siblings, current_pos
  from public.inventory_locations where group_id = loc.group_id and parent_id is not distinct from loc.parent_id;
  target := current_pos + p_offset;
  if target < 0 then raise exception 'A divisão já é a primeira do nível'; end if;
  if target >= siblings then raise exception 'A divisão já é a última do nível'; end if;
  update public.inventory_locations set position = current_pos
  where group_id = loc.group_id and parent_id is not distinct from loc.parent_id and position = target;
  update public.inventory_locations set position = target where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (loc.group_id, auth.uid(), 'inventory.location_moved', 'inventory_location', p_id::text,
    jsonb_build_object('name', loc.name, 'parent_id', loc.parent_id, 'from', current_pos, 'to', target));
end;
$$;

revoke all on function public.inventory_next_location_position(uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_move_location(uuid, integer) from public, anon;
grant execute on function public.inventory_move_location(uuid, integer) to authenticated;
