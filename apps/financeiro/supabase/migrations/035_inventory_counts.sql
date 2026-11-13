-- Inventário: contagens anuais por material e divisão (conferência do começo do ano; histórico da planilha 2024–2026).
-- A quantidade atual continua nos lotes/peças; a contagem é o registro do que foi contado em cada ano.
-- Escrita só pelo gestor, via inventory_record_count (auditada); leitura para os membros do grupo.

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  year integer not null check (year between 2000 and 2100),
  material_id uuid not null,
  location_id uuid not null,
  quantity integer not null check (quantity >= 0),
  notes text check (char_length(notes) <= 500),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (group_id, year, material_id, location_id),
  foreign key (group_id, material_id) references public.inventory_materials(group_id, id) on delete cascade,
  foreign key (group_id, location_id) references public.inventory_locations(group_id, id) on delete cascade
);
create index inventory_counts_year_idx on public.inventory_counts(group_id, year);

alter table public.inventory_counts enable row level security;
create policy "members read inventory counts" on public.inventory_counts for select using (public.is_group_member(group_id));

-- Registra (ou corrige) a contagem de um material numa divisão num ano.
create or replace function public.inventory_record_count(p_material_id uuid, p_location_id uuid, p_year integer, p_quantity integer, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.inventory_materials; result uuid; previous integer;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_manage_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if p_year is null or p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'Informe a quantidade contada'; end if;
  if not exists (select 1 from public.inventory_locations where id = p_location_id and group_id = m.group_id) then raise exception 'Divisão não encontrada'; end if;
  select quantity into previous from public.inventory_counts where group_id = m.group_id and year = p_year and material_id = m.id and location_id = p_location_id;
  insert into public.inventory_counts(group_id, year, material_id, location_id, quantity, notes, recorded_by)
  values (m.group_id, p_year, m.id, p_location_id, p_quantity, public.inventory_clean(p_notes), auth.uid())
  on conflict (group_id, year, material_id, location_id) do update
    set quantity = excluded.quantity, notes = excluded.notes, recorded_by = excluded.recorded_by, recorded_at = now()
  returning id into result;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (m.group_id, auth.uid(), 'inventory.count_recorded', 'inventory_count', result::text,
    jsonb_build_object('year', p_year, 'material_id', m.id, 'location_id', p_location_id, 'from', previous, 'to', p_quantity));
  return result;
end;
$$;

revoke all on function public.inventory_record_count(uuid, uuid, integer, integer, text) from public, anon;
grant execute on function public.inventory_record_count(uuid, uuid, integer, integer, text) to authenticated;
