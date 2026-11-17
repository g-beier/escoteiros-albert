-- Valor individual da mensalidade por associado e ano (irmãos, combinação por dificuldade financeira…),
-- com motivo. Substitui o valor do ano no previsto, no em aberto e nas sugestões; o desconto do
-- pagamento integral (percentual e data-limite do ano) vale também sobre o valor individual.

create table public.fee_associate_prices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  monthly_cents bigint not null check (monthly_cents >= 0),
  reason text not null check (char_length(reason) between 2 and 120),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (associate_id, year)
);
create index fee_associate_prices_group_year_idx on public.fee_associate_prices(group_id, year);
alter table public.fee_associate_prices enable row level security;
create policy "members read fee associate prices" on public.fee_associate_prices for select using (public.is_group_member(group_id));

-- p_monthly_cents nulo remove o valor individual (volta ao valor do ano).
create function public.set_fee_associate_price(p_associate_id uuid, p_year int, p_monthly_cents bigint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare associate_group uuid; before_state jsonb; new_reason text := nullif(trim(p_reason), '');
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  select jsonb_build_object('monthly_cents', p.monthly_cents, 'reason', p.reason) into before_state
  from public.fee_associate_prices p where p.associate_id = p_associate_id and p.year = p_year;
  if p_monthly_cents is null then
    delete from public.fee_associate_prices where associate_id = p_associate_id and year = p_year;
  else
    if p_monthly_cents < 0 then raise exception 'Valor inválido'; end if;
    if new_reason is null or char_length(new_reason) not between 2 and 120 then raise exception 'Informe o motivo (2 a 120 caracteres)'; end if;
    insert into public.fee_associate_prices(group_id, associate_id, year, monthly_cents, reason, updated_by)
    values (associate_group, p_associate_id, p_year, p_monthly_cents, new_reason, auth.uid())
    on conflict (associate_id, year) do update set monthly_cents = excluded.monthly_cents, reason = excluded.reason,
      updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), case when p_monthly_cents is null then 'fee.price_removed' else 'fee.price_set' end, 'associate',
    p_associate_id::text, jsonb_build_object('year', p_year, 'before', before_state,
      'after', case when p_monthly_cents is null then null else jsonb_build_object('monthly_cents', p_monthly_cents, 'reason', new_reason) end));
end;
$$;
revoke all on function public.set_fee_associate_price(uuid, int, bigint, text) from public;
grant execute on function public.set_fee_associate_price(uuid, int, bigint, text) to authenticated;
