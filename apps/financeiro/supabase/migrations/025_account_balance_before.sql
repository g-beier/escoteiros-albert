-- Saldo da conta calculado no sistema numa data, para conferir com o saldo inicial do extrato OFX
-- na importação: saldo inicial da conta + lançamentos da conta a partir da data do saldo inicial
-- e antes de p_date. Só leitura: security invoker, então valem as políticas de leitura (membros do grupo).

create function public.account_balance_before(p_account_id uuid, p_date date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  acc record;
  movements bigint;
  entry_count int;
begin
  if p_date is null then raise exception 'Informe a data'; end if;
  select id, opening_balance_cents, opening_date into acc from public.accounts where id = p_account_id;
  if acc.id is null then raise exception 'Conta não encontrada'; end if;

  -- O saldo inicial vale no começo de opening_date; antes dela o sistema não sabe o saldo.
  if acc.opening_date is not null and p_date < acc.opening_date then
    return jsonb_build_object('date', p_date, 'opening_balance_cents', acc.opening_balance_cents, 'opening_date', acc.opening_date,
      'before_opening', true, 'movements_cents', null, 'entry_count', null, 'balance_cents', null);
  end if;

  select coalesce(sum(e.total_cents), 0), count(*) into movements, entry_count
  from public.ledger_entries e
  where e.account_id = p_account_id and e.entry_date < p_date
    and (acc.opening_date is null or e.entry_date >= acc.opening_date);

  return jsonb_build_object('date', p_date, 'opening_balance_cents', acc.opening_balance_cents, 'opening_date', acc.opening_date,
    'before_opening', false, 'movements_cents', movements, 'entry_count', entry_count,
    'balance_cents', acc.opening_balance_cents + movements);
end;
$$;

revoke all on function public.account_balance_before(uuid, date) from public, anon;
grant execute on function public.account_balance_before(uuid, date) to authenticated;
