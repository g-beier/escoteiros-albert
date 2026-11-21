-- Registro rápido comum (/rapido): além das ações do inventário (045), lançamentos financeiros e associados novos.
-- Como os movimentos do inventário (044), o que vem do registro rápido entra de verdade (o lançamento já conta nos
-- relatórios, o associado já aparece na lista) e fica "para revisar" até alguém do módulo conferir e marcar revisado.
-- Cada módulo revisa na sua lista: Financeiro filtra os lançamentos (`revisao=para_revisar`), Associados mostra os
-- cadastros para revisar no topo da lista. Sem recusa: o que estiver errado se corrige editando ou excluindo.

-- Financeiro -----------------------------------------------------------------------------------------------

alter table public.ledger_entries
  add column review_status text not null default 'revisado' check (review_status in ('para_revisar', 'revisado')),
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column reviewed_at timestamptz;
create index ledger_entries_review_idx on public.ledger_entries(group_id) where review_status = 'para_revisar';

-- Lançamento do registro rápido: um rateio só (a rubrica escolhida, com o total). O sinal do valor segue a rubrica
-- (receita positiva, despesa negativa; conferido em write_entry_splits). Sem descrição, o rateio repete o histórico
-- (a descrição é obrigatória). A conta é a padrão da forma de pagamento ou "A definir" (resolve_entry_account).
-- Fica para revisar.
create or replace function public.create_quick_ledger_entry(
  p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_total_cents bigint,
  p_category_id uuid, p_description text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  new_id := public.create_ledger_entry(p_group_id, p_entry_date, p_name, p_payment_method_id, null, false, p_total_cents,
    jsonb_build_array(jsonb_build_object('category_id', p_category_id, 'amount_cents', p_total_cents, 'description', coalesce(nullif(trim(p_description), ''), trim(p_name)))),
    null, p_notes);
  update public.ledger_entries set review_status = 'para_revisar' where id = new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'ledger_entry.quick', 'ledger_entry', new_id::text, jsonb_build_object('channel', 'rapido'));
  return new_id;
end;
$$;

-- Marca lançamentos como revisados (os que já estavam revisados ficam como estão); devolve quantos mudaram.
create function public.review_ledger_entries(p_group_id uuid, p_entry_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare done_id uuid; total integer := 0;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para revisar lançamentos neste grupo'; end if;
  for done_id in
    update public.ledger_entries set review_status = 'revisado', reviewed_by = auth.uid(), reviewed_at = now()
    where group_id = p_group_id and id = any(p_entry_ids) and review_status = 'para_revisar'
    returning id
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'ledger_entry.reviewed', 'ledger_entry', done_id::text, '{}'::jsonb);
    total := total + 1;
  end loop;
  return total;
end;
$$;

-- Visões das listas: as colunas de 047 na mesma ordem, mais review_status no fim.
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
  concat_ws(' ', e.name, string_agg(s.description, ' '), array_to_string(x.external_ids, ' '), e.notes, string_agg(distinct a.name, ' ')) as search_text,
  e.review_status
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
  concat_ws(' ', e.name, s.description, array_to_string(x.external_ids, ' '), e.notes, a.name) as search_text,
  e.review_status
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id
cross join lateral (select public.entry_external_ids(e.id) as external_ids) x;

-- Associados ------------------------------------------------------------------------------------------------

alter table public.associates
  add column review_status text not null default 'revisado' check (review_status in ('para_revisar', 'revisado')),
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column reviewed_at timestamptz;
create index associates_review_idx on public.associates(group_id) where review_status = 'para_revisar';

-- Cadastro pelo registro rápido: o mesmo de associates_create (041), para revisar pela Secretaria.
create function public.associates_create_quick(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid,
  p_birth_date date, p_promise_date date, p_joined_on date, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  new_id := public.associates_create(p_group_id, p_name, p_branch, p_section_id, p_patrol_id, p_birth_date, p_promise_date, p_joined_on, p_notes);
  update public.associates set review_status = 'para_revisar' where id = new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associate.quick', 'associate', new_id::text, jsonb_build_object('channel', 'rapido'));
  return new_id;
end;
$$;

create function public.associates_review(p_group_id uuid, p_associate_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare done_id uuid; total integer := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para revisar associados neste grupo'; end if;
  for done_id in
    update public.associates set review_status = 'revisado', reviewed_by = auth.uid(), reviewed_at = now()
    where group_id = p_group_id and id = any(p_associate_ids) and review_status = 'para_revisar'
    returning id
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'associate.reviewed', 'associate', done_id::text, '{}'::jsonb);
    total := total + 1;
  end loop;
  return total;
end;
$$;

-- Visão do cadastro (040) com review_status no fim.
create or replace view public.associate_profile_rows with (security_invoker = true) as
select r.id, r.group_id, r.name, r.branch, r.active,
  r.section_id, r.section, r.patrol_id, r.patrol,
  r.created_at, r.updated_at,
  a.birth_date, a.promise_date, a.joined_on, a.notes,
  case when r.active then null else (
    select max(m.movement_date) from public.associate_movements m where m.associate_id = r.id and m.kind = 'saida'
  ) end as left_on,
  a.review_status
from public.associate_rows r
join public.associates a on a.id = r.id;

-- Permissões ------------------------------------------------------------------------------------------------

revoke all on function public.create_quick_ledger_entry(uuid, date, text, uuid, bigint, uuid, text, text) from public, anon;
revoke all on function public.review_ledger_entries(uuid, uuid[]) from public, anon;
revoke all on function public.associates_create_quick(uuid, text, public.scout_branch, uuid, uuid, date, date, date, text) from public, anon;
revoke all on function public.associates_review(uuid, uuid[]) from public, anon;
grant execute on function public.create_quick_ledger_entry(uuid, date, text, uuid, bigint, uuid, text, text) to authenticated;
grant execute on function public.review_ledger_entries(uuid, uuid[]) to authenticated;
grant execute on function public.associates_create_quick(uuid, text, public.scout_branch, uuid, uuid, date, date, date, text) to authenticated;
grant execute on function public.associates_review(uuid, uuid[]) to authenticated;
