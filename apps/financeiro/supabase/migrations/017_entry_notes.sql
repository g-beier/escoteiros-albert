-- Observações: texto livre opcional por lançamento (até 2.000 caracteres), gravado pelas funções
-- de criar/editar (inclusive a partir de uma linha do extrato), auditado e incluído na busca.

alter table public.ledger_entries add column notes text check (char_length(notes) <= 2000);

create or replace function public.ledger_entry_snapshot(p_entry_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'entry_date', e.entry_date,
    'name', e.name,
    'account_id', e.account_id,
    'payment_method_id', e.payment_method_id,
    'document', e.document,
    'document_filed', e.document_filed,
    'total_cents', e.total_cents,
    'notes', e.notes,
    'splits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id', s.category_id, 'amount_cents', s.amount_cents,
        'description', s.description, 'associate_id', s.associate_id) order by s.created_at, s.id)
      from public.entry_splits s where s.entry_id = e.id), '[]'::jsonb)
  )
  from public.ledger_entries e where e.id = p_entry_id;
$$;

drop function public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid);
drop function public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid);
drop function public.create_entry_from_statement_line(uuid, date, text, uuid, text, boolean, bigint, jsonb);

-- p_account_id e p_notes opcionais: chamadas antigas (create_entry_from_statement_line, criação em massa) seguem valendo.
create function public.create_ledger_entry(
  p_group_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_entry_id uuid; entry_account uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para lançar neste grupo'; end if;
  perform public.validate_entry_totals(p_total_cents, p_splits);
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and group_id = p_group_id and active) then
    raise exception 'Forma de pagamento inválida';
  end if;
  if p_account_id is not null and not exists (select 1 from public.accounts where id = p_account_id and group_id = p_group_id and active) then
    raise exception 'Conta inválida';
  end if;
  if char_length(p_notes) > 2000 then raise exception 'Observações: no máximo 2.000 caracteres'; end if;
  entry_account := public.resolve_entry_account(p_group_id, p_payment_method_id, p_account_id);

  insert into public.ledger_entries (group_id, entry_date, name, account_id, payment_method_id, document, document_filed, total_cents, created_by, notes)
  values (p_group_id, p_entry_date, trim(p_name), entry_account, p_payment_method_id, nullif(trim(p_document), ''), coalesce(p_document_filed, false), p_total_cents, auth.uid(), nullif(trim(p_notes), ''))
  returning id into new_entry_id;

  perform public.write_entry_splits(new_entry_id, p_group_id, p_splits);
  return new_entry_id;
end;
$$;

-- Na edição, p_notes é o texto completo (vazio apaga).
create function public.update_ledger_entry(
  p_entry_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid default null, p_notes text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  entry_group uuid;
  old_payment_method uuid;
  old_account uuid;
  before_state jsonb;
begin
  select group_id, payment_method_id, account_id into entry_group, old_payment_method, old_account
  from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  perform public.validate_entry_totals(p_total_cents, p_splits);
  if not exists (
    select 1 from public.payment_methods where id = p_payment_method_id and group_id = entry_group
      and (active or id = old_payment_method)
  ) then raise exception 'Forma de pagamento inválida'; end if;
  if p_account_id is not null and not exists (
    select 1 from public.accounts where id = p_account_id and group_id = entry_group and (active or id = old_account)
  ) then raise exception 'Conta inválida'; end if;

  if char_length(p_notes) > 2000 then raise exception 'Observações: no máximo 2.000 caracteres'; end if;

  before_state := public.ledger_entry_snapshot(p_entry_id);

  update public.ledger_entries set
    entry_date = p_entry_date,
    name = trim(p_name),
    account_id = coalesce(p_account_id, old_account),
    payment_method_id = p_payment_method_id,
    document = nullif(trim(p_document), ''),
    document_filed = coalesce(p_document_filed, false),
    total_cents = p_total_cents,
    notes = nullif(trim(p_notes), ''),
    updated_at = now()
  where id = p_entry_id;

  delete from public.entry_splits where entry_id = p_entry_id;
  perform public.write_entry_splits(p_entry_id, entry_group, p_splits, before_state->'splits');

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.updated', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('before', before_state, 'after', public.ledger_entry_snapshot(p_entry_id)));
end;
$$;

create function public.create_entry_from_statement_line(
  p_statement_line_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  line public.statement_lines%rowtype;
  new_entry_id uuid;
begin
  select * into line from public.statement_lines where id = p_statement_line_id for update;
  if line.id is null or not public.can_edit_group(line.group_id) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if line.status <> 'aberta' then raise exception 'A linha do extrato já foi conciliada ou ignorada'; end if;
  if p_total_cents is distinct from line.amount_cents then raise exception 'O total do lançamento precisa ser igual ao valor da linha do extrato'; end if;

  new_entry_id := public.create_ledger_entry(line.group_id, coalesce(p_entry_date, line.line_date), p_name, p_payment_method_id,
    p_document, p_document_filed, p_total_cents, p_splits, line.account_id, p_notes);
  perform public.link_reconciliation(array[line.id], array[new_entry_id]);
  return new_entry_id;
end;
$$;

revoke all on function public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid, text) from public;
revoke all on function public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid, text) from public;
revoke all on function public.create_entry_from_statement_line(uuid, date, text, uuid, text, boolean, bigint, jsonb, text) from public;
grant execute on function public.create_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid, text) to authenticated;
grant execute on function public.update_ledger_entry(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid, text) to authenticated;
grant execute on function public.create_entry_from_statement_line(uuid, date, text, uuid, text, boolean, bigint, jsonb, text) to authenticated;

-- Busca inclui as observações (colunas iguais às de 014).
drop view public.entry_split_rows;
drop view public.ledger_entry_rows;

create view public.ledger_entry_rows with (security_invoker = true) as
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
  concat_ws(' ', e.name, string_agg(s.description, ' '), array_to_string(x.external_ids, ' '), e.notes) as search_text
from public.ledger_entries e
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
left join public.entry_splits s on s.entry_id = e.id
cross join lateral (select public.entry_external_ids(e.id) as external_ids) x
group by e.id, pm.name, acc.name, acc.ledger_code, x.external_ids;

create view public.entry_split_rows with (security_invoker = true) as
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
  concat_ws(' ', e.name, s.description, array_to_string(x.external_ids, ' '), e.notes) as search_text
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id
cross join lateral (select public.entry_external_ids(e.id) as external_ids) x;
