-- Entradas, saídas (evasão, transferência…) e retornos de associados. Na grade de mensalidades, os meses em que o
-- associado está fora do grupo não são cobrados nem ficam atrasados; quem não tem mês no grupo no ano fica oculto.
-- Sem movimentações, o associado vale como no grupo o tempo todo.

create type public.associate_movement_kind as enum ('entrada', 'saida');

create table public.associate_movements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  movement_date date not null,
  kind public.associate_movement_kind not null,
  reason text check (char_length(reason) <= 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index associate_movements_associate_idx on public.associate_movements(associate_id, movement_date);
create index associate_movements_group_idx on public.associate_movements(group_id);
alter table public.associate_movements enable row level security;
create policy "members read associate movements" on public.associate_movements for select using (public.is_group_member(group_id));

create function public.add_associate_movement(p_associate_id uuid, p_date date, p_kind public.associate_movement_kind, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare associate_group uuid; new_id uuid;
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_date is null or p_kind is null then raise exception 'Informe a data e o tipo'; end if;
  if char_length(trim(p_reason)) > 120 then raise exception 'Motivo: no máximo 120 caracteres'; end if;
  insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
  values (associate_group, p_associate_id, p_date, p_kind, nullif(trim(p_reason), ''), auth.uid())
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'associate.movement_added', 'associate', p_associate_id::text,
    jsonb_build_object('date', p_date, 'kind', p_kind, 'reason', nullif(trim(p_reason), '')));
  return new_id;
end;
$$;

create function public.delete_associate_movement(p_movement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare movement public.associate_movements%rowtype;
begin
  select * into movement from public.associate_movements where id = p_movement_id for update;
  if movement.id is null or not public.can_edit_group(movement.group_id) then raise exception 'Movimentação não encontrada ou sem permissão'; end if;
  delete from public.associate_movements where id = p_movement_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (movement.group_id, auth.uid(), 'associate.movement_removed', 'associate', movement.associate_id::text,
    jsonb_build_object('date', movement.movement_date, 'kind', movement.kind, 'reason', movement.reason));
end;
$$;

revoke all on function public.add_associate_movement(uuid, date, public.associate_movement_kind, text) from public;
revoke all on function public.delete_associate_movement(uuid) from public;
grant execute on function public.add_associate_movement(uuid, date, public.associate_movement_kind, text) to authenticated;
grant execute on function public.delete_associate_movement(uuid) to authenticated;
