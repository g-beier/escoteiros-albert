-- Busca das listas de lançamentos acha também o nome do associado dos rateios (Movimentações: todos os associados
-- do lançamento; Detalhamento: o do rateio). Mesmas colunas e ordem de 017; só muda search_text.

create or replace view public.ledger_entry_rows with (security_invoker = true) as
select
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.created_at,
  e.name,
  e.account_id,
  acc.name as account_name,
  acc.ledger_code as account_ledger_code,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents,
  count(s.id)::int as split_count,
  coalesce(array_agg(distinct s.category_id) filter (where s.category_id is not null), '{}') as category_ids,
  coalesce(array_agg(distinct s.associate_id) filter (where s.associate_id is not null), '{}') as associate_ids,
  coalesce(bool_or(s.associate_id is null), false) as has_split_without_associate,
  x.external_ids,
  exists (select 1 from public.reconciliation_links rl where rl.ledger_entry_id = e.id) as reconciled,
  e.outside_statement,
  concat_ws(' ', e.name, string_agg(s.description, ' '), array_to_string(x.external_ids, ' '), e.notes, string_agg(distinct a.name, ' ')) as search_text
from public.ledger_entries e
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
left join public.entry_splits s on s.entry_id = e.id
left join public.associates a on a.id = s.associate_id
cross join lateral (select public.entry_external_ids(e.id) as external_ids) x
group by e.id, pm.name, acc.name, acc.ledger_code, x.external_ids;

create or replace view public.entry_split_rows with (security_invoker = true) as
select
  s.id as split_id,
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.name as entry_name,
  e.account_id,
  acc.name as account_name,
  acc.ledger_code as account_ledger_code,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents as entry_total_cents,
  s.amount_cents,
  s.description,
  s.category_id,
  c.code as category_code,
  c.name as category_name,
  c.kind as category_kind,
  c.ledger_code as category_ledger_code,
  s.associate_id,
  a.name as associate_name,
  x.external_ids,
  exists (select 1 from public.reconciliation_links rl where rl.ledger_entry_id = e.id) as reconciled,
  e.outside_statement,
  concat_ws(' ', e.name, s.description, array_to_string(x.external_ids, ' '), e.notes, a.name) as search_text
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id
cross join lateral (select public.entry_external_ids(e.id) as external_ids) x;
