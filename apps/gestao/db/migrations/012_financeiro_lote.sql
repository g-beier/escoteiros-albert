-- 012 — Ações em lote nos lançamentos (Movimentações) e nos rateios (Detalhamento), para quem edita o Financeiro.
--
-- Já existiam em lote: mover de conta (move_ledger_entries_account) e marcar revisados (review_ledger_entries).
-- Aqui, numa transação por chamada e até 500 itens:
--   set_entries_document_filed   documentos arquivados na pasta / pendentes
--   set_entries_payment_method   forma de pagamento (não muda a conta nem a conciliação)
--   set_splits_category          rubrica dos rateios (o valor continua; o tipo da rubrica tem de servir ao sinal)
--   set_splits_associate         associado dos rateios (ou nenhum)
-- Os rateios mudam no lugar (update), e não apagando e regravando como update_ledger_entry: o vínculo com a
-- mensalidade (fee_record_splits) continua. Travas: rateio de mensalidade só vai para rubrica de mensalidade e não
-- troca de associado; lançamento que paga dívida não troca o associado dos rateios.
-- Auditoria: um `ledger_entry.updated` por lançamento alterado, com os retratos antes/depois e `reason: em lote`
-- (o histórico do lançamento mostra as diferenças campo a campo, como numa edição).

/** Ids distintos, não nulos, até 500; erro se vazio ou grande demais. */
create function public.bulk_ids(p_ids uuid[], p_what text) returns uuid[]
  language plpgsql immutable set search_path to '' as $$
declare ids uuid[];
begin
  select coalesce(array_agg(distinct x), '{}') into ids from unnest(p_ids) x where x is not null;
  if cardinality(ids) = 0 then raise exception 'Selecione ao menos um %', p_what; end if;
  if cardinality(ids) > 500 then raise exception 'Seleção grande demais: no máximo 500 de cada vez'; end if;
  return ids;
end;
$$;

/** Trava os lançamentos e confere que todos são do grupo e que quem chama edita o Financeiro. */
create function public.bulk_lock_entries(p_group_id uuid, p_entry_ids uuid[]) returns void
  language plpgsql security definer set search_path to '' as $$
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar lançamentos'; end if;
  perform 1 from public.ledger_entries where id = any(p_entry_ids) order by id for update;
  if (select count(*) from public.ledger_entries where id = any(p_entry_ids) and group_id = p_group_id) <> cardinality(p_entry_ids) then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;
end;
$$;

/** Retratos antes (já gravados em `before`) e depois de cada lançamento que mudou → auditoria. */
create function public.bulk_audit_entries(p_group_id uuid, p_before jsonb) returns integer
  language plpgsql security definer set search_path to '' as $$
declare item record; after jsonb; changed integer := 0;
begin
  for item in select key::uuid as id, value as snapshot from jsonb_each(p_before) loop
    after := public.ledger_entry_snapshot(item.id);
    if after = item.snapshot then continue; end if;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'ledger_entry.updated', 'ledger_entry', item.id::text,
      jsonb_build_object('before', item.snapshot, 'after', after, 'reason', 'em lote'));
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;

create function public.bulk_snapshots(p_entry_ids uuid[]) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_object_agg(id::text, public.ledger_entry_snapshot(id)), '{}'::jsonb) from unnest(p_entry_ids) id;
$$;

create function public.set_entries_document_filed(p_group_id uuid, p_entry_ids uuid[], p_filed boolean) returns integer
  language plpgsql security definer set search_path to '' as $$
declare ids uuid[] := public.bulk_ids(p_entry_ids, 'lançamento'); changed record; total integer := 0;
begin
  if p_filed is null then raise exception 'Escolha arquivado ou pendente'; end if;
  perform public.bulk_lock_entries(p_group_id, ids);
  for changed in update public.ledger_entries set document_filed = p_filed, updated_at = now()
                 where id = any(ids) and document_filed <> p_filed returning id loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'ledger_entry.document_filed', 'ledger_entry', changed.id::text, jsonb_build_object('filed', p_filed, 'reason', 'em lote'));
    total := total + 1;
  end loop;
  return total;
end;
$$;

create function public.set_entries_payment_method(p_group_id uuid, p_entry_ids uuid[], p_payment_method_id uuid) returns integer
  language plpgsql security definer set search_path to '' as $$
declare ids uuid[] := public.bulk_ids(p_entry_ids, 'lançamento'); before jsonb;
begin
  perform public.bulk_lock_entries(p_group_id, ids);
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and group_id = p_group_id and active) then
    raise exception 'Forma de pagamento inválida ou inativa';
  end if;
  select public.bulk_snapshots(array_agg(id)) into before from public.ledger_entries where id = any(ids) and payment_method_id <> p_payment_method_id;
  if before is null or before = '{}'::jsonb then return 0; end if;
  update public.ledger_entries set payment_method_id = p_payment_method_id, updated_at = now() where id = any(ids) and payment_method_id <> p_payment_method_id;
  return public.bulk_audit_entries(p_group_id, before);
end;
$$;

create function public.set_splits_category(p_group_id uuid, p_split_ids uuid[], p_category_id uuid) returns integer
  language plpgsql security definer set search_path to '' as $$
declare
  ids uuid[] := public.bulk_ids(p_split_ids, 'rateio');
  entry_ids uuid[];
  target public.categories;
  fees uuid[] := public.fee_category_ids(p_group_id);
  bad record;
  before jsonb;
begin
  select coalesce(array_agg(distinct entry_id), '{}') into entry_ids from public.entry_splits where id = any(ids);
  perform public.bulk_lock_entries(p_group_id, entry_ids);
  if (select count(*) from public.entry_splits where id = any(ids)) <> cardinality(ids) then raise exception 'Rateio não encontrado'; end if;
  select * into target from public.categories where id = p_category_id and group_id = p_group_id and active;
  if target.id is null then raise exception 'Rubrica inválida ou inativa'; end if;

  select s.amount_cents, e.name into bad from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id
  where s.id = any(ids) and ((target.kind = 'receita' and s.amount_cents < 0) or (target.kind = 'despesa' and s.amount_cents > 0)) limit 1;
  if found then
    raise exception 'A rubrica % é de %, mas há rateio de % (em "%"): selecione só rateios do mesmo tipo',
      target.name, target.kind, case when bad.amount_cents < 0 then 'saída' else 'entrada' end, bad.name;
  end if;
  if not (target.id = any(fees)) and exists (select 1 from public.fee_record_splits f where f.split_id = any(ids) and f.split_id in (
      select id from public.entry_splits where id = any(ids) and category_id <> p_category_id)) then
    raise exception 'Há rateios ligados a mensalidades: eles só podem ir para uma rubrica de mensalidade';
  end if;

  select public.bulk_snapshots(array_agg(distinct entry_id)) into before from public.entry_splits where id = any(ids) and category_id <> p_category_id;
  if before is null or before = '{}'::jsonb then return 0; end if;
  update public.entry_splits set category_id = p_category_id where id = any(ids) and category_id <> p_category_id;
  return public.bulk_audit_entries(p_group_id, before);
end;
$$;

create function public.set_splits_associate(p_group_id uuid, p_split_ids uuid[], p_associate_id uuid) returns integer
  language plpgsql security definer set search_path to '' as $$
declare ids uuid[] := public.bulk_ids(p_split_ids, 'rateio'); entry_ids uuid[]; before jsonb;
begin
  select coalesce(array_agg(distinct entry_id), '{}') into entry_ids from public.entry_splits where id = any(ids);
  perform public.bulk_lock_entries(p_group_id, entry_ids);
  if (select count(*) from public.entry_splits where id = any(ids)) <> cardinality(ids) then raise exception 'Rateio não encontrado'; end if;
  if p_associate_id is not null and not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id and active) then
    raise exception 'Associado inválido ou desligado';
  end if;
  if exists (select 1 from public.fee_record_splits f join public.entry_splits s on s.id = f.split_id
             where s.id = any(ids) and s.associate_id is distinct from p_associate_id) then
    raise exception 'Há rateios ligados a mensalidades: troque o associado pela tela de Mensalidades';
  end if;
  if exists (select 1 from public.entry_splits s join public.debt_payments p on p.entry_id = s.entry_id
             where s.id = any(ids) and s.associate_id is distinct from p_associate_id) then
    raise exception 'Há lançamentos que pagam dívidas: troque o associado no próprio lançamento';
  end if;

  select public.bulk_snapshots(array_agg(distinct entry_id)) into before from public.entry_splits where id = any(ids) and associate_id is distinct from p_associate_id;
  if before is null or before = '{}'::jsonb then return 0; end if;
  update public.entry_splits set associate_id = p_associate_id where id = any(ids) and associate_id is distinct from p_associate_id;
  return public.bulk_audit_entries(p_group_id, before);
end;
$$;

revoke all on function public.bulk_ids(uuid[], text) from public;
revoke all on function public.bulk_lock_entries(uuid, uuid[]) from public;
revoke all on function public.bulk_audit_entries(uuid, jsonb) from public;
revoke all on function public.bulk_snapshots(uuid[]) from public;
do $$
declare fn text;
begin
  foreach fn in array array['set_entries_document_filed(uuid,uuid[],boolean)', 'set_entries_payment_method(uuid,uuid[],uuid)',
    'set_splits_category(uuid,uuid[],uuid)', 'set_splits_associate(uuid,uuid[],uuid)'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
