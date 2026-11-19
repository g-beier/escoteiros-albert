-- Inventário: busca ampliada na lista de Materiais. Além do nome, a busca olha a descrição, a família (nome e código),
-- a observação e o fornecedor dos lotes com saldo e a etiqueta, o código antigo, a descrição e a observação das peças
-- não baixadas (a coluna Categoria da planilha da Alcateia está na observação dos lotes). Sem acento e em minúsculas:
-- a tela normaliza o termo do mesmo jeito (lib/inventory/search.ts).

create or replace function public.inventory_search_normalize(p_text text)
returns text language sql immutable set search_path = '' as $$
  select lower(translate(coalesce(p_text, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;

-- Mesmas colunas de 032, mais search_text no fim.
create or replace view public.inventory_material_rows with (security_invoker = true) as
select m.id, m.group_id, m.name, m.tracking, m.consumable, m.minimum_quantity, m.description, m.active,
  m.family_id, f.name as family_name, f.code as family_code,
  case when m.tracking = 'lot' then coalesce(l.quantity, 0) else coalesce(u.quantity, 0) end as quantity,
  coalesce(l.lots, 0) as lots,
  coalesce(l.value_cents, 0) + coalesce(u.value_cents, 0) as estimated_value_cents,
  l.next_expiry,
  m.minimum_quantity is not null and coalesce(l.quantity, 0) + coalesce(u.quantity, 0) < m.minimum_quantity as below_minimum,
  m.updated_at,
  public.inventory_search_normalize(concat_ws(' ', m.name, m.description, f.name, f.code, l.search_text, u.search_text)) as search_text
from public.inventory_materials m
left join public.inventory_families f on f.id = m.family_id
left join lateral (
  select sum(quantity)::int as quantity, count(*) filter (where quantity > 0)::int as lots,
    sum(quantity * coalesce(unit_value_cents, 0))::bigint as value_cents,
    min(expires_on) filter (where quantity > 0) as next_expiry,
    string_agg(concat_ws(' ', notes, supplier), ' ') filter (where quantity > 0) as search_text
  from public.inventory_lots where material_id = m.id
) l on true
left join lateral (
  select count(*)::int as quantity, sum(coalesce(unit_value_cents, 0))::bigint as value_cents,
    string_agg(concat_ws(' ', tag, legacy_code, description, notes), ' ') as search_text
  from public.inventory_units where material_id = m.id and written_off_at is null
) u on true;
