-- Nome do lançamento: quem pagou/recebeu ou o emitente do documento (ex.: titular do PIX, nome da NF).

alter table public.ledger_entries add column name text;
update public.ledger_entries set name = coalesce(nullif(trim(document), ''), 'Lançamento sem nome') where name is null;
alter table public.ledger_entries
  alter column name set not null,
  add constraint ledger_entries_name_length check (char_length(name) between 2 and 200);

drop function if exists public.create_ledger_entry(uuid, date, uuid, text, boolean, bigint, jsonb);
drop function if exists public.update_ledger_entry(uuid, date, uuid, text, boolean, bigint, jsonb);

create or replace function public.ledger_entry_snapshot(p_entry_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'entry_date', e.entry_date,
    'name', e.name,
    'payment_method_id', e.payment_method_id,
    'document', e.document,
    'document_filed', e.document_filed,
    'total_cents', e.total_cents,
    'splits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id', s.category_id, 'amount_cents', s.amount_cents,
        'description', s.description, 'associate_id', s.associate_id) order by s.created_at, s.id)
      from public.entry_splits s where s.entry_id = e.id), '[]'::jsonb)
  )
  from public.ledger_entries e where e.id = p_entry_id;
$$;

create function public.create_ledger_entry(
  p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_entry_id uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para lançar neste grupo'; end if;
  perform public.validate_entry_totals(p_total_cents, p_splits);
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and group_id = p_group_id and active) then
    raise exception 'Forma de pagamento inválida';
  end if;

  insert into public.ledger_entries (group_id, entry_date, name, payment_method_id, document, document_filed, total_cents, created_by)
  values (p_group_id, p_entry_date, trim(p_name), p_payment_method_id, nullif(trim(p_document), ''), coalesce(p_document_filed, false), p_total_cents, auth.uid())
  returning id into new_entry_id;

  perform public.write_entry_splits(new_entry_id, p_group_id, p_splits);
  return new_entry_id;
end;
$$;

create function public.update_ledger_entry(
  p_entry_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  entry_group uuid;
  old_payment_method uuid;
  before_state jsonb;
begin
  select group_id, payment_method_id into entry_group, old_payment_method
  from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  perform public.validate_entry_totals(p_total_cents, p_splits);
  if not exists (
    select 1 from public.payment_methods where id = p_payment_method_id and group_id = entry_group
      and (active or id = old_payment_method)
  ) then raise exception 'Forma de pagamento inválida'; end if;

  before_state := public.ledger_entry_snapshot(p_entry_id);

  update public.ledger_entries set
    entry_date = p_entry_date,
    name = trim(p_name),
    payment_method_id = p_payment_method_id,
    document = nullif(trim(p_document), ''),
    document_filed = coalesce(p_document_filed, false),
    total_cents = p_total_cents,
    updated_at = now()
  where id = p_entry_id;

  delete from public.entry_splits where entry_id = p_entry_id;
  perform public.write_entry_splits(p_entry_id, entry_group, p_splits, before_state->'splits');

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.updated', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('before', before_state, 'after', public.ledger_entry_snapshot(p_entry_id)));
end;
$$;

revoke all on function public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb) from public;
revoke all on function public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb) from public;
grant execute on function public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb) to authenticated;
grant execute on function public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb) to authenticated;

create or replace function public.audit_ledger_entry_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new.group_id, auth.uid(), 'ledger_entry.created', 'ledger_entry', new.id::text,
    jsonb_build_object('entry_date', new.entry_date, 'name', new.name, 'payment_method_id', new.payment_method_id, 'total_cents', new.total_cents));
  return new;
end;
$$;

-- Visão explodida: ganha o nome do lançamento e um texto de busca (nome + descrição do rateio).
create or replace view public.entry_split_rows with (security_invoker = true) as
select
  s.id as split_id,
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents as entry_total_cents,
  s.amount_cents,
  s.description,
  s.category_id,
  c.name as category_name,
  s.associate_id,
  a.name as associate_name,
  e.name as entry_name,
  e.name || ' ' || s.description as search_text
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id;

-- Visão por extrato: uma linha por lançamento, com dados agregados dos rateios para filtrar.
create view public.ledger_entry_rows with (security_invoker = true) as
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
  e.name || ' ' || coalesce(string_agg(s.description, ' '), '') as search_text
from public.ledger_entries e
join public.payment_methods pm on pm.id = e.payment_method_id
left join public.entry_splits s on s.entry_id = e.id
group by e.id, pm.name;
