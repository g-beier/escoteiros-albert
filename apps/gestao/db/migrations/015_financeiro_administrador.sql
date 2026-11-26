-- 015 — Ações em lote e importação de lançamentos só para o Administrador do Financeiro; agrupar com os dados escolhidos.
--
-- O Editor do Financeiro continua lançando, editando, conciliando e importando extratos (OFX), e marca como revisado
-- um lançamento de cada vez (no próprio lançamento). Em lote (mover de conta, forma, documentos, revisar vários,
-- rubrica, associado, agrupar, desagrupar) e lancamentos.csv: só o Administrador.
-- Agrupar não escolhe mais o lançamento mais antigo: quem agrupa preenche data, histórico, conta, forma, documento,
-- pasta e observação do lançamento que resulta (a tela já traz os de um dos lançamentos, para conferir).

create function public.can_admin_finance(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.finance_role_of(p_group_id) >= 'admin';
$$;

/** Trava os lançamentos e confere que todos são do grupo e que quem chama administra o Financeiro. */
create or replace function public.bulk_lock_entries(p_group_id uuid, p_entry_ids uuid[]) returns void
  language plpgsql security definer set search_path to '' as $$
begin
  if not public.can_admin_finance(p_group_id) then raise exception 'Sem permissão: ações em lote são do administrador do Financeiro'; end if;
  perform 1 from public.ledger_entries where id = any(p_entry_ids) order by id for update;
  if (select count(*) from public.ledger_entries where id = any(p_entry_ids) and group_id = p_group_id) <> cardinality(p_entry_ids) then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;
end;
$$;

create or replace function public.move_ledger_entries_account(p_entry_ids uuid[], p_account_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  entry_ids uuid[];
  entry_count int;
  target_group uuid;
  moved record;
  moved_count int := 0;
  unlinked_count int;
begin
  select coalesce(array_agg(distinct x), '{}') into entry_ids from unnest(p_entry_ids) x where x is not null;
  entry_count := cardinality(entry_ids);
  if entry_count = 0 then raise exception 'Selecione ao menos um lançamento'; end if;
  if entry_count > 500 then raise exception 'Seleção grande demais: no máximo 500 lançamentos por vez'; end if;

  select group_id into target_group from public.accounts where id = p_account_id and active;
  if target_group is null then raise exception 'Conta inválida'; end if;
  if not public.can_admin_finance(target_group) then raise exception 'Sem permissão: ações em lote são do administrador do Financeiro'; end if;

  perform 1 from public.ledger_entries where id = any(entry_ids) order by id for update;
  if (select count(*) from public.ledger_entries where id = any(entry_ids) and group_id = target_group) <> entry_count then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;

  select count(distinct rl.link_set_id) into unlinked_count
  from public.reconciliation_links rl
  join public.ledger_entries e on e.id = rl.ledger_entry_id
  where e.id = any(entry_ids) and e.account_id <> p_account_id;

  for moved in
    update public.ledger_entries e set account_id = p_account_id, updated_at = now()
    from (select id, account_id from public.ledger_entries where id = any(entry_ids) and account_id <> p_account_id) old
    where e.id = old.id
    returning e.id, old.account_id as from_account
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (target_group, auth.uid(), 'ledger_entry.account_changed', 'ledger_entry', moved.id::text,
      jsonb_build_object('from', moved.from_account, 'to', p_account_id, 'reason', 'em lote'));
    moved_count := moved_count + 1;
  end loop;

  return jsonb_build_object('moved', moved_count, 'unchanged', entry_count - moved_count, 'unlinked', unlinked_count);
end;
$$;

/** Marca como revisados: um lançamento, o Editor (no próprio lançamento); vários de uma vez, o Administrador. */
create or replace function public.review_ledger_entries(p_group_id uuid, p_entry_ids uuid[]) returns integer
  language plpgsql security definer set search_path to '' as $$
declare done_id uuid; total integer := 0;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para revisar lançamentos neste grupo'; end if;
  if (select count(distinct x) from unnest(p_entry_ids) x) > 1 and not public.can_admin_finance(p_group_id) then
    raise exception 'Revisar em lote é do administrador do Financeiro: marque cada lançamento no próprio lançamento';
  end if;
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

drop function public.merge_ledger_entries(uuid, uuid[]);

/**
 * Agrupa os lançamentos dos rateios marcados num só, com os dados escolhidos em `p_entry` (date, name, account_id,
 * payment_method_id, document, filed, notes). O registro que continua é o do primeiro rateio marcado (os comprovantes
 * dele ficam); os rateios dos outros passam para ele, os pagamentos de dívida somam e os outros somem.
 */
create function public.merge_ledger_entries(p_group_id uuid, p_split_ids uuid[], p_entry jsonb) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare
  ids uuid[] := public.bulk_ids(p_split_ids, 'rateio');
  entry_ids uuid[];
  target_id uuid;
  sources uuid[];
  before jsonb;
  source uuid;
  any_to_review boolean;
  new_date date := nullif(p_entry->>'date', '')::date;
  new_name text := trim(coalesce(p_entry->>'name', ''));
  new_account uuid := nullif(p_entry->>'account_id', '')::uuid;
  new_method uuid := nullif(p_entry->>'payment_method_id', '')::uuid;
  new_notes text := nullif(trim(coalesce(p_entry->>'notes', '')), '');
begin
  select coalesce(array_agg(distinct entry_id), '{}') into entry_ids from public.entry_splits where id = any(ids);
  perform public.bulk_lock_entries(p_group_id, entry_ids);
  if cardinality(entry_ids) < 2 then raise exception 'Marque rateios de pelo menos dois lançamentos para agrupar'; end if;
  if new_date is null then raise exception 'Informe a data do lançamento'; end if;
  if char_length(new_name) not between 2 and 200 then raise exception 'Informe um histórico com 2 a 200 caracteres'; end if;
  if not exists (select 1 from public.accounts where id = new_account and group_id = p_group_id and active) then raise exception 'Escolha uma conta ativa'; end if;
  if not exists (select 1 from public.payment_methods where id = new_method and group_id = p_group_id and active) then raise exception 'Escolha uma forma de pagamento ativa'; end if;
  if char_length(p_entry->>'document') > 60 then raise exception 'Documento: no máximo 60 caracteres'; end if;
  if char_length(new_notes) > 2000 then raise exception 'Observações: no máximo 2.000 caracteres'; end if;
  if exists (select 1 from public.reconciliation_links where ledger_entry_id = any(entry_ids)) then
    raise exception 'Há lançamento conciliado com o extrato: desfaça a conciliação antes de agrupar';
  end if;

  -- continua o registro do primeiro rateio marcado (ordem de `p_split_ids`)
  select s.entry_id into target_id from public.entry_splits s where s.id = any(ids) order by array_position(p_split_ids, s.id) limit 1;
  sources := array_remove(entry_ids, target_id);
  if exists (select 1 from public.entry_attachments where entry_id = any(sources)) then
    raise exception 'Há comprovante num lançamento que seria agrupado: marque primeiro um rateio do lançamento que tem o comprovante';
  end if;

  before := public.ledger_entry_snapshot(target_id);
  select bool_or(review_status = 'para_revisar') into any_to_review from public.ledger_entries where id = any(entry_ids);
  update public.entry_splits set entry_id = target_id where entry_id = any(sources);
  insert into public.debt_payments(debt_id, entry_id, amount_cents)
    select debt_id, target_id, sum(amount_cents) from public.debt_payments where entry_id = any(entry_ids) group by debt_id
    on conflict (debt_id, entry_id) do update set amount_cents = excluded.amount_cents;
  delete from public.debt_payments where entry_id = any(sources);
  foreach source in array sources loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'ledger_entry.merged', 'ledger_entry', source::text,
      jsonb_build_object('into', target_id, 'snapshot', public.ledger_entry_snapshot(source)));
  end loop;
  delete from public.ledger_entries where id = any(sources);
  update public.ledger_entries set
    entry_date = new_date, name = new_name, account_id = new_account, payment_method_id = new_method,
    document = nullif(trim(coalesce(p_entry->>'document', '')), ''), document_filed = coalesce((p_entry->>'filed')::boolean, false), notes = new_notes,
    total_cents = (select sum(amount_cents) from public.entry_splits where entry_id = target_id),
    review_status = case when any_to_review then 'para_revisar' else review_status end,
    updated_at = now()
  where id = target_id;
  if (select total_cents from public.ledger_entries where id = target_id) = 0 then
    raise exception 'Agrupados, os rateios somam zero: um lançamento não pode ter total zero';
  end if;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'ledger_entry.updated', 'ledger_entry', target_id::text,
    jsonb_build_object('before', before, 'after', public.ledger_entry_snapshot(target_id), 'reason', 'agrupado', 'merged', to_jsonb(sources)));
  return target_id;
end;
$$;

-- lancamentos.csv: só o Administrador do Financeiro (o Editor importa extratos OFX na tela do Extrato).
create or replace function public.import_ledger_entries_guard(p_group_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
begin
  if not public.can_admin_finance(p_group_id) then raise exception 'Importar lançamentos é do administrador do Financeiro'; end if;
end;
$$;

create or replace function public.import_ledger_entries(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  split jsonb;
  account_id uuid;
  method_id uuid;
  associate_id uuid;
  splits jsonb;
  created integer := 0;
  new_accounts integer := 0;
  new_methods integer := 0;
begin
  perform public.import_ledger_entries_guard(p_group_id);
  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      select id into account_id from public.accounts where group_id = p_group_id and lower(name) = lower(trim(r->>'account'));
      if account_id is null then
        account_id := public.create_account(p_group_id, trim(r->>'account'), 'corrente', null, null, null, 0, null, null);
        new_accounts := new_accounts + 1;
      end if;
      select id into method_id from public.payment_methods where group_id = p_group_id and lower(name) = lower(trim(r->>'payment_method'));
      if method_id is null then
        method_id := public.create_payment_method(p_group_id, trim(r->>'payment_method'));
        new_methods := new_methods + 1;
      end if;
      splits := '[]'::jsonb;
      for split in select value from jsonb_array_elements(r->'splits') loop
        associate_id := null;
        if nullif(split->>'associate', '') is not null then
          select min(a.id::text)::uuid into associate_id from public.associates a
          where a.group_id = p_group_id and lower(a.name) = lower(trim(split->>'associate'))
          having count(*) = 1;
        end if;
        splits := splits || jsonb_build_array(jsonb_build_object(
          'category_id', split->>'category_id', 'amount_cents', (split->>'amount_cents')::bigint,
          'description', split->>'description', 'associate_id', associate_id));
      end loop;
      perform public.create_ledger_entry(p_group_id, (r->>'date')::date, r->>'name', method_id, nullif(r->>'document', ''),
        coalesce((r->>'filed')::boolean, false), (r->>'total_cents')::bigint, splits, account_id, nullif(r->>'notes', ''));
      created := created + 1;
    exception when others then
      raise exception 'lancamentos.csv, linha %: %', r->>'line', sqlerrm;
    end;
  end loop;
  return jsonb_build_object('lançamentos', created, 'contas', new_accounts, 'formas', new_methods);
end;
$$;

revoke all on function public.import_ledger_entries_guard(uuid) from public;
do $$
declare fn text;
begin
  foreach fn in array array['can_admin_finance(uuid)', 'merge_ledger_entries(uuid,uuid[],jsonb)'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
