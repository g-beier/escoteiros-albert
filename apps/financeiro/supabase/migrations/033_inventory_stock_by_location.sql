-- Inventário: estoque de cada material em cada divisão (lista de Materiais por local).
-- Lotes com saldo e peças não baixadas; a validade é a mais próxima entre os lotes da divisão.

create or replace view public.inventory_stock_by_location with (security_invoker = true) as
select group_id, material_id, location_id,
  sum(quantity)::int as quantity,
  sum(value_cents)::bigint as value_cents,
  min(expires_on) as next_expiry
from (
  select group_id, material_id, location_id, quantity, quantity * coalesce(unit_value_cents, 0) as value_cents, expires_on
  from public.inventory_lots where quantity > 0
  union all
  select group_id, material_id, location_id, 1, coalesce(unit_value_cents, 0), null::date
  from public.inventory_units where written_off_at is null
) stock
group by group_id, material_id, location_id;
