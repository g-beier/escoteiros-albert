-- Permite filtrar, na visão por extrato, lançamentos com algum rateio sem associado.
create or replace view public.ledger_entry_rows with (security_invoker = true) as
select
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.name,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents,
  e.created_at,
  count(s.id)::int as split_count,
  coalesce(array_agg(distinct s.category_id) filter (where s.category_id is not null), '{}') as category_ids,
  coalesce(array_agg(distinct s.associate_id) filter (where s.associate_id is not null), '{}') as associate_ids,
  e.name || ' ' || coalesce(string_agg(s.description, ' '), '') as search_text,
  coalesce(bool_or(s.associate_id is null), false) as has_split_without_associate
from public.ledger_entries e
join public.payment_methods pm on pm.id = e.payment_method_id
left join public.entry_splits s on s.entry_id = e.id
group by e.id, pm.name;
