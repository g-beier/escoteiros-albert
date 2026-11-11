-- Realizado anual: soma dos rateios por rubrica e mês, para a planilha "Realizado {ano}".
-- security invoker: as políticas RLS de entry_splits/ledger_entries continuam valendo.
create or replace function public.realized_by_month(p_group_id uuid, p_year int)
returns table (category_id uuid, month int, amount_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select s.category_id, extract(month from e.entry_date)::int as month, sum(s.amount_cents)::bigint as amount_cents
  from public.entry_splits s
  join public.ledger_entries e on e.id = s.entry_id
  where e.group_id = p_group_id
    and e.entry_date >= make_date(p_year, 1, 1)
    and e.entry_date < make_date(p_year + 1, 1, 1)
  group by s.category_id, extract(month from e.entry_date);
$$;
revoke all on function public.realized_by_month(uuid, int) from public, anon;
grant execute on function public.realized_by_month(uuid, int) to authenticated;
