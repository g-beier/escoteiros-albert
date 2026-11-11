-- Edição, exclusão e conferência de pasta dos lançamentos, com auditoria.

-- Valida e grava os rateios de um lançamento. Rubricas/associados inativos só são aceitos
-- se já estavam no lançamento (edição de histórico); novos vínculos exigem cadastro ativo.
create or replace function public.write_entry_splits(
  p_entry_id uuid, p_group_id uuid, p_splits jsonb, p_previous_splits jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  split jsonb;
  split_category uuid;
  split_associate uuid;
begin
  for split in select value from jsonb_array_elements(p_splits)
  loop
    split_category := (split->>'category_id')::uuid;
    if not exists (
      select 1 from public.categories c where c.id = split_category and c.group_id = p_group_id
        and (c.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where (prev->>'category_id')::uuid = split_category))
    ) then raise exception 'Rubrica inválida'; end if;

    split_associate := nullif(split->>'associate_id', '')::uuid;
    if split_associate is not null and not exists (
      select 1 from public.associates a where a.id = split_associate and a.group_id = p_group_id
        and (a.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where nullif(prev->>'associate_id', '')::uuid = split_associate))
    ) then raise exception 'Associado inválido'; end if;

    insert into public.entry_splits (entry_id, category_id, amount_cents, description, associate_id)
    values (p_entry_id, split_category, (split->>'amount_cents')::bigint, trim(split->>'description'), split_associate);
  end loop;
end;
$$;
revoke all on function public.write_entry_splits(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.validate_entry_totals(p_total_cents bigint, p_splits jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare split_total bigint;
begin
  if p_total_cents = 0 then raise exception 'O total não pode ser zero'; end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then raise exception 'Informe ao menos uma rubrica'; end if;
  select coalesce(sum((value->>'amount_cents')::bigint), 0) into split_total from jsonb_array_elements(p_splits);
  if split_total <> p_total_cents then raise exception 'A soma das rubricas deve ser igual ao total'; end if;
end;
$$;

-- Snapshot usado na auditoria de alterações e exclusões.
create or replace function public.ledger_entry_snapshot(p_entry_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'entry_date', e.entry_date,
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
revoke all on function public.ledger_entry_snapshot(uuid) from public, anon, authenticated;

create or replace function public.create_ledger_entry(
  p_group_id uuid, p_entry_date date, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_entry_id uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para lançar neste grupo'; end if;
  perform public.validate_entry_totals(p_total_cents, p_splits);
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and group_id = p_group_id and active) then
    raise exception 'Forma de pagamento inválida';
  end if;

  insert into public.ledger_entries (group_id, entry_date, payment_method_id, document, document_filed, total_cents, created_by)
  values (p_group_id, p_entry_date, p_payment_method_id, nullif(trim(p_document), ''), coalesce(p_document_filed, false), p_total_cents, auth.uid())
  returning id into new_entry_id;

  perform public.write_entry_splits(new_entry_id, p_group_id, p_splits);
  return new_entry_id;
end;
$$;

create or replace function public.update_ledger_entry(
  p_entry_id uuid, p_entry_date date, p_payment_method_id uuid, p_document text,
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

create or replace function public.delete_ledger_entry(p_entry_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare entry_group uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.deleted', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('before', public.ledger_entry_snapshot(p_entry_id)));
  delete from public.ledger_entries where id = p_entry_id;
end;
$$;

create or replace function public.set_entry_document_filed(p_entry_id uuid, p_filed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare entry_group uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  update public.ledger_entries set document_filed = p_filed, updated_at = now() where id = p_entry_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.document_filed', 'ledger_entry', p_entry_id::text, jsonb_build_object('filed', p_filed));
end;
$$;

revoke all on function public.update_ledger_entry(uuid, date, uuid, text, boolean, bigint, jsonb) from public;
revoke all on function public.delete_ledger_entry(uuid) from public;
revoke all on function public.set_entry_document_filed(uuid, boolean) from public;
grant execute on function public.update_ledger_entry(uuid, date, uuid, text, boolean, bigint, jsonb) to authenticated;
grant execute on function public.delete_ledger_entry(uuid) to authenticated;
grant execute on function public.set_entry_document_filed(uuid, boolean) to authenticated;

create index ledger_entries_group_filed_idx on public.ledger_entries(group_id) where not document_filed;
