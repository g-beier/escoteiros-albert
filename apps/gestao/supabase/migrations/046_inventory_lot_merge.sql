-- Inventário: lotes iguais se juntam. Um lote é o material numa divisão com a mesma condição, validade e variação
-- ("modelo antigo", "versão 2019"): comprar mais do mesmo item soma no lote que já existe, em vez de criar outro.
-- Transferência e mudança de condição também somam num lote igual no destino. Ao somar, o valor unitário vira a
-- média ponderada (o desconhecido não entra na conta); origem, fornecedor, NF, data e observação da entrada ficam no
-- movimento, e o lote mantém os dados da primeira entrada.

alter table public.inventory_lots add column variant text check (char_length(variant) <= 80);

-- Lotes já existentes idênticos (mesma chave, mesmo valor e mesma observação): soma no mais antigo, os movimentos
-- passam a apontar para ele e os demais são apagados. Lotes que diferem em valor ou observação ficam separados.
create temporary table lot_merge on commit drop as
select id, quantity, first_value(id) over w as keep_id, row_number() over w as n
from public.inventory_lots
window w as (partition by group_id, material_id, location_id, condition, expires_on, variant, unit_value_cents, notes order by created_at, id);

update public.inventory_movements mv set lot_id = r.keep_id from lot_merge r where r.n > 1 and mv.lot_id = r.id;
update public.inventory_lots l set quantity = t.quantity, updated_at = now()
from (select keep_id, sum(quantity)::int as quantity from lot_merge group by keep_id having count(*) > 1) t where l.id = t.keep_id;
delete from public.inventory_lots l using lot_merge r where l.id = r.id and r.n > 1;

-- Lote igual ao pedido (mesma chave), travado; o com saldo primeiro.
create or replace function public.inventory_matching_lot(
  p_material_id uuid, p_location_id uuid, p_condition public.inventory_condition, p_expires_on date, p_variant text, p_except uuid
) returns public.inventory_lots language sql security definer set search_path = '' as $$
  select * from public.inventory_lots
  where material_id = p_material_id and location_id = p_location_id and condition is not distinct from p_condition
    and expires_on is not distinct from p_expires_on and variant is not distinct from public.inventory_clean(p_variant)
    and id is distinct from p_except
  order by quantity desc, created_at
  limit 1
  for update;
$$;

-- Valor unitário depois de somar: média ponderada; se um dos lados não tem valor, fica o outro.
create or replace function public.inventory_merged_value(p_value bigint, p_quantity integer, p_added_value bigint, p_added integer)
returns bigint language sql immutable set search_path = '' as $$
  select case
    when p_added_value is null then p_value
    when p_value is null or p_quantity <= 0 then p_added_value
    else round((p_value * p_quantity + p_added_value * p_added)::numeric / (p_quantity + p_added))::bigint
  end;
$$;

-- Entrada: soma num lote igual ou cria um. --------------------------------------------------------------------
drop function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text);
create function public.inventory_add_lot(
  p_material_id uuid, p_location_id uuid, p_quantity integer, p_condition public.inventory_condition,
  p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin,
  p_supplier text, p_invoice text, p_notes text, p_variant text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.inventory_materials; target public.inventory_lots; result uuid; merged boolean := false;
begin
  select * into m from public.inventory_materials where id = p_material_id;
  if m.id is null or not public.can_edit_inventory(m.group_id) then raise exception 'Material não encontrado ou sem permissão'; end if;
  if m.tracking <> 'lot' then raise exception 'Este material é controlado por peça: cadastre as peças'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'A quantidade deve ser positiva'; end if;
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  perform public.inventory_check_location(m.group_id, p_location_id);
  target := public.inventory_matching_lot(m.id, p_location_id, p_condition, p_expires_on, p_variant, null);
  if target.id is not null then
    update public.inventory_lots set quantity = quantity + p_quantity,
      unit_value_cents = public.inventory_merged_value(unit_value_cents, quantity, p_unit_value_cents, p_quantity), updated_at = now()
    where id = target.id;
    result := target.id; merged := true;
  else
    insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes, variant)
    values (m.group_id, m.id, p_location_id, p_quantity, p_condition, p_unit_value_cents, p_expires_on, p_acquired_on, coalesce(p_origin, 'nao_informada'),
      public.inventory_clean(p_supplier), public.inventory_clean(p_invoice), public.inventory_clean(p_notes), public.inventory_clean(p_variant))
    returning id into result;
  end if;
  perform public.inventory_log(m.group_id, 'entrada', m.id, result, null, p_quantity, null, p_location_id, null, p_condition, null, p_notes,
    jsonb_strip_nulls(jsonb_build_object('origin', coalesce(p_origin, 'nao_informada'), 'unit_value_cents', p_unit_value_cents, 'expires_on', p_expires_on,
      'acquired_on', p_acquired_on, 'supplier', public.inventory_clean(p_supplier), 'invoice', public.inventory_clean(p_invoice),
      'variant', public.inventory_clean(p_variant), 'merged', merged,
      'from', case when merged then target.quantity end, 'to', case when merged then target.quantity + p_quantity end)));
  return result;
end;
$$;

-- Parte (ou todo) de um lote vai para outra divisão/condição: soma num lote igual lá, muda o lote inteiro de lugar,
-- ou separa um lote novo com os mesmos dados. Devolve o lote de destino.
create or replace function public.inventory_split_lot(p_lot public.inventory_lots, p_quantity integer, p_location_id uuid, p_condition public.inventory_condition)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.inventory_lots; new_id uuid;
begin
  target := public.inventory_matching_lot(p_lot.material_id, p_location_id, p_condition, p_lot.expires_on, p_lot.variant, p_lot.id);
  if target.id is not null then
    update public.inventory_lots set quantity = quantity - p_quantity, updated_at = now() where id = p_lot.id;
    update public.inventory_lots set quantity = quantity + p_quantity,
      unit_value_cents = public.inventory_merged_value(unit_value_cents, quantity, p_lot.unit_value_cents, p_quantity), updated_at = now()
    where id = target.id;
    return target.id;
  end if;
  if p_quantity = p_lot.quantity then
    update public.inventory_lots set location_id = p_location_id, condition = p_condition, updated_at = now() where id = p_lot.id;
    return p_lot.id;
  end if;
  update public.inventory_lots set quantity = quantity - p_quantity, updated_at = now() where id = p_lot.id;
  insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes, variant)
  values (p_lot.group_id, p_lot.material_id, p_location_id, p_quantity, p_condition, p_lot.unit_value_cents, p_lot.expires_on, p_lot.acquired_on, p_lot.origin,
    p_lot.supplier, p_lot.invoice, p_lot.notes, p_lot.variant)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.inventory_transfer_lot(p_lot_id uuid, p_to_location_id uuid, p_quantity integer, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity); target uuid;
begin
  perform public.inventory_check_location(lot.group_id, p_to_location_id);
  if p_to_location_id = lot.location_id then raise exception 'O lote já está nesta divisão'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  target := public.inventory_split_lot(lot, qty, p_to_location_id, lot.condition);
  perform public.inventory_log(lot.group_id, 'transferencia', lot.material_id, target, null, qty, lot.location_id, p_to_location_id, null, null, null, p_notes,
    jsonb_build_object('source_lot_id', lot.id));
  return target;
end;
$$;

create or replace function public.inventory_set_lot_condition(p_lot_id uuid, p_condition public.inventory_condition, p_quantity integer, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id); qty integer := coalesce(p_quantity, lot.quantity); target uuid;
begin
  if p_condition is not distinct from lot.condition then raise exception 'O lote já está nesta condição'; end if;
  if qty <= 0 or qty > lot.quantity then raise exception 'Quantidade inválida: o lote tem %', lot.quantity; end if;
  target := public.inventory_split_lot(lot, qty, lot.location_id, p_condition);
  perform public.inventory_log(lot.group_id, 'condicao', lot.material_id, target, null, qty, null, null, lot.condition, p_condition, null, p_notes,
    jsonb_build_object('source_lot_id', lot.id));
  return target;
end;
$$;

-- Edição dos dados do lote, agora com a variação. ----------------------------------------------------------------
drop function public.inventory_update_lot(uuid, bigint, date, date, public.inventory_origin, text, text, text);
create function public.inventory_update_lot(
  p_lot_id uuid, p_unit_value_cents bigint, p_expires_on date, p_acquired_on date, p_origin public.inventory_origin,
  p_supplier text, p_invoice text, p_notes text, p_variant text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare lot public.inventory_lots := public.inventory_lock_lot(p_lot_id);
begin
  if p_unit_value_cents is not null and p_unit_value_cents < 0 then raise exception 'O valor não pode ser negativo'; end if;
  update public.inventory_lots set unit_value_cents = p_unit_value_cents, expires_on = p_expires_on, acquired_on = p_acquired_on,
    origin = coalesce(p_origin, 'nao_informada'), supplier = public.inventory_clean(p_supplier), invoice = public.inventory_clean(p_invoice),
    notes = public.inventory_clean(p_notes), variant = public.inventory_clean(p_variant), updated_at = now()
  where id = lot.id;
  perform public.inventory_log(lot.group_id, 'edicao', lot.material_id, lot.id, null, null, null, null, null, null, null, null,
    jsonb_build_object('action', 'lot_updated', 'before', to_jsonb(lot) - 'group_id' - 'created_at' - 'updated_at'));
end;
$$;

-- Registro rápido (045): a entrada passa a variação.
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
        coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes', a->>'variant');
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
          coalesce((a->>'origin')::public.inventory_origin, 'nao_informada'), null, null, a->>'notes', a->>'variant');
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

revoke all on function public.inventory_matching_lot(uuid, uuid, public.inventory_condition, date, text, uuid) from public, anon, authenticated;
revoke all on function public.inventory_merged_value(bigint, integer, bigint, integer) from public, anon, authenticated;
revoke all on function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text, text) from public, anon;
revoke all on function public.inventory_update_lot(uuid, bigint, date, date, public.inventory_origin, text, text, text, text) from public, anon;
grant execute on function public.inventory_add_lot(uuid, uuid, integer, public.inventory_condition, bigint, date, date, public.inventory_origin, text, text, text, text) to authenticated;
grant execute on function public.inventory_update_lot(uuid, bigint, date, date, public.inventory_origin, text, text, text, text) to authenticated;
