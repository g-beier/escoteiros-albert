-- Inventário: modelo de apps/inventario/docs/modelo.md (passo 1: cadastro).
-- Recria as tabelas da 031, que só existiram em bancos de desenvolvimento (sem dados reais).
--
-- Material (tipo de coisa) é controlado por peça (com etiqueta) ou por lote (quantidade numa divisão,
-- com condição, valor e validade próprios). Divisões formam uma árvore. Toda mudança gera um movimento;
-- o movimento do chefe nasce pendente de revisão, o do gestor/administrador já nasce revisado.
-- Escrita só pelas funções abaixo (auditadas em audit_events); leitura para os membros do grupo.

drop function if exists public.record_inventory_movement(uuid, public.inventory_movement_type, integer, uuid, text);
drop table if exists public.inventory_movements, public.inventory_items, public.inventory_locations cascade;
drop function if exists public.touch_inventory_item();
drop type if exists public.inventory_movement_type;
drop type if exists public.inventory_condition;

-- Papéis por app -------------------------------------------------------------------------------
-- Administrador do grupo (memberships.role = 'admin') administra os dois apps. No Inventário, os demais
-- têm papel próprio: gestor (sem gerenciar usuários), chefe (passa por revisão) ou consulta.
create type public.inventory_role as enum ('manager', 'chief', 'viewer');
alter table public.memberships add column inventory_role public.inventory_role not null default 'viewer';

create or replace function public.inventory_role_of(p_group_id uuid)
returns public.inventory_role language sql stable security definer set search_path = '' as $$
  select case when role = 'admin' then 'manager'::public.inventory_role else inventory_role end
  from public.memberships where group_id = p_group_id and user_id = auth.uid();
$$;

create or replace function public.can_manage_inventory(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.inventory_role_of(p_group_id) = 'manager', false);
$$;

create or replace function public.can_edit_inventory(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.inventory_role_of(p_group_id) in ('manager', 'chief'), false);
$$;

create or replace function public.admin_change_inventory_role(p_group_id uuid, p_user_id uuid, p_role public.inventory_role)
returns void language plpgsql security definer set search_path = '' as $$
declare old_role public.inventory_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem alterar papéis';
  end if;
  select inventory_role into old_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if old_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  update public.memberships set inventory_role = p_role where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.inventory_role_changed', 'user', p_user_id::text, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

-- Tipos ----------------------------------------------------------------------------------------
create type public.inventory_condition as enum ('novo', 'bom', 'regular', 'ruim', 'manutencao', 'inservivel');
create type public.inventory_tracking as enum ('unit', 'lot');
create type public.inventory_origin as enum ('compra', 'doacao', 'fabricacao', 'nao_informada');
create type public.inventory_write_off_reason as enum ('perda', 'extravio', 'descarte', 'doacao', 'consumo');
create type public.inventory_movement_kind as enum ('entrada', 'transferencia', 'condicao', 'ajuste', 'baixa', 'edicao');
create type public.inventory_review_status as enum ('pendente', 'revisado', 'para_revisar');

-- Tabelas --------------------------------------------------------------------------------------
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (group_id, parent_id) references public.inventory_locations(group_id, id) on delete restrict,
  check (parent_id is null or parent_id <> id)
);
create unique index inventory_locations_name_idx on public.inventory_locations(group_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.inventory_families (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  code text check (code ~ '^[0-9]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, id),
  unique (group_id, code)
);
create unique index inventory_families_name_idx on public.inventory_families(group_id, lower(name));

create table public.inventory_materials (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  family_id uuid,
  name text not null check (char_length(name) between 2 and 120),
  tracking public.inventory_tracking not null,
  consumable boolean not null default false,
  minimum_quantity integer check (minimum_quantity >= 0),
  description text check (char_length(description) <= 500),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (group_id, family_id) references public.inventory_families(group_id, id) on delete restrict,
  check (not consumable or tracking = 'lot')
);
create unique index inventory_materials_name_idx on public.inventory_materials(group_id, lower(name));

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  material_id uuid not null,
  location_id uuid not null,
  quantity integer not null check (quantity >= 0),
  condition public.inventory_condition,
  unit_value_cents bigint check (unit_value_cents >= 0),
  expires_on date,
  acquired_on date,
  origin public.inventory_origin not null default 'nao_informada',
  supplier text check (char_length(supplier) <= 120),
  invoice text check (char_length(invoice) <= 60),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (group_id, material_id) references public.inventory_materials(group_id, id) on delete restrict,
  foreign key (group_id, location_id) references public.inventory_locations(group_id, id) on delete restrict
);

create table public.inventory_units (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  material_id uuid not null,
  location_id uuid not null,
  tag text check (tag ~ '^GEAS-[0-9]{3}-[0-9]{4}$'),
  legacy_code text check (char_length(legacy_code) <= 30),
  description text check (char_length(description) <= 500),
  condition public.inventory_condition,
  unit_value_cents bigint check (unit_value_cents >= 0),
  acquired_on date,
  origin public.inventory_origin not null default 'nao_informada',
  supplier text check (char_length(supplier) <= 120),
  invoice text check (char_length(invoice) <= 60),
  notes text check (char_length(notes) <= 500),
  written_off_at timestamptz,
  write_off_reason public.inventory_write_off_reason,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, id),
  unique (group_id, tag),
  foreign key (group_id, material_id) references public.inventory_materials(group_id, id) on delete restrict,
  foreign key (group_id, location_id) references public.inventory_locations(group_id, id) on delete restrict,
  check ((written_off_at is null) = (write_off_reason is null))
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  kind public.inventory_movement_kind not null,
  material_id uuid not null,
  lot_id uuid,
  unit_id uuid,
  quantity integer check (quantity >= 0),
  from_location_id uuid,
  to_location_id uuid,
  from_condition public.inventory_condition,
  to_condition public.inventory_condition,
  write_off_reason public.inventory_write_off_reason,
  notes text check (char_length(notes) <= 500),
  details jsonb not null default '{}'::jsonb,
  review_status public.inventory_review_status not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (group_id, material_id) references public.inventory_materials(group_id, id) on delete restrict,
  foreign key (group_id, lot_id) references public.inventory_lots(group_id, id) on delete restrict,
  foreign key (group_id, unit_id) references public.inventory_units(group_id, id) on delete restrict,
  check (lot_id is null or unit_id is null)
);

create index inventory_locations_parent_idx on public.inventory_locations(group_id, parent_id);
create index inventory_materials_family_idx on public.inventory_materials(group_id, family_id);
create index inventory_lots_material_idx on public.inventory_lots(group_id, material_id);
create index inventory_lots_location_idx on public.inventory_lots(group_id, location_id);
create index inventory_lots_expires_idx on public.inventory_lots(group_id, expires_on) where expires_on is not null and quantity > 0;
create index inventory_units_material_idx on public.inventory_units(group_id, material_id);
create index inventory_units_location_idx on public.inventory_units(group_id, location_id);
create index inventory_movements_group_date_idx on public.inventory_movements(group_id, created_at desc);
create index inventory_movements_material_idx on public.inventory_movements(group_id, material_id, created_at desc);
create index inventory_movements_review_idx on public.inventory_movements(group_id, review_status) where review_status <> 'revisado';

alter table public.inventory_locations enable row level security;
alter table public.inventory_families enable row level security;
alter table public.inventory_materials enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_units enable row level security;
alter table public.inventory_movements enable row level security;

create policy "members read inventory locations" on public.inventory_locations for select using (public.is_group_member(group_id));
create policy "members read inventory families" on public.inventory_families for select using (public.is_group_member(group_id));
create policy "members read inventory materials" on public.inventory_materials for select using (public.is_group_member(group_id));
create policy "members read inventory lots" on public.inventory_lots for select using (public.is_group_member(group_id));
create policy "members read inventory units" on public.inventory_units for select using (public.is_group_member(group_id));
create policy "members read inventory movements" on public.inventory_movements for select using (public.is_group_member(group_id));

-- Visões ---------------------------------------------------------------------------------------
-- Caminho da divisão ("Cozinha e despensa › Estante de canecas › 2º nível").
create or replace view public.inventory_location_paths with (security_invoker = true) as
with recursive tree as (
  select id, group_id, parent_id, name, active, name::text as path, 0 as depth, array[id] as ancestors
  from public.inventory_locations where parent_id is null
  union all
  select l.id, l.group_id, l.parent_id, l.name, l.active, tree.path || ' › ' || l.name, tree.depth + 1, tree.ancestors || l.id
  from public.inventory_locations l join tree on l.parent_id = tree.id
)
select id, group_id, parent_id, name, active, path, depth, ancestors from tree;

-- Estoque por material: unidades em lotes + peças ativas, e aviso de mínimo/validade.
create or replace view public.inventory_material_rows with (security_invoker = true) as
select m.id, m.group_id, m.name, m.tracking, m.consumable, m.minimum_quantity, m.description, m.active,
  m.family_id, f.name as family_name, f.code as family_code,
  case when m.tracking = 'lot' then coalesce(l.quantity, 0) else coalesce(u.quantity, 0) end as quantity,
  coalesce(l.lots, 0) as lots,
  coalesce(l.value_cents, 0) + coalesce(u.value_cents, 0) as estimated_value_cents,
  l.next_expiry,
  m.minimum_quantity is not null and coalesce(l.quantity, 0) + coalesce(u.quantity, 0) < m.minimum_quantity as below_minimum,
  m.updated_at
from public.inventory_materials m
left join public.inventory_families f on f.id = m.family_id
left join lateral (
  select sum(quantity)::int as quantity, count(*) filter (where quantity > 0)::int as lots,
    sum(quantity * coalesce(unit_value_cents, 0))::bigint as value_cents,
    min(expires_on) filter (where quantity > 0) as next_expiry
  from public.inventory_lots where material_id = m.id
) l on true
left join lateral (
  select count(*)::int as quantity, sum(coalesce(unit_value_cents, 0))::bigint as value_cents
  from public.inventory_units where material_id = m.id and written_off_at is null
) u on true;

-- Auxiliares -----------------------------------------------------------------------------------
create or replace function public.inventory_clean(p_text text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g'), '');
$$;

-- Registra o movimento (com o status de revisão do papel de quem fez) e o evento de auditoria.
create or replace function public.inventory_log(
  p_group_id uuid, p_kind public.inventory_movement_kind, p_material_id uuid, p_lot_id uuid, p_unit_id uuid,
  p_quantity integer, p_from_location uuid, p_to_location uuid, p_from_condition public.inventory_condition,
  p_to_condition public.inventory_condition, p_reason public.inventory_write_off_reason, p_notes text, p_details jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare new_id bigint; reviewed boolean := public.can_manage_inventory(p_group_id);
begin
  insert into public.inventory_movements(group_id, kind, material_id, lot_id, unit_id, quantity, from_location_id, to_location_id,
    from_condition, to_condition, write_off_reason, notes, details, review_status, reviewed_by, reviewed_at, created_by)
  values (p_group_id, p_kind, p_material_id, p_lot_id, p_unit_id, p_quantity, p_from_location, p_to_location,
    p_from_condition, p_to_condition, p_reason, public.inventory_clean(p_notes), coalesce(p_details, '{}'::jsonb),
    case when reviewed then 'revisado'::public.inventory_review_status else 'pendente' end,
    case when reviewed then auth.uid() end, case when reviewed then now() end, auth.uid())
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'inventory.' || p_kind, case when p_unit_id is not null then 'inventory_unit' when p_lot_id is not null then 'inventory_lot' else 'inventory_material' end,
    coalesce(p_unit_id, p_lot_id, p_material_id)::text, jsonb_build_object('movement_id', new_id) || coalesce(p_details, '{}'::jsonb));
  return new_id;
end;
$$;

create or replace function public.inventory_check_location(p_group_id uuid, p_location_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_location_id is null or not exists (select 1 from public.inventory_locations where id = p_location_id and group_id = p_group_id and active) then
    raise exception 'Escolha uma divisão ativa';
  end if;
end;
$$;

-- Divisões e famílias (gestor) -----------------------------------------------------------------
create or replace function public.inventory_save_location(p_group_id uuid, p_id uuid, p_parent_id uuid, p_name text, p_description text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare clean_name text := public.inventory_clean(p_name); result uuid := p_id;
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
    insert into public.inventory_locations(group_id, parent_id, name, description, active)
    values (p_group_id, p_parent_id, clean_name, public.inventory_clean(p_description), coalesce(p_active, true)) returning id into result;
  else
    if not exists (select 1 from public.inventory_locations where id = p_id and group_id = p_group_id) then raise exception 'Divisão não encontrada'; end if;
    if p_parent_id is not null and p_id = any(coalesce((select ancestors from public.inventory_location_paths where id = p_parent_id), '{}'::uuid[])) then
      raise exception 'Uma divisão não pode ficar dentro dela mesma';
    end if;
    if not coalesce(p_active, true) and (
      exists (select 1 from public.inventory_lots where location_id = p_id and quantity > 0)
      or exists (select 1 from public.inventory_units where location_id = p_id and written_off_at is null)
      or exists (select 1 from public.inventory_locations where parent_id = p_id and active)
    ) then raise exception 'Esvazie a divisão (materiais e subdivisões ativas) antes de inativá-la'; end if;
    update public.inventory_locations set parent_id = p_parent_id, name = clean_name, description = public.inventory_clean(p_description), active = coalesce(p_active, true)
    where id = p_id;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'inventory.location_created' else 'inventory.location_updated' end, 'inventory_location', result::text,
    jsonb_build_object('name', clean_name, 'parent_id', p_parent_id, 'active', coalesce(p_active, true)));
  return result;
end;
$$;

create or replace function public.inventory_save_family(p_group_id uuid, p_id uuid, p_name text, p_code text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare clean_name text := public.inventory_clean(p_name); clean_code text := public.inventory_clean(p_code); result uuid := p_id;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Sem permissão para alterar famílias'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 80 then raise exception 'Informe um nome de família com 2 a 80 caracteres'; end if;
  if clean_code is not null and clean_code !~ '^[0-9]{3}$' then raise exception 'O código da família tem 3 dígitos (ex.: 001)'; end if;
  if exists (select 1 from public.inventory_families where group_id = p_group_id and lower(name) = lower(clean_name) and id is distinct from p_id) then
    raise exception 'Já existe a família %', clean_name;
  end if;
  if clean_code is not null and exists (select 1 from public.inventory_families where group_id = p_group_id and code = clean_code and id is distinct from p_id) then
    raise exception 'O código % já é de outra família', clean_code;
  end if;
  if p_id is null then
    insert into public.inventory_families(group_id, name, code, active) values (p_group_id, clean_name, clean_code, coalesce(p_active, true)) returning id into result;
  else
    if exists (select 1 from public.inventory_units u join public.inventory_materials m on m.id = u.material_id
      where m.family_id = p_id and u.tag is not null and substr(u.tag, 6, 3) is distinct from clean_code) then
      raise exception 'Há peças etiquetadas com o código atual desta família';
    end if;
    update public.inventory_families set name = clean_name, code = clean_code, active = coalesce(p_active, true) where id = p_id and group_id = p_group_id;
    if not found then raise exception 'Família não encontrada'; end if;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'inventory.family_created' else 'inventory.family_updated' end, 'inventory_family', result::text,
    jsonb_build_object('name', clean_name, 'code', clean_code, 'active', coalesce(p_active, true)));
  return result;
end;
$$;

-- Materiais (chefe ou gestor) ------------------------------------------------------------------
create or replace function public.inventory_save_material(
  p_group_id uuid, p_id uuid, p_family_id uuid, p_name text, p_tracking public.inventory_tracking,
  p_consumable boolean, p_minimum_quantity integer, p_description text, p_active boolean default true
) returns uuid language plpgsql security definer set search_path = '' as $$
declare clean_name text := public.inventory_clean(p_name); result uuid := p_id; old public.inventory_materials;
begin
  if not public.can_edit_inventory(p_group_id) then raise exception 'Sem permissão para alterar materiais'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 120 then raise exception 'Informe um nome de material com 2 a 120 caracteres'; end if;
  if p_tracking is null then raise exception 'Escolha se o material é controlado por peça ou por quantidade'; end if;
  if coalesce(p_consumable, false) and p_tracking <> 'lot' then raise exception 'Consumível é controlado por quantidade'; end if;
  if p_minimum_quantity is not null and p_minimum_quantity < 0 then raise exception 'O estoque mínimo não pode ser negativo'; end if;
  if p_family_id is not null and not exists (select 1 from public.inventory_families where id = p_family_id and group_id = p_group_id) then
    raise exception 'Família não encontrada';
  end if;
  if exists (select 1 from public.inventory_materials where group_id = p_group_id and lower(name) = lower(clean_name) and id is distinct from p_id) then
    raise exception 'Já existe o material %', clean_name;
  end if;
  if p_id is null then
    insert into public.inventory_materials(group_id, family_id, name, tracking, consumable, minimum_quantity, description, active, created_by)
    values (p_group_id, p_family_id, clean_name, p_tracking, coalesce(p_consumable, false), p_minimum_quantity, public.inventory_clean(p_description), coalesce(p_active, true), auth.uid())
    returning id into result;
    perform public.inventory_log(p_group_id, 'edicao', result, null, null, null, null, null, null, null, null, null,
      jsonb_build_object('action', 'material_created', 'name', clean_name, 'tracking', p_tracking));
  else
    select * into old from public.inventory_materials where id = p_id and group_id = p_group_id for update;
    if old.id is null then raise exception 'Material não encontrado'; end if;
    if old.tracking <> p_tracking and (exists (select 1 from public.inventory_lots where material_id = p_id) or exists (select 1 from public.inventory_units where material_id = p_id)) then
      raise exception 'Não é possível trocar o controle (peça/quantidade) de um material que já tem estoque';
    end if;
    update public.inventory_materials set family_id = p_family_id, name = clean_name, tracking = p_tracking, consumable = coalesce(p_consumable, false),
      minimum_quantity = p_minimum_quantity, description = public.inventory_clean(p_description), active = coalesce(p_active, true), updated_at = now()
    where id = p_id;
    perform public.inventory_log(p_group_id, 'edicao', p_id, null, null, null, null, null, null, null, null, null,
      jsonb_build_object('action', 'material_updated', 'before', to_jsonb(old) - 'group_id' - 'created_by' - 'created_at' - 'updated_at',
        'after', jsonb_build_object('name', clean_name, 'family_id', p_family_id, 'tracking', p_tracking, 'consumable', coalesce(p_consumable, false),
          'minimum_quantity', p_minimum_quantity, 'active', coalesce(p_active, true))));
  end if;
  return result;
end;
$$;

-- Entrada: lote ou peça ------------------------------------------------------------------------
create or replace function public.inventory_add_lot(
  p_material_id uuid, p_location_id uuid, p_quantity integer, p_condition public.inventory_condition,
  p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin,
  p_supplier text, p_invoice text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.inventory_materials; new_id uuid;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_edit_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if m.tracking <> 'lot' then raise exception 'Este material é controlado por peça: cadastre as peças'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'A quantidade deve ser positiva'; end if;
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  perform public.inventory_check_location(m.group_id, p_location_id);
  insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes)
  values (m.group_id, m.id, p_location_id, p_quantity, p_condition, p_unit_value_cents, p_expires_on, p_acquired_on, coalesce(p_origin, 'nao_informada'),
    public.inventory_clean(p_supplier), public.inventory_clean(p_invoice), public.inventory_clean(p_notes))
  returning id into new_id;
  perform public.inventory_log(m.group_id, 'entrada', m.id, new_id, null, p_quantity, null, p_location_id, null, p_condition, null, p_notes,
    jsonb_build_object('origin', coalesce(p_origin, 'nao_informada'), 'unit_value_cents', p_unit_value_cents, 'expires_on', p_expires_on));
  return new_id;
end;
$$;

create or replace function public.inventory_check_tag(p_group_id uuid, p_material_id uuid, p_unit_id uuid, p_tag text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare clean_tag text := upper(public.inventory_clean(p_tag)); family_code text;
begin
  if clean_tag is null then return null; end if;
  if clean_tag !~ '^GEAS-[0-9]{3}-[0-9]{4}$' then raise exception 'A etiqueta segue o formato GEAS-000-0000'; end if;
  select f.code into family_code from public.inventory_materials m left join public.inventory_families f on f.id = m.family_id where m.id = p_material_id;
  if family_code is null then raise exception 'Defina a família do material, com código, antes de etiquetar'; end if;
  if substr(clean_tag, 6, 3) <> family_code then raise exception 'A etiqueta deve começar com GEAS-%- (código da família)', family_code; end if;
  if exists (select 1 from public.inventory_units where group_id = p_group_id and tag = clean_tag and id is distinct from p_unit_id) then
    raise exception 'A etiqueta % já está em uso', clean_tag;
  end if;
  return clean_tag;
end;
$$;

create or replace function public.inventory_add_unit(
  p_material_id uuid, p_location_id uuid, p_tag text, p_legacy_code text, p_description text,
  p_condition public.inventory_condition, p_unit_value_cents bigint, p_acquired_on date, p_origin public.inventory_origin,
  p_supplier text, p_invoice text, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.inventory_materials; new_id uuid; clean_tag text;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_edit_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if m.tracking <> 'unit' then raise exception 'Este material é controlado por quantidade: cadastre um lote'; end if;
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  perform public.inventory_check_location(m.group_id, p_location_id);
  clean_tag := public.inventory_check_tag(m.group_id, m.id, null, p_tag);
  insert into public.inventory_units(group_id, material_id, location_id, tag, legacy_code, description, condition, unit_value_cents, acquired_on, origin, supplier, invoice, notes)
  values (m.group_id, m.id, p_location_id, clean_tag, public.inventory_clean(p_legacy_code), public.inventory_clean(p_description), p_condition, p_unit_value_cents,
    p_acquired_on, coalesce(p_origin, 'nao_informada'), public.inventory_clean(p_supplier), public.inventory_clean(p_invoice), public.inventory_clean(p_notes))
  returning id into new_id;
  perform public.inventory_log(m.group_id, 'entrada', m.id, null, new_id, 1, null, p_location_id, null, p_condition, null, p_notes,
    jsonb_build_object('tag', clean_tag, 'origin', coalesce(p_origin, 'nao_informada'), 'unit_value_cents', p_unit_value_cents));
  return new_id;
end;
$$;

-- Lote: parte de um lote vira outro lote com os mesmos dados (transferência ou condição parcial).
create or replace function public.inventory_split_lot(p_lot public.inventory_lots, p_quantity integer, p_location_id uuid, p_condition public.inventory_condition)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  update public.inventory_lots set quantity = quantity - p_quantity, updated_at = now() where id = p_lot.id;
  insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes)
  values (p_lot.group_id, p_lot.material_id, p_location_id, p_quantity, p_condition, p_lot.unit_value_cents, p_lot.expires_on, p_lot.acquired_on, p_lot.origin,
    p_lot.supplier, p_lot.invoice, p_lot.notes)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.inventory_lock_lot(p_lot_id uuid)
returns public.inventory_lots language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots;
begin
  select * into lot from public.inventory_lots where id = p_lot_id for update;
  if lot.id is null or not public.can_edit_inventory(lot.group_id) then raise exception 'Lote não encontrado ou sem permissão'; end if;
  return lot;
end;
$$;

create or replace function public.inventory_lock_unit(p_unit_id uuid)
returns public.inventory_units language plpgsql security definer set search_path = '' as $$
declare unit public.inventory_units;
begin
  select * into unit from public.inventory_units where id = p_unit_id for update;
  if unit.id is null or not public.can_edit_inventory(unit.group_id) then raise exception 'Peça não encontrada ou sem permissão'; end if;
  if unit.written_off_at is not null then raise exception 'Esta peça já foi baixada'; end if;
  return unit;
end;
$$;

-- Transferência --------------------------------------------------------------------------------
-- p_quantity nulo ou igual ao lote = o lote inteiro muda de divisão; menos = vira um lote novo no destino.
create or replace function public.inventory_transfer_lot(p_lot_id uuid, p_to_location_id uuid, p_quantity integer, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity); target uuid := lot.id;
begin
  perform public.inventory_check_location(lot.group_id, p_to_location_id);
  if p_to_location_id = lot.location_id then raise exception 'O lote já está nesta divisão'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  if qty = lot.quantity then
    update public.inventory_lots set location_id = p_to_location_id, updated_at = now() where id = lot.id;
  else
    target := public.inventory_split_lot(lot, qty, p_to_location_id, lot.condition);
  end if;
  perform public.inventory_log(lot.group_id, 'transferencia', lot.material_id, target, null, qty, lot.location_id, p_to_location_id, null, null, null, p_notes,
    jsonb_build_object('source_lot_id', lot.id));
  return target;
end;
$$;

create or replace function public.inventory_transfer_unit(p_unit_id uuid, p_to_location_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id);
begin
  perform public.inventory_check_location(unit.group_id, p_to_location_id);
  if p_to_location_id = unit.location_id then raise exception 'A peça já está nesta divisão'; end if;
  update public.inventory_units set location_id = p_to_location_id, updated_at = now() where id = unit.id;
  perform public.inventory_log(unit.group_id, 'transferencia', unit.material_id, null, unit.id, 1, unit.location_id, p_to_location_id, null, null, null, p_notes, '{}'::jsonb);
end;
$$;

-- Condição -------------------------------------------------------------------------------------
create or replace function public.inventory_set_lot_condition(p_lot_id uuid, p_condition public.inventory_condition, p_quantity integer, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity); target uuid := lot.id;
begin
  if p_condition is not distinct from lot.condition then raise exception 'O lote já está nesta condição'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  if qty = lot.quantity then
    update public.inventory_lots set condition = p_condition, updated_at = now() where id = lot.id;
  else
    target := public.inventory_split_lot(lot, qty, lot.location_id, p_condition);
  end if;
  perform public.inventory_log(lot.group_id, 'condicao', lot.material_id, target, null, qty, null, null, lot.condition, p_condition, null, p_notes,
    jsonb_build_object('source_lot_id', lot.id));
  return target;
end;
$$;

create or replace function public.inventory_set_unit_condition(p_unit_id uuid, p_condition public.inventory_condition, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id);
begin
  if p_condition is not distinct from unit.condition then raise exception 'A peça já está nesta condição'; end if;
  update public.inventory_units set condition = p_condition, updated_at = now() where id = unit.id;
  perform public.inventory_log(unit.group_id, 'condicao', unit.material_id, null, unit.id, 1, null, null, unit.condition, p_condition, null, p_notes, '{}'::jsonb);
end;
$$;

-- Ajuste de quantidade (contagem diferente do registrado) --------------------------------------
create or replace function public.inventory_adjust_lot(p_lot_id uuid, p_quantity integer, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id);
begin
  if p_quantity is null or p_quantity < 0 then raise exception 'Informe a quantidade contada'; end if;
  if p_quantity = lot.quantity then raise exception 'A quantidade não mudou'; end if;
  if public.inventory_clean(p_notes) is null then raise exception 'Explique o ajuste na observação'; end if;
  update public.inventory_lots set quantity = p_quantity, updated_at = now() where id = lot.id;
  perform public.inventory_log(lot.group_id, 'ajuste', lot.material_id, lot.id, null, abs(p_quantity - lot.quantity), null, null, null, null, null, p_notes,
    jsonb_build_object('from', lot.quantity, 'to', p_quantity));
end;
$$;

-- Baixa ----------------------------------------------------------------------------------------
create or replace function public.inventory_write_off_lot(p_lot_id uuid, p_quantity integer, p_reason public.inventory_write_off_reason, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity);
begin
  if p_reason is null then raise exception 'Escolha o motivo da baixa'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  update public.inventory_lots set quantity = quantity - qty, updated_at = now() where id = lot.id;
  perform public.inventory_log(lot.group_id, 'baixa', lot.material_id, lot.id, null, qty, lot.location_id, null, null, null, p_reason, p_notes,
    jsonb_build_object('from', lot.quantity, 'to', lot.quantity - qty));
end;
$$;

create or replace function public.inventory_write_off_unit(p_unit_id uuid, p_reason public.inventory_write_off_reason, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id);
begin
  if p_reason is null then raise exception 'Escolha o motivo da baixa'; end if;
  update public.inventory_units set written_off_at = now(), write_off_reason = p_reason, updated_at = now() where id = unit.id;
  perform public.inventory_log(unit.group_id, 'baixa', unit.material_id, null, unit.id, 1, unit.location_id, null, null, null, p_reason, p_notes, '{}'::jsonb);
end;
$$;

-- Edição dos dados de entrada (valor, validade, origem…) e da etiqueta -------------------------
create or replace function public.inventory_update_lot(
  p_lot_id uuid, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin,
  p_supplier text, p_invoice text, p_notes text
) returns void language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id);
begin
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  update public.inventory_lots set unit_value_cents = p_unit_value_cents, expires_on = p_expires_on, acquired_on = p_acquired_on,
    origin = coalesce(p_origin, 'nao_informada'), supplier = public.inventory_clean(p_supplier), invoice = public.inventory_clean(p_invoice),
    notes = public.inventory_clean(p_notes), updated_at = now()
  where id = lot.id;
  perform public.inventory_log(lot.group_id, 'edicao', lot.material_id, lot.id, null, null, null, null, null, null, null, null,
    jsonb_build_object('action', 'lot_updated', 'before', to_jsonb(lot) - 'group_id' - 'created_at' - 'updated_at'));
end;
$$;

create or replace function public.inventory_update_unit(
  p_unit_id uuid, p_tag text, p_legacy_code text, p_description text, p_unit_value_cents bigint, p_acquired_on date,
  p_origin public.inventory_origin, p_supplier text, p_invoice text, p_notes text
) returns void language plpgsql security definer set search_path = '' as $$
declare unit public.inventory_units := public.inventory_lock_unit(p_unit_id); clean_tag text;
begin
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  clean_tag := public.inventory_check_tag(unit.group_id, unit.material_id, unit.id, p_tag);
  update public.inventory_units set tag = clean_tag, legacy_code = public.inventory_clean(p_legacy_code), description = public.inventory_clean(p_description),
    unit_value_cents = p_unit_value_cents, acquired_on = p_acquired_on, origin = coalesce(p_origin, 'nao_informada'),
    supplier = public.inventory_clean(p_supplier), invoice = public.inventory_clean(p_invoice), notes = public.inventory_clean(p_notes), updated_at = now()
  where id = unit.id;
  perform public.inventory_log(unit.group_id, 'edicao', unit.material_id, null, unit.id, null, null, null, null, null, null, null,
    jsonb_build_object('action', 'unit_updated', 'before', to_jsonb(unit) - 'group_id' - 'created_at' - 'updated_at'));
end;
$$;

-- Próxima etiqueta livre da família (sugestão na tela de etiquetar).
create or replace function public.inventory_next_tag(p_family_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare fam public.inventory_families; last_number integer;
begin
  select * into fam from public.inventory_families where id = p_family_id;
  if fam.id is null or not public.is_group_member(fam.group_id) then raise exception 'Família não encontrada'; end if;
  if fam.code is null then return null; end if;
  select max(substr(tag, 10, 4)::integer) into last_number from public.inventory_units where group_id = fam.group_id and tag like 'GEAS-' || fam.code || '-%';
  return 'GEAS-' || fam.code || '-' || lpad((coalesce(last_number, 0) + 1)::text, 4, '0');
end;
$$;

-- Permissões das funções -----------------------------------------------------------------------
-- Auxiliares internas: só chamadas por outras funções security definer.
revoke all on function public.inventory_log(uuid, public.inventory_movement_kind, uuid, uuid, uuid, integer, uuid, uuid, public.inventory_condition, public.inventory_condition, public.inventory_write_off_reason, text, jsonb) from public, anon, authenticated;
revoke all on function public.inventory_check_location(uuid, uuid) from public, anon, authenticated;
revoke all on function public.inventory_check_tag(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.inventory_split_lot(public.inventory_lots, integer, uuid, public.inventory_condition) from public, anon, authenticated;
revoke all on function public.inventory_lock_lot(uuid) from public, anon, authenticated;
revoke all on function public.inventory_lock_unit(uuid) from public, anon, authenticated;

revoke all on function public.admin_change_inventory_role(uuid, uuid, public.inventory_role) from public, anon;
revoke all on function public.inventory_save_location(uuid, uuid, uuid, text, text, boolean) from public, anon;
revoke all on function public.inventory_save_family(uuid, uuid, text, text, boolean) from public, anon;
revoke all on function public.inventory_save_material(uuid, uuid, uuid, text, public.inventory_tracking, boolean, integer, text, boolean) from public, anon;
revoke all on function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text) from public, anon;
revoke all on function public.inventory_add_unit(uuid, uuid, text, text, text, public.inventory_condition, bigint, date, public.inventory_origin, text, text, text) from public, anon;
revoke all on function public.inventory_transfer_lot(uuid, uuid, integer, text) from public, anon;
revoke all on function public.inventory_transfer_unit(uuid, uuid, text) from public, anon;
revoke all on function public.inventory_set_lot_condition(uuid, public.inventory_condition, integer, text) from public, anon;
revoke all on function public.inventory_set_unit_condition(uuid, public.inventory_condition, text) from public, anon;
revoke all on function public.inventory_adjust_lot(uuid, integer, text) from public, anon;
revoke all on function public.inventory_write_off_lot(uuid, integer, public.inventory_write_off_reason, text) from public, anon;
revoke all on function public.inventory_write_off_unit(uuid, public.inventory_write_off_reason, text) from public, anon;
revoke all on function public.inventory_update_lot(uuid, bigint, date, date, public.inventory_origin, text, text, text) from public, anon;
revoke all on function public.inventory_update_unit(uuid, text, text, text, bigint, date, public.inventory_origin, text, text, text) from public, anon;
revoke all on function public.inventory_next_tag(uuid) from public, anon;

grant execute on function public.admin_change_inventory_role(uuid, uuid, public.inventory_role) to authenticated;
grant execute on function public.inventory_save_location(uuid, uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.inventory_save_family(uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.inventory_save_material(uuid, uuid, uuid, text, public.inventory_tracking, boolean, integer, text, boolean) to authenticated;
grant execute on function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text) to authenticated;
grant execute on function public.inventory_add_unit(uuid, uuid, text, text, text, public.inventory_condition, bigint, date, public.inventory_origin, text, text, text) to authenticated;
grant execute on function public.inventory_transfer_lot(uuid, uuid, integer, text) to authenticated;
grant execute on function public.inventory_transfer_unit(uuid, uuid, text) to authenticated;
grant execute on function public.inventory_set_lot_condition(uuid, public.inventory_condition, integer, text) to authenticated;
grant execute on function public.inventory_set_unit_condition(uuid, public.inventory_condition, text) to authenticated;
grant execute on function public.inventory_adjust_lot(uuid, integer, text) to authenticated;
grant execute on function public.inventory_write_off_lot(uuid, integer, public.inventory_write_off_reason, text) to authenticated;
grant execute on function public.inventory_write_off_unit(uuid, public.inventory_write_off_reason, text) to authenticated;
grant execute on function public.inventory_update_lot(uuid, bigint, date, date, public.inventory_origin, text, text, text) to authenticated;
grant execute on function public.inventory_update_unit(uuid, text, text, text, bigint, date, public.inventory_origin, text, text, text) to authenticated;
grant execute on function public.inventory_next_tag(uuid) to authenticated;
