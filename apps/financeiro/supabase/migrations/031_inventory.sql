-- Inventário: patrimônio, consumíveis, locais e trilha de movimentações.
create type public.inventory_condition as enum ('novo', 'bom', 'regular', 'manutencao', 'inservivel');
create type public.inventory_movement_type as enum ('entrada', 'saida', 'transferencia', 'ajuste');

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text check (char_length(description) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  location_id uuid references public.inventory_locations(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  category text check (char_length(category) <= 80),
  asset_tag text check (char_length(asset_tag) <= 60),
  description text check (char_length(description) <= 500),
  quantity integer not null default 0 check (quantity >= 0),
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  condition public.inventory_condition not null default 'bom',
  active boolean not null default true,
  acquired_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, asset_tag)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type public.inventory_movement_type not null,
  quantity integer not null check (quantity > 0),
  from_location_id uuid references public.inventory_locations(id) on delete restrict,
  to_location_id uuid references public.inventory_locations(id) on delete restrict,
  notes text check (char_length(notes) <= 500),
  created_by uuid not null references auth.users(id),
  occurred_at timestamptz not null default now()
);

create index inventory_locations_group_idx on public.inventory_locations(group_id, active, name);
create index inventory_items_group_idx on public.inventory_items(group_id, active, name);
create index inventory_items_location_idx on public.inventory_items(location_id);
create index inventory_movements_group_date_idx on public.inventory_movements(group_id, occurred_at desc);
create index inventory_movements_item_idx on public.inventory_movements(item_id, occurred_at desc);

alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy "members read inventory locations" on public.inventory_locations for select using (public.is_group_member(group_id));
create policy "editors manage inventory locations" on public.inventory_locations for all using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id));
create policy "members read inventory items" on public.inventory_items for select using (public.is_group_member(group_id));
create policy "editors manage inventory items" on public.inventory_items for all using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id));
create policy "members read inventory movements" on public.inventory_movements for select using (public.is_group_member(group_id));
create policy "editors create inventory movements" on public.inventory_movements for insert with check (public.can_edit_group(group_id));

create or replace function public.touch_inventory_item()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger inventory_items_touch before update on public.inventory_items for each row execute function public.touch_inventory_item();

create or replace function public.record_inventory_movement(
  p_item_id uuid, p_type public.inventory_movement_type, p_quantity integer,
  p_to_location_id uuid default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_item public.inventory_items; v_id uuid; v_new_quantity integer;
begin
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if v_item.id is null then raise exception 'Item não encontrado'; end if;
  if not public.can_edit_group(v_item.group_id) then raise exception 'Sem permissão para movimentar este item'; end if;
  if p_quantity <= 0 then raise exception 'A quantidade deve ser positiva'; end if;
  if p_to_location_id is not null and not exists (select 1 from public.inventory_locations where id = p_to_location_id and group_id = v_item.group_id and active) then raise exception 'Local de destino inválido'; end if;
  v_new_quantity := case when p_type = 'entrada' then v_item.quantity + p_quantity when p_type = 'saida' then v_item.quantity - p_quantity else v_item.quantity end;
  if v_new_quantity < 0 then raise exception 'Estoque insuficiente'; end if;
  insert into public.inventory_movements(group_id,item_id,movement_type,quantity,from_location_id,to_location_id,notes,created_by)
  values(v_item.group_id,v_item.id,p_type,p_quantity,v_item.location_id,p_to_location_id,nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  update public.inventory_items set quantity = v_new_quantity, location_id = case when p_type = 'transferencia' then p_to_location_id else location_id end where id = v_item.id;
  insert into public.audit_events(group_id,actor_id,action,entity_type,entity_id,details) values(v_item.group_id,auth.uid(),'inventory.moved','inventory_item',v_item.id::text,jsonb_build_object('type',p_type,'quantity',p_quantity));
  return v_id;
end;
$$;

revoke all on function public.record_inventory_movement(uuid, public.inventory_movement_type, integer, uuid, text) from public;
grant execute on function public.record_inventory_movement(uuid, public.inventory_movement_type, integer, uuid, text) to authenticated;
