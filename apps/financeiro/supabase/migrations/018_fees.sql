-- Mensalidades: grade anual (março a dezembro) por associado, com registro manual (pago / atenção),
-- vínculo opcional aos rateios da rubrica de mensalidade, isenção por ano e regra de vencimento do grupo.
-- "Atrasado" é calculado no app a partir da regra de vencimento; não é gravado.

create type public.fee_status as enum ('pago', 'atencao');
create type public.fee_due_rule as enum ('dia_fixo', 'dia_util', 'fim_do_mes');

create table public.fee_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  due_rule public.fee_due_rule not null default 'dia_fixo',
  due_day int not null default 10 check (due_day between 1 and 28),
  -- nulo = rubrica de código 1.1 (e filhas)
  category_id uuid references public.categories(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.fee_records (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  month int not null check (month between 3 and 12),
  status public.fee_status not null,
  note text check (char_length(note) <= 200),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (associate_id, year, month)
);
create index fee_records_group_year_idx on public.fee_records(group_id, year);

-- Um rateio pode cobrir vários meses; um mês pode juntar dois pagamentos.
create table public.fee_record_splits (
  fee_record_id uuid not null references public.fee_records(id) on delete cascade,
  split_id uuid not null references public.entry_splits(id) on delete cascade,
  primary key (fee_record_id, split_id)
);
create index fee_record_splits_split_idx on public.fee_record_splits(split_id);

create table public.fee_exemptions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  reason text not null check (char_length(reason) between 2 and 120),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (associate_id, year)
);
create index fee_exemptions_group_year_idx on public.fee_exemptions(group_id, year);

alter table public.fee_settings enable row level security;
alter table public.fee_records enable row level security;
alter table public.fee_record_splits enable row level security;
alter table public.fee_exemptions enable row level security;
create policy "members read fee settings" on public.fee_settings for select using (public.is_group_member(group_id));
create policy "members read fee records" on public.fee_records for select using (public.is_group_member(group_id));
create policy "members read fee record splits" on public.fee_record_splits for select using (
  exists (select 1 from public.fee_records r where r.id = fee_record_id and public.is_group_member(r.group_id))
);
create policy "members read fee exemptions" on public.fee_exemptions for select using (public.is_group_member(group_id));

-- Rubricas de mensalidade do grupo: a configurada (ou a de código 1.1) e todas as de baixo.
create function public.fee_category_ids(p_group_id uuid)
returns uuid[] language sql stable security invoker set search_path = '' as $$
  with recursive root as (
    select coalesce(
      (select s.category_id from public.fee_settings s where s.group_id = p_group_id),
      (select c.id from public.categories c where c.group_id = p_group_id and c.code = '1.1')
    ) as id
  ), tree as (
    select id from root where id is not null
    union
    select c.id from public.categories c join tree t on c.parent_id = t.id
  )
  select coalesce(array_agg(id), '{}') from tree;
$$;
grant execute on function public.fee_category_ids(uuid) to authenticated;

-- Rateios de mensalidade com associado, e as caixinhas a que já estão ligados.
create view public.fee_split_candidates with (security_invoker = true) as
select
  s.id as split_id,
  e.group_id,
  s.associate_id,
  e.id as entry_id,
  e.entry_date,
  e.name as entry_name,
  s.amount_cents,
  s.description,
  -- caixinhas já ligadas a este rateio, como ano * 100 + mês (ex.: 202604)
  coalesce((select array_agg(r.year * 100 + r.month order by r.year, r.month) from public.fee_record_splits rs
    join public.fee_records r on r.id = rs.fee_record_id where rs.split_id = s.id), '{}') as linked_periods
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
where s.associate_id is not null and s.category_id = any(public.fee_category_ids(e.group_id));

-- Escrita ------------------------------------------------------------------------------

create function public.fee_record_snapshot(p_record_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', r.status, 'note', r.note,
    'split_ids', coalesce((select jsonb_agg(rs.split_id order by rs.split_id) from public.fee_record_splits rs where rs.fee_record_id = r.id), '[]'::jsonb))
  from public.fee_records r where r.id = p_record_id;
$$;
revoke all on function public.fee_record_snapshot(uuid) from public, anon, authenticated;

/*
  Registra a caixinha (associado, ano, mês). p_status nulo apaga o registro (volta a vazio/atrasado).
  p_split_ids substitui os vínculos; só rateios de mensalidade do próprio associado são aceitos.
*/
create function public.set_fee_record(
  p_associate_id uuid, p_year int, p_month int, p_status public.fee_status, p_note text, p_split_ids uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  associate_group uuid;
  record_id uuid;
  before_state jsonb;
  categories uuid[];
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_month not between 3 and 12 then raise exception 'Mês inválido (março a dezembro)'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if char_length(p_note) > 200 then raise exception 'Nota: no máximo 200 caracteres'; end if;

  select id into record_id from public.fee_records where associate_id = p_associate_id and year = p_year and month = p_month for update;
  before_state := case when record_id is null then null else public.fee_record_snapshot(record_id) end;

  if p_status is null then
    if record_id is not null then delete from public.fee_records where id = record_id; end if;
  else
    categories := public.fee_category_ids(associate_group);
    if exists (
      select 1 from unnest(coalesce(p_split_ids, '{}')) x
      where not exists (select 1 from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id
        where s.id = x and e.group_id = associate_group and s.associate_id = p_associate_id and s.category_id = any(categories))
    ) then raise exception 'Rateio inválido: use um rateio de mensalidade deste associado'; end if;

    insert into public.fee_records(group_id, associate_id, year, month, status, note, updated_by)
    values (associate_group, p_associate_id, p_year, p_month, p_status, nullif(trim(p_note), ''), auth.uid())
    on conflict (associate_id, year, month) do update
      set status = excluded.status, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
    returning id into record_id;
    delete from public.fee_record_splits where fee_record_id = record_id;
    insert into public.fee_record_splits(fee_record_id, split_id)
    select record_id, x from (select distinct unnest(coalesce(p_split_ids, '{}')) as x) d;
  end if;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'fee.recorded', 'associate', p_associate_id::text,
    jsonb_build_object('year', p_year, 'month', p_month, 'before', before_state,
      'after', case when p_status is null then null else public.fee_record_snapshot(record_id) end));
end;
$$;

-- Confirma sugestões em lote: [{ associateId, year, month, splitId }] → pago + vínculo (acrescenta, não substitui).
create function public.confirm_fee_suggestions(p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  idx bigint;
  existing_splits uuid[];
  done int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Nenhuma sugestão'; end if;
  if jsonb_array_length(p_items) > 5000 then raise exception 'Sugestões demais de uma vez'; end if;
  for item, idx in select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    select coalesce(array_agg(rs.split_id), '{}') into existing_splits
    from public.fee_records r join public.fee_record_splits rs on rs.fee_record_id = r.id
    where r.associate_id = (item->>'associateId')::uuid and r.year = (item->>'year')::int and r.month = (item->>'month')::int;
    begin
      perform public.set_fee_record((item->>'associateId')::uuid, (item->>'year')::int, (item->>'month')::int, 'pago', null,
        existing_splits || (item->>'splitId')::uuid);
    exception when others then
      raise exception 'Sugestão %: %', idx, sqlerrm;
    end;
    done := done + 1;
  end loop;
  return done;
end;
$$;

-- Isenção no ano (p_reason nulo remove).
create function public.set_fee_exemption(p_associate_id uuid, p_year int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare associate_group uuid; reason text := nullif(trim(p_reason), '');
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_edit_group(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if p_year not between 2000 and 2100 then raise exception 'Ano inválido'; end if;
  if reason is null then
    delete from public.fee_exemptions where associate_id = p_associate_id and year = p_year;
  else
    if char_length(reason) not between 2 and 120 then raise exception 'Informe o motivo (2 a 120 caracteres)'; end if;
    insert into public.fee_exemptions(group_id, associate_id, year, reason, updated_by)
    values (associate_group, p_associate_id, p_year, reason, auth.uid())
    on conflict (associate_id, year) do update set reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), case when reason is null then 'fee.exemption_removed' else 'fee.exempted' end, 'associate', p_associate_id::text,
    jsonb_build_object('year', p_year, 'reason', reason));
end;
$$;

create function public.set_fee_settings(p_group_id uuid, p_due_rule public.fee_due_rule, p_due_day int, p_category_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare before_state jsonb;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar as configurações de mensalidade'; end if;
  if p_due_rule is null then raise exception 'Escolha a regra de vencimento'; end if;
  if p_due_rule = 'dia_fixo' and coalesce(p_due_day, 0) not between 1 and 28 then raise exception 'Dia do vencimento entre 1 e 28'; end if;
  if p_due_rule = 'dia_util' and coalesce(p_due_day, 0) not between 1 and 20 then raise exception 'Dia útil entre 1 e 20'; end if;
  if p_category_id is not null and not exists (select 1 from public.categories where id = p_category_id and group_id = p_group_id) then
    raise exception 'Rubrica inválida';
  end if;
  select to_jsonb(s) - 'group_id' - 'updated_by' - 'updated_at' into before_state from public.fee_settings s where s.group_id = p_group_id;
  insert into public.fee_settings(group_id, due_rule, due_day, category_id, updated_by)
  values (p_group_id, p_due_rule, case when p_due_rule = 'fim_do_mes' then 10 else p_due_day end, p_category_id, auth.uid())
  on conflict (group_id) do update set due_rule = excluded.due_rule, due_day = excluded.due_day, category_id = excluded.category_id,
    updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'fee.settings_updated', 'group', p_group_id::text,
    jsonb_build_object('before', before_state, 'after', jsonb_build_object('due_rule', p_due_rule, 'due_day', p_due_day, 'category_id', p_category_id)));
end;
$$;

revoke all on function public.set_fee_record(uuid, int, int, public.fee_status, text, uuid[]) from public;
revoke all on function public.confirm_fee_suggestions(jsonb) from public;
revoke all on function public.set_fee_exemption(uuid, int, text) from public;
revoke all on function public.set_fee_settings(uuid, public.fee_due_rule, int, uuid) from public;
grant execute on function public.set_fee_record(uuid, int, int, public.fee_status, text, uuid[]) to authenticated;
grant execute on function public.confirm_fee_suggestions(jsonb) to authenticated;
grant execute on function public.set_fee_exemption(uuid, int, text) to authenticated;
grant execute on function public.set_fee_settings(uuid, public.fee_due_rule, int, uuid) to authenticated;
