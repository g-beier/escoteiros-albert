-- Inventário: revisão dos movimentos (passo 3). Dois status: "Para revisar" e "Revisado". Não há recusa: se o
-- movimento estiver errado, o gestor conversa com quem registrou e corrige com um movimento normal (que já nasce
-- revisado), marcando o original como revisado com uma nota.
--
-- Origem do movimento (channel): 'web' (telas normais) ou 'rapido' (telas de celular, /inventario/rapido). O que
-- vem do registro rápido fica sempre para revisar, mesmo quando quem registra é gestor ou administrador. A origem
-- chega ao inventory_log pelo setting de transação `inventory.channel` (ver inventory_quick, 045); o setting só
-- torna o fluxo mais restritivo, nunca dispensa a revisão.

-- Status: pendente → para_revisar (o antigo para_revisar, de recusa, nunca foi gravado) -------------------
drop index public.inventory_movements_review_idx;
alter type public.inventory_review_status rename to inventory_review_status_old;
create type public.inventory_review_status as enum ('para_revisar', 'revisado');
alter table public.inventory_movements alter column review_status type public.inventory_review_status
  using (case when review_status::text = 'revisado' then 'revisado' else 'para_revisar' end)::public.inventory_review_status;
drop type public.inventory_review_status_old;
create index inventory_movements_review_idx on public.inventory_movements(group_id, review_status) where review_status = 'para_revisar';

alter table public.inventory_movements
  add column review_notes text check (char_length(review_notes) <= 500),
  add column channel text not null default 'web' check (channel in ('web', 'rapido'));

-- Registro do movimento: revisado só quando quem registra é gestor e não veio do registro rápido. ---------------
create or replace function public.inventory_log(
  p_group_id uuid, p_kind public.inventory_movement_kind, p_material_id uuid, p_lot_id uuid, p_unit_id uuid,
  p_quantity integer, p_from_location uuid, p_to_location uuid, p_from_condition public.inventory_condition,
  p_to_condition public.inventory_condition, p_reason public.inventory_write_off_reason, p_notes text, p_details jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  new_id bigint;
  source text := case when current_setting('inventory.channel', true) = 'rapido' then 'rapido' else 'web' end;
  reviewed boolean := source = 'web' and public.can_manage_inventory(p_group_id);
begin
  insert into public.inventory_movements(group_id, kind, material_id, lot_id, unit_id, quantity, from_location_id, to_location_id,
    from_condition, to_condition, write_off_reason, notes, details, review_status, reviewed_by, reviewed_at, created_by, channel)
  values (p_group_id, p_kind, p_material_id, p_lot_id, p_unit_id, p_quantity, p_from_location, p_to_location,
    p_from_condition, p_to_condition, p_reason, public.inventory_clean(p_notes), coalesce(p_details, '{}'::jsonb),
    case when reviewed then 'revisado'::public.inventory_review_status else 'para_revisar' end,
    case when reviewed then auth.uid() end, case when reviewed then now() end, auth.uid(), source)
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'inventory.' || p_kind, case when p_unit_id is not null then 'inventory_unit' when p_lot_id is not null then 'inventory_lot' else 'inventory_material' end,
    coalesce(p_unit_id, p_lot_id, p_material_id)::text, jsonb_build_object('movement_id', new_id, 'channel', source) || coalesce(p_details, '{}'::jsonb));
  return new_id;
end;
$$;

-- Revisão pelo gestor (inclusive dos próprios movimentos do registro rápido). ------------------------------------
-- Marca como revisados os movimentos do grupo que estão para revisar; ids de outro grupo ou já revisados são
-- ignorados. Devolve quantos foram marcados.
create or replace function public.inventory_review_movements(p_group_id uuid, p_ids bigint[], p_notes text)
returns integer language plpgsql security definer set search_path = '' as $$
declare note text := public.inventory_clean(p_notes); marked integer;
begin
  if not public.can_manage_inventory(p_group_id) then raise exception 'Apenas o gestor do inventário revisa movimentos'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Escolha os movimentos a revisar'; end if;
  if char_length(note) > 500 then raise exception 'Nota muito longa (máximo 500 caracteres)'; end if;
  with done as (
    update public.inventory_movements set review_status = 'revisado', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = note
    where group_id = p_group_id and id = any(p_ids) and review_status = 'para_revisar'
    returning id, kind, material_id, created_by, channel
  ), logged as (
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    select p_group_id, auth.uid(), 'inventory.reviewed', 'inventory_movement', done.id::text,
      jsonb_build_object('kind', done.kind, 'material_id', done.material_id, 'created_by', done.created_by, 'channel', done.channel, 'notes', note)
    from done
    returning 1
  )
  select count(*)::int into marked from logged;
  return marked;
end;
$$;

revoke all on function public.inventory_review_movements(uuid, bigint[], text) from public, anon;
grant execute on function public.inventory_review_movements(uuid, bigint[], text) to authenticated;
