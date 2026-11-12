-- Valor da mensalidade por ano e desconto percentual para o pagamento integral (março a dezembro de uma vez)
-- até uma data-limite. Usados no app para previsto × recebido e para sugerir pagamentos pelo valor.
-- Sugestões confirmadas passam a aceitar status e nota (ex.: Atenção "pagou R$ 30,00 de R$ 60,00").

create table public.fee_year_settings (
  group_id uuid not null references public.groups(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  monthly_cents bigint not null check (monthly_cents > 0),
  annual_discount_pct numeric(5, 2) not null default 0 check (annual_discount_pct between 0 and 100),
  -- pagamento integral com desconto vale se lançado até esta data (nula = sem desconto)
  annual_deadline date,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (group_id, year)
);
alter table public.fee_year_settings enable row level security;
create policy "members read fee year settings" on public.fee_year_settings for select using (public.is_group_member(group_id));

create function public.set_fee_year_settings(p_group_id uuid, p_year int, p_monthly_cents bigint, p_discount_pct numeric, p_deadline date)
returns void language plpgsql security definer set search_path = '' as $$
declare before_state jsonb;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar as configurações de mensalidade'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if coalesce(p_monthly_cents, 0) <= 0 then raise exception 'Informe o valor da mensalidade'; end if;
  if coalesce(p_discount_pct, 0) not between 0 and 100 then raise exception 'Desconto entre 0 e 100%%'; end if;
  if coalesce(p_discount_pct, 0) > 0 and p_deadline is null then raise exception 'Informe a data-limite do desconto'; end if;
  select to_jsonb(s) - 'group_id' - 'updated_by' - 'updated_at' into before_state from public.fee_year_settings s where s.group_id = p_group_id and s.year = p_year;
  insert into public.fee_year_settings(group_id, year, monthly_cents, annual_discount_pct, annual_deadline, updated_by)
  values (p_group_id, p_year, p_monthly_cents, coalesce(p_discount_pct, 0), p_deadline, auth.uid())
  on conflict (group_id, year) do update set monthly_cents = excluded.monthly_cents, annual_discount_pct = excluded.annual_discount_pct,
    annual_deadline = excluded.annual_deadline, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'fee.year_settings_updated', 'group', p_group_id::text,
    jsonb_build_object('year', p_year, 'before', before_state,
      'after', jsonb_build_object('monthly_cents', p_monthly_cents, 'annual_discount_pct', coalesce(p_discount_pct, 0), 'annual_deadline', p_deadline)));
end;
$$;
revoke all on function public.set_fee_year_settings(uuid, int, bigint, numeric, date) from public;
grant execute on function public.set_fee_year_settings(uuid, int, bigint, numeric, date) to authenticated;

-- Itens: { associateId, year, month, splitId, status?: 'pago' | 'atencao', note? }. Os vínculos são acrescentados.
create or replace function public.confirm_fee_suggestions(p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  idx bigint;
  existing_splits uuid[];
  item_status public.fee_status;
  done int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Nenhuma sugestão'; end if;
  if jsonb_array_length(p_items) > 5000 then raise exception 'Sugestões demais de uma vez'; end if;
  for item, idx in select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    if coalesce(item->>'status', 'pago') not in ('pago', 'atencao') then raise exception 'Sugestão %: status inválido', idx; end if;
    item_status := coalesce(item->>'status', 'pago')::public.fee_status;
    select coalesce(array_agg(rs.split_id), '{}') into existing_splits
    from public.fee_records r join public.fee_record_splits rs on rs.fee_record_id = r.id
    where r.associate_id = (item->>'associateId')::uuid and r.year = (item->>'year')::int and r.month = (item->>'month')::int;
    begin
      perform public.set_fee_record((item->>'associateId')::uuid, (item->>'year')::int, (item->>'month')::int, item_status,
        left(item->>'note', 200), existing_splits || (item->>'splitId')::uuid);
    exception when others then
      raise exception 'Sugestão %: %', idx, sqlerrm;
    end;
    done := done + 1;
  end loop;
  return done;
end;
$$;
