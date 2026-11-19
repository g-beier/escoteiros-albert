-- Inventário: estado (condição) e valor unitário por material e divisão, para a lista de Materiais
-- (colunas Estado e Valor unitário, filtros por estado e por faixa de valor unitário).
-- Mesmas colunas de 033, mais:
--   worst_condition  pior condição entre lotes com saldo e peças não baixadas
--                    (novo < bom < regular < manutencao < ruim < inservivel; null se nenhuma tem condição);
--   conditions       quantidade por condição ({"bom": 7, "ruim": 2}); sem condição fica de fora;
--   min_unit_cents / max_unit_cents  faixa do valor unitário (lotes e peças sem valor ficam de fora).

create or replace function public.inventory_condition_rank(c public.inventory_condition)
returns int language sql immutable set search_path = '' as $$
  select case c when 'novo' then 1 when 'bom' then 2 when 'regular' then 3 when 'manutencao' then 4 when 'ruim' then 5 when 'inservivel' then 6 end
$$;

create or replace view public.inventory_stock_by_location with (security_invoker = true) as
with stock as (
  select group_id, material_id, location_id, quantity, quantity * coalesce(unit_value_cents, 0) as value_cents, expires_on,
    condition, unit_value_cents
  from public.inventory_lots where quantity > 0
  union all
  select group_id, material_id, location_id, 1, coalesce(unit_value_cents, 0), null::date, condition, unit_value_cents
  from public.inventory_units where written_off_at is null
),
by_condition as (
  select group_id, material_id, location_id, jsonb_object_agg(condition, quantity) as conditions
  from (
    select group_id, material_id, location_id, condition, sum(quantity)::int as quantity
    from stock where condition is not null
    group by group_id, material_id, location_id, condition
  ) c
  group by group_id, material_id, location_id
)
select s.group_id, s.material_id, s.location_id,
  sum(s.quantity)::int as quantity,
  sum(s.value_cents)::bigint as value_cents,
  min(s.expires_on) as next_expiry,
  (array_agg(s.condition order by public.inventory_condition_rank(s.condition) desc nulls last))[1] as worst_condition,
  coalesce(c.conditions, '{}'::jsonb) as conditions,
  min(s.unit_value_cents)::bigint as min_unit_cents,
  max(s.unit_value_cents)::bigint as max_unit_cents
from stock s
left join by_condition c using (group_id, material_id, location_id)
group by s.group_id, s.material_id, s.location_id, c.conditions;
