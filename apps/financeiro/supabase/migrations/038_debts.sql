-- Devedores (Mensalidades › Devedores): anotações de dívidas de associados, com data, valor, descrição,
-- acordo de pagamento (texto) e vínculo opcional aos lançamentos que a pagaram. O vínculo é ao lançamento (editar
-- um lançamento recria os rateios); o valor pago é a soma dos rateios de receita do associado da dívida nele.
-- A consulta vê as dívidas sem saber de quem são: as tabelas só são lidas por tesouraria/administração,
-- e todos os membros leem por debt_rows, que esconde o associado e os pagamentos (estes levam ao associado).

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete restrict,
  debt_date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  description text not null check (char_length(description) between 2 and 200),
  agreement text check (char_length(agreement) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index debts_group_date_idx on public.debts(group_id, debt_date);
create index debts_associate_idx on public.debts(associate_id);

-- Uma dívida pode ser paga em vários lançamentos (parcelas); um lançamento paga só uma dívida de cada associado.
create table public.debt_payments (
  debt_id uuid not null references public.debts(id) on delete cascade,
  entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  primary key (debt_id, entry_id)
);
create index debt_payments_entry_idx on public.debt_payments(entry_id);

-- Quanto o lançamento pagou da dívida: rateios de receita do associado da dívida.
create function public.debt_payment_cents(p_entry_id uuid, p_associate_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.amount_cents), 0)::bigint from public.entry_splits s join public.categories c on c.id = s.category_id
  where s.entry_id = p_entry_id and s.associate_id = p_associate_id and c.kind = 'receita';
$$;
revoke all on function public.debt_payment_cents(uuid, uuid) from public, anon, authenticated;

alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
create policy "editors read debts" on public.debts for select using (public.can_edit_group(group_id));
create policy "editors read debt payments" on public.debt_payments for select using (
  exists (select 1 from public.debts d where d.id = debt_id and public.can_edit_group(d.group_id))
);

-- Leitura para todos os membros. Consulta recebe associate_id, associate_name e payments nulos; debtor_number agrupa
-- as dívidas do mesmo associado sem dizer quem é ("Devedor 1", "Devedor 2"…, pela ordem da primeira anotação).
create function public.debt_rows(p_group_id uuid)
returns table (
  id uuid, debt_date date, amount_cents bigint, paid_cents bigint, description text, agreement text,
  associate_id uuid, associate_name text, debtor_number integer, payments jsonb, updated_at timestamptz
) language sql stable security definer set search_path = '' as $$
  with access as (select public.is_group_member(p_group_id) as member, public.can_edit_group(p_group_id) as editor),
  debtors as (
    select associate_id, dense_rank() over (order by min(created_at), min(debt_date), associate_id)::integer as debtor_number
    from public.debts where group_id = p_group_id group by associate_id
  )
  select d.id, d.debt_date, d.amount_cents,
    coalesce((select sum(public.debt_payment_cents(p.entry_id, d.associate_id)) from public.debt_payments p where p.debt_id = d.id), 0)::bigint,
    d.description, d.agreement,
    case when access.editor then d.associate_id end,
    case when access.editor then a.name end,
    debtors.debtor_number,
    case when access.editor then coalesce((
      select jsonb_agg(jsonb_build_object('entryId', e.id, 'entryDate', e.entry_date, 'entryName', e.name,
        'amountCents', public.debt_payment_cents(e.id, d.associate_id)) order by e.entry_date, e.id)
      from public.debt_payments p join public.ledger_entries e on e.id = p.entry_id
      where p.debt_id = d.id), '[]'::jsonb) end,
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

create function public.debt_snapshot(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('associate_id', d.associate_id, 'debt_date', d.debt_date, 'amount_cents', d.amount_cents,
    'description', d.description, 'agreement', d.agreement,
    'entry_ids', coalesce((select jsonb_agg(p.entry_id order by p.entry_id) from public.debt_payments p where p.debt_id = d.id), '[]'::jsonb))
  from public.debts d where d.id = p_id;
$$;
revoke all on function public.debt_snapshot(uuid) from public, anon, authenticated;

/*
  Cria (p_id nulo) ou edita a dívida. p_entry_ids substitui os pagamentos vinculados: lançamentos do grupo com
  rateio de receita do mesmo associado, que não paguem outra dívida dele.
*/
create function public.save_debt(
  p_group_id uuid, p_id uuid, p_associate_id uuid, p_debt_date date, p_amount_cents bigint,
  p_description text, p_agreement text, p_entry_ids uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  result uuid := p_id;
  before_state jsonb;
  clean_description text := nullif(trim(p_description), '');
  clean_agreement text := nullif(trim(p_agreement), '');
  entries uuid[] := coalesce((select array_agg(distinct x) from unnest(p_entry_ids) x where x is not null), '{}');
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para anotar dívidas'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id) then raise exception 'Associado não encontrado'; end if;
  if p_debt_date is null then raise exception 'Informe a data da dívida'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if clean_description is null or char_length(clean_description) not between 2 and 200 then raise exception 'Descrição: de 2 a 200 caracteres'; end if;
  if char_length(clean_agreement) > 300 then raise exception 'Acordo: no máximo 300 caracteres'; end if;

  if p_id is not null then
    perform 1 from public.debts where id = p_id and group_id = p_group_id for update;
    if not found then raise exception 'Dívida não encontrada'; end if;
    before_state := public.debt_snapshot(p_id);
  end if;

  if exists (
    select 1 from unnest(entries) x
    where not exists (select 1 from public.ledger_entries e where e.id = x and e.group_id = p_group_id)
      or public.debt_payment_cents(x, p_associate_id) <= 0
  ) then raise exception 'Pagamento inválido: use um lançamento com rateio de receita deste associado'; end if;
  if exists (select 1 from public.debt_payments p join public.debts d on d.id = p.debt_id
    where p.entry_id = any(entries) and d.associate_id = p_associate_id and d.id is distinct from p_id) then
    raise exception 'Este lançamento já paga outra dívida do associado';
  end if;

  if p_id is null then
    insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, agreement, created_by, updated_by)
    values (p_group_id, p_associate_id, p_debt_date, p_amount_cents, clean_description, clean_agreement, auth.uid(), auth.uid())
    returning id into result;
  else
    update public.debts set associate_id = p_associate_id, debt_date = p_debt_date, amount_cents = p_amount_cents,
      description = clean_description, agreement = clean_agreement, updated_by = auth.uid(), updated_at = now()
    where id = p_id;
    delete from public.debt_payments where debt_id = p_id and entry_id <> all(entries);
  end if;
  insert into public.debt_payments(debt_id, entry_id) select result, x from unnest(entries) x on conflict do nothing;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), case when p_id is null then 'debt.created' else 'debt.updated' end, 'debt', result::text,
    jsonb_build_object('before', before_state, 'after', public.debt_snapshot(result)));
  return result;
end;
$$;

create function public.delete_debt(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare debt_group uuid; before_state jsonb;
begin
  select group_id into debt_group from public.debts where id = p_id;
  if debt_group is null or not public.can_edit_group(debt_group) then raise exception 'Dívida não encontrada ou sem permissão'; end if;
  before_state := public.debt_snapshot(p_id);
  delete from public.debts where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (debt_group, auth.uid(), 'debt.deleted', 'debt', p_id::text, jsonb_build_object('before', before_state));
end;
$$;

revoke all on function public.save_debt(uuid, uuid, uuid, date, bigint, text, text, uuid[]) from public, anon;
grant execute on function public.save_debt(uuid, uuid, uuid, date, bigint, text, text, uuid[]) to authenticated;
revoke all on function public.delete_debt(uuid) from public, anon;
grant execute on function public.delete_debt(uuid) to authenticated;
