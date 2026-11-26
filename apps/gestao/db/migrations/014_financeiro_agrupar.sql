-- 014 — Agrupar e desagrupar lançamentos no Detalhamento (Editor do Financeiro). Útil depois de importar uma planilha
-- de uma linha por rateio: o que era um pagamento só (uma nota com vários itens, uma transferência para várias
-- rubricas) vira um lançamento com vários rateios, ou o contrário.
--
-- merge_ledger_entries(group, split_ids): os lançamentos dos rateios marcados viram um só. Fica o mais antigo (data,
--   depois criação; no empate, o do primeiro rateio marcado), com data, histórico, conta, forma e documento dele; os rateios dos outros passam para ele (os ids
--   não mudam: o vínculo com a mensalidade continua), os pagamentos de dívida somam e os outros lançamentos somem.
--   Recusa: contas diferentes, lançamento conciliado, comprovante num lançamento que some.
-- split_ledger_entry_splits(group, split_ids): cada rateio marcado vira um lançamento próprio, com os dados do
--   lançamento de origem (que fica com os demais; se todos forem marcados, o primeiro fica nele).
--   Recusa: lançamento conciliado (o total mudaria) ou que paga dívida.
-- Auditoria: `ledger_entry.updated` com antes/depois e `reason` (agrupado / desagrupado) no que fica;
-- `ledger_entry.merged` em cada um que some; os novos têm o `ledger_entry.created` de sempre.

create function public.merge_ledger_entries(p_group_id uuid, p_split_ids uuid[]) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare
  ids uuid[] := public.bulk_ids(p_split_ids, 'rateio');
  entry_ids uuid[];
  target public.ledger_entries;
  sources uuid[];
  before jsonb;
  source uuid;
  merged_notes text;
  any_to_review boolean;
begin
  select coalesce(array_agg(distinct entry_id), '{}') into entry_ids from public.entry_splits where id = any(ids);
  perform public.bulk_lock_entries(p_group_id, entry_ids);
  if cardinality(entry_ids) < 2 then raise exception 'Marque rateios de pelo menos dois lançamentos para agrupar'; end if;
  if (select count(distinct account_id) from public.ledger_entries where id = any(entry_ids)) > 1 then
    raise exception 'Os lançamentos estão em contas diferentes: mova-os para a mesma conta antes de agrupar';
  end if;
  if exists (select 1 from public.reconciliation_links where ledger_entry_id = any(entry_ids)) then
    raise exception 'Há lançamento conciliado com o extrato: desfaça a conciliação antes de agrupar';
  end if;

  -- o mais antigo; no empate (mesma data e hora, como numa importação), o do primeiro rateio marcado
  select e.* into target from public.ledger_entries e where e.id = any(entry_ids)
  order by e.entry_date, e.created_at,
    (select min(array_position(p_split_ids, s.id)) from public.entry_splits s where s.entry_id = e.id), e.id
  limit 1;
  sources := array_remove(entry_ids, target.id);
  if exists (select 1 from public.entry_attachments where entry_id = any(sources)) then
    raise exception 'Há comprovante anexado num lançamento que seria agrupado: só o lançamento mais antigo pode ter comprovante';
  end if;

  before := public.ledger_entry_snapshot(target.id);
  select string_agg(nullif(trim(notes), ''), E'\n' order by entry_date, created_at), bool_or(review_status = 'para_revisar')
    into merged_notes, any_to_review from public.ledger_entries where id = any(entry_ids);

  update public.entry_splits set entry_id = target.id where entry_id = any(sources);
  insert into public.debt_payments(debt_id, entry_id, amount_cents)
    select debt_id, target.id, sum(amount_cents) from public.debt_payments where entry_id = any(entry_ids) group by debt_id
    on conflict (debt_id, entry_id) do update set amount_cents = excluded.amount_cents;
  delete from public.debt_payments where entry_id = any(sources);
  foreach source in array sources loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'ledger_entry.merged', 'ledger_entry', source::text,
      jsonb_build_object('into', target.id, 'snapshot', public.ledger_entry_snapshot(source)));
  end loop;
  delete from public.ledger_entries where id = any(sources);
  update public.ledger_entries set
    total_cents = (select sum(amount_cents) from public.entry_splits where entry_id = target.id),
    notes = left(merged_notes, 2000),
    review_status = case when any_to_review then 'para_revisar' else review_status end,
    updated_at = now()
  where id = target.id;
  if (select total_cents from public.ledger_entries where id = target.id) = 0 then
    raise exception 'Agrupados, os rateios somam zero: um lançamento não pode ter total zero';
  end if;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'ledger_entry.updated', 'ledger_entry', target.id::text,
    jsonb_build_object('before', before, 'after', public.ledger_entry_snapshot(target.id), 'reason', 'agrupado', 'merged', to_jsonb(sources)));
  return target.id;
end;
$$;

create function public.split_ledger_entry_splits(p_group_id uuid, p_split_ids uuid[]) returns integer
  language plpgsql security definer set search_path to '' as $$
declare
  ids uuid[] := public.bulk_ids(p_split_ids, 'rateio');
  entry_ids uuid[];
  entry public.ledger_entries;
  split record;
  keep uuid;
  new_id uuid;
  before jsonb;
  created integer := 0;
begin
  select coalesce(array_agg(distinct entry_id), '{}') into entry_ids from public.entry_splits where id = any(ids);
  perform public.bulk_lock_entries(p_group_id, entry_ids);
  if exists (select 1 from public.reconciliation_links where ledger_entry_id = any(entry_ids)) then
    raise exception 'Há lançamento conciliado com o extrato: desfaça a conciliação antes de desagrupar (o total mudaria)';
  end if;
  if exists (select 1 from public.debt_payments where entry_id = any(entry_ids)) then
    raise exception 'Há lançamento que paga dívida: desagrupe-o no próprio lançamento';
  end if;

  for entry in select * from public.ledger_entries where id = any(entry_ids) order by entry_date, created_at loop
    -- Fica no original o primeiro rateio não marcado; se todos foram marcados, o primeiro marcado.
    select id into keep from public.entry_splits where entry_id = entry.id order by (id = any(ids)), created_at, id limit 1;
    if (select count(*) from public.entry_splits where entry_id = entry.id and id = any(ids) and id <> keep) = 0 then continue; end if;
    before := public.ledger_entry_snapshot(entry.id);
    for split in select * from public.entry_splits where entry_id = entry.id and id = any(ids) and id <> keep order by created_at, id loop
      insert into public.ledger_entries(group_id, entry_date, name, account_id, payment_method_id, document, document_filed, total_cents,
        created_by, notes, review_status, reviewed_by, reviewed_at)
      values (entry.group_id, entry.entry_date, entry.name, entry.account_id, entry.payment_method_id, entry.document, entry.document_filed,
        split.amount_cents, auth.uid(), entry.notes, entry.review_status, entry.reviewed_by, entry.reviewed_at)
      returning id into new_id;
      update public.entry_splits set entry_id = new_id where id = split.id;
      created := created + 1;
    end loop;
    update public.ledger_entries set total_cents = (select sum(amount_cents) from public.entry_splits where entry_id = entry.id), updated_at = now()
    where id = entry.id;
    if (select total_cents from public.ledger_entries where id = entry.id) = 0 then
      raise exception 'O lançamento "%" ficaria com total zero', entry.name;
    end if;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'ledger_entry.updated', 'ledger_entry', entry.id::text,
      jsonb_build_object('before', before, 'after', public.ledger_entry_snapshot(entry.id), 'reason', 'desagrupado'));
  end loop;
  if created = 0 then raise exception 'Marque rateios de lançamentos com mais de um rateio para desagrupar'; end if;
  return created;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['merge_ledger_entries(uuid,uuid[])', 'split_ledger_entry_splits(uuid,uuid[])'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
