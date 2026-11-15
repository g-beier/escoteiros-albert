-- Devedores: cada vínculo dívida ↔ lançamento guarda quanto do lançamento vai para aquela dívida (alocação).
-- Antes (038) o pago de cada dívida era toda a receita do associado no lançamento, e um lançamento só pagava uma
-- dívida do associado. Agora um lançamento reparte a receita do associado entre várias dívidas dele:
--   soma alocada do lançamento nas dívidas do associado ≤ debt_payment_cents(lançamento, associado);
--   soma alocada numa dívida ≤ valor da dívida.

alter table public.debt_payments add column amount_cents bigint;

-- Vínculos antigos: cada lançamento cobre as dívidas ligadas a ele da mais antiga para a mais nova, até o que
-- falta em cada uma; o que não couber some.
do $$
declare pair record; link record; available bigint; owed bigint; give bigint;
begin
  for pair in
    select distinct p.entry_id, d.associate_id, e.entry_date from public.debt_payments p
    join public.debts d on d.id = p.debt_id join public.ledger_entries e on e.id = p.entry_id
    order by e.entry_date, p.entry_id
  loop
    available := public.debt_payment_cents(pair.entry_id, pair.associate_id);
    for link in
      select p.debt_id, d.amount_cents from public.debt_payments p join public.debts d on d.id = p.debt_id
      where p.entry_id = pair.entry_id and d.associate_id = pair.associate_id order by d.debt_date, d.created_at, d.id
    loop
      owed := link.amount_cents - coalesce((select sum(amount_cents) from public.debt_payments where debt_id = link.debt_id), 0);
      give := greatest(least(owed, available), 0);
      update public.debt_payments set amount_cents = give where debt_id = link.debt_id and entry_id = pair.entry_id;
      available := available - give;
    end loop;
  end loop;
end $$;
delete from public.debt_payments where amount_cents is null or amount_cents <= 0;
alter table public.debt_payments alter column amount_cents set not null, add constraint debt_payments_amount_positive check (amount_cents > 0);

-- "R$ 1234,56" para mensagens de erro.
create function public.debt_money(p_cents bigint)
returns text language sql immutable set search_path = '' as $$
  select 'R$ ' || (p_cents / 100)::text || ',' || lpad((abs(p_cents) % 100)::text, 2, '0');
$$;
revoke all on function public.debt_money(bigint) from public, anon, authenticated;

-- Confere os limites depois de uma escrita: dívidas não recebem mais que o valor; lançamentos não dão mais que a receita
-- do associado neles. Só olha os lançamentos e dívidas tocados (um lançamento editado depois não trava o resto).
create function public.check_debt_allocations(p_associate_id uuid, p_entry_ids uuid[], p_debt_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare bad record;
begin
  select d.description, d.amount_cents, sum(p.amount_cents) as allocated into bad
  from public.debts d join public.debt_payments p on p.debt_id = d.id
  where d.id = any(p_debt_ids) group by d.id having sum(p.amount_cents) > d.amount_cents limit 1;
  if found then
    raise exception 'Os pagamentos de "%" (%) passam do valor da dívida (%)', bad.description, public.debt_money(bad.allocated::bigint), public.debt_money(bad.amount_cents);
  end if;
  select e.entry_date, e.name, public.debt_payment_cents(e.id, p_associate_id) as available, sum(p.amount_cents) as allocated into bad
  from public.ledger_entries e join public.debt_payments p on p.entry_id = e.id join public.debts d on d.id = p.debt_id and d.associate_id = p_associate_id
  where e.id = any(p_entry_ids) group by e.id having sum(p.amount_cents) > public.debt_payment_cents(e.id, p_associate_id) limit 1;
  if found then
    raise exception 'O lançamento % de % tem % do associado e já foram usados %', bad.name, to_char(bad.entry_date, 'DD/MM/YYYY'),
      public.debt_money(bad.available::bigint), public.debt_money(bad.allocated::bigint);
  end if;
end;
$$;
revoke all on function public.check_debt_allocations(uuid, uuid[], uuid[]) from public, anon, authenticated;

create or replace function public.debt_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('associate_id', d.associate_id, 'debt_date', d.debt_date, 'amount_cents', d.amount_cents,
    'description', d.description, 'agreement', d.agreement,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('entry_id', p.entry_id, 'amount_cents', p.amount_cents) order by p.entry_id)
      from public.debt_payments p where p.debt_id = d.id), '[]'::jsonb))
  from public.debts d where d.id = p_id;
$$;

/*
  Leitura para todos os membros (consulta: sem associado nem lançamentos). O pago é a soma das alocações; se um
  lançamento foi editado e o associado ficou com menos receita nele do que o alocado, vale só o que cabe (pelas
  dívidas mais antigas primeiro) e payment_mismatch avisa a tesouraria.
*/
drop function public.debt_rows(uuid);
create function public.debt_rows(p_group_id uuid)
returns table (
  id uuid, debt_date date, amount_cents bigint, paid_cents bigint, description text, agreement text,
  associate_id uuid, associate_name text, debtor_number integer, payments jsonb, payment_mismatch boolean, updated_at timestamptz
) language sql stable security definer set search_path = '' as $$
  with access as (select public.is_group_member(p_group_id) as member, public.can_edit_group(p_group_id) as editor),
  debtors as (
    select associate_id, dense_rank() over (order by min(created_at), min(debt_date), associate_id)::integer as debtor_number
    from public.debts where group_id = p_group_id group by associate_id
  ),
  alloc as (
    select p.debt_id, p.entry_id, p.amount_cents, public.debt_payment_cents(p.entry_id, d.associate_id) as available,
      sum(p.amount_cents) over (partition by p.entry_id, d.associate_id order by d.debt_date, d.created_at, d.id rows unbounded preceding) as running,
      sum(p.amount_cents) over (partition by p.entry_id, d.associate_id) as entry_allocated
    from public.debt_payments p join public.debts d on d.id = p.debt_id where d.group_id = p_group_id
  ),
  effective as (select *, greatest(0, least(amount_cents, available - (running - amount_cents)))::bigint as paid from alloc)
  select d.id, d.debt_date, d.amount_cents,
    coalesce((select sum(x.paid) from effective x where x.debt_id = d.id), 0)::bigint,
    d.description, d.agreement,
    case when access.editor then d.associate_id end,
    case when access.editor then a.name end,
    debtors.debtor_number,
    case when access.editor then coalesce((
      select jsonb_agg(jsonb_build_object('entryId', e.id, 'entryDate', e.entry_date, 'entryName', e.name,
        'amountCents', x.amount_cents, 'paidCents', x.paid, 'entryAvailableCents', x.available,
        'entryUnallocatedCents', x.available - x.entry_allocated) order by e.entry_date, e.id)
      from effective x join public.ledger_entries e on e.id = x.entry_id
      where x.debt_id = d.id), '[]'::jsonb) end,
    case when access.editor then exists (select 1 from effective x where x.debt_id = d.id and x.paid < x.amount_cents) end,
    d.updated_at
  from public.debts d
  cross join access
  join public.associates a on a.id = d.associate_id
  join debtors on debtors.associate_id = d.associate_id
  where d.group_id = p_group_id and access.member
  order by d.debt_date desc, d.created_at desc;
$$;
revoke all on function public.debt_rows(uuid) from public, anon;
grant execute on function public.debt_rows(uuid) to authenticated;

/*
  Cria (p_id nulo) ou edita a dívida. p_payments = [{entryId, amountCents}] substitui as alocações da dívida:
  lançamentos do grupo com rateio de receita do associado, respeitando os limites (check_debt_allocations).
*/
drop function public.save_debt(uuid, uuid, uuid, date, bigint, text, text, uuid[]);
create function public.save_debt(
  p_group_id uuid, p_id uuid, p_associate_id uuid, p_debt_date date, p_amount_cents bigint,
  p_description text, p_agreement text, p_payments jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  result uuid := p_id;
  before_state jsonb;
  clean_description text := nullif(trim(p_description), '');
  clean_agreement text := nullif(trim(p_agreement), '');
  touched uuid[];
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para anotar dívidas'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id) then raise exception 'Associado não encontrado'; end if;
  if p_debt_date is null then raise exception 'Informe a data da dívida'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if clean_description is null or char_length(clean_description) not between 2 and 200 then raise exception 'Descrição: de 2 a 200 caracteres'; end if;
  if char_length(clean_agreement) > 300 then raise exception 'Acordo: no máximo 300 caracteres'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then raise exception 'Pagamentos inválidos'; end if;
  if exists (select 1 from jsonb_array_elements(p_payments) x where coalesce((x->>'amountCents')::bigint, 0) <= 0) then
    raise exception 'Informe o valor de cada pagamento';
  end if;
  if (select count(*) from jsonb_array_elements(p_payments)) <> (select count(distinct x->>'entryId') from jsonb_array_elements(p_payments) x) then
    raise exception 'Lançamento repetido nos pagamentos';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payments) x
    where not exists (select 1 from public.ledger_entries e where e.id = (x->>'entryId')::uuid and e.group_id = p_group_id)
      or public.debt_payment_cents((x->>'entryId')::uuid, p_associate_id) <= 0
  ) then raise exception 'Pagamento inválido: use um lançamento com rateio de receita deste associado'; end if;

  -- trava as dívidas do associado: as alocações de um lançamento são divididas entre elas
  perform 1 from public.debts where associate_id = p_associate_id for update;
  if p_id is not null then
    perform 1 from public.debts where id = p_id and group_id = p_group_id;
    if not found then raise exception 'Dívida não encontrada'; end if;
    before_state := public.debt_snapshot(p_id);
    update public.debts set associate_id = p_associate_id, debt_date = p_debt_date, amount_cents = p_amount_cents,
      description = clean_description, agreement = clean_agreement, updated_by = auth.uid(), updated_at = now()
    where id = p_id;
    delete from public.debt_payments where debt_id = p_id;
  else
    insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, agreement, created_by, updated_by)
    values (p_group_id, p_associate_id, p_debt_date, p_amount_cents, clean_description, clean_agreement, auth.uid(), auth.uid())
    returning id into result;
  end if;
  insert into public.debt_payments(debt_id, entry_id, amount_cents)
  select result, (x->>'entryId')::uuid, (x->>'amountCents')::bigint from jsonb_array_elements(p_payments) x;

  touched := coalesce((select array_agg((x->>'entryId')::uuid) from jsonb_array_elements(p_payments) x), '{}');
  perform public.check_debt_allocations(p_associate_id, touched, array[result]);

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'debt.created' else 'debt.updated' end, 'debt', result::text,
    jsonb_build_object('before', before_state, 'after', public.debt_snapshot(result)));
  return result;
end;
$$;

/*
  Registra o pagamento pelo devedor: p_allocations = [{debtId, amountCents}] substitui o quanto o lançamento paga de
  cada dívida do associado (as que não vierem, ou com 0, deixam de usar este lançamento).
*/
create function public.pay_debts(p_group_id uuid, p_associate_id uuid, p_entry_id uuid, p_allocations jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare before_state jsonb; debt_ids uuid[];
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para anotar dívidas'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id) then raise exception 'Associado não encontrado'; end if;
  if not exists (select 1 from public.ledger_entries where id = p_entry_id and group_id = p_group_id)
    or public.debt_payment_cents(p_entry_id, p_associate_id) <= 0 then
    raise exception 'Pagamento inválido: use um lançamento com rateio de receita deste associado';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then raise exception 'Pagamentos inválidos'; end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) x where coalesce((x->>'amountCents')::bigint, -1) < 0) then
    raise exception 'Valor de pagamento inválido';
  end if;
  if exists (select 1 from jsonb_array_elements(p_allocations) x
    where not exists (select 1 from public.debts d where d.id = (x->>'debtId')::uuid and d.associate_id = p_associate_id and d.group_id = p_group_id)) then
    raise exception 'Dívida não encontrada';
  end if;

  perform 1 from public.debts where associate_id = p_associate_id for update;
  select coalesce(jsonb_agg(jsonb_build_object('debt_id', p.debt_id, 'amount_cents', p.amount_cents) order by p.debt_id), '[]'::jsonb) into before_state
  from public.debt_payments p join public.debts d on d.id = p.debt_id where p.entry_id = p_entry_id and d.associate_id = p_associate_id;

  delete from public.debt_payments p using public.debts d where d.id = p.debt_id and p.entry_id = p_entry_id and d.associate_id = p_associate_id;
  insert into public.debt_payments(debt_id, entry_id, amount_cents)
  select (x->>'debtId')::uuid, p_entry_id, sum((x->>'amountCents')::bigint) from jsonb_array_elements(p_allocations) x
  group by (x->>'debtId')::uuid having sum((x->>'amountCents')::bigint) > 0;

  debt_ids := coalesce((select array_agg((x->>'debtId')::uuid) from jsonb_array_elements(p_allocations) x), '{}');
  perform public.check_debt_allocations(p_associate_id, array[p_entry_id], debt_ids);

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'debt.paid', 'debt_payment', p_entry_id::text,
    jsonb_build_object('associate_id', p_associate_id, 'before', before_state,
      'after', (select coalesce(jsonb_agg(jsonb_build_object('debt_id', p.debt_id, 'amount_cents', p.amount_cents) order by p.debt_id), '[]'::jsonb)
        from public.debt_payments p join public.debts d on d.id = p.debt_id where p.entry_id = p_entry_id and d.associate_id = p_associate_id)));
end;
$$;

revoke all on function public.save_debt(uuid, uuid, uuid, date, bigint, text, text, jsonb) from public, anon;
grant execute on function public.save_debt(uuid, uuid, uuid, date, bigint, text, text, jsonb) to authenticated;
revoke all on function public.pay_debts(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.pay_debts(uuid, uuid, uuid, jsonb) to authenticated;
