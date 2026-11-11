-- Conciliação: vínculos entre linhas do extrato e lançamentos da mesma conta, recusas de sugestão,
-- linhas ignoradas, lançamentos "fora do extrato" e criação de lançamento a partir de uma linha.
-- Mesmo modelo de permissão da edição de lançamentos (can_edit_group); toda escrita é auditada.
--
-- Um "conjunto de vínculos" (link_set_id) é o que foi vinculado de uma vez: 1:1, 1:N (uma linha
-- paga vários lançamentos) ou N:1 (um lançamento em várias linhas). N:M ainda não é aceito.
-- A soma das linhas (com sinal) é igual à soma dos totais dos lançamentos (também com sinal:
-- entrada positiva, saída negativa, como em ledger_entries.total_cents).

alter table public.reconciliation_links add column link_set_id uuid not null default gen_random_uuid();
create index reconciliation_links_set_idx on public.reconciliation_links(link_set_id);
create index reconciliation_links_line_idx on public.reconciliation_links(statement_line_id);

-- Lançamento sem linha no extrato de propósito (ex.: caixa, acerto interno).
alter table public.ledger_entries add column outside_statement boolean not null default false;

create or replace function public.statement_line_snapshot(p_line_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('account_id', l.account_id, 'line_date', l.line_date, 'description', l.description,
    'counterparty', l.counterparty, 'amount_cents', l.amount_cents, 'status', l.status, 'ignored_reason', l.ignored_reason)
  from public.statement_lines l where l.id = p_line_id;
$$;
revoke all on function public.statement_line_snapshot(uuid) from public, anon, authenticated;

-- Desfaz conjuntos de vínculos inteiros e reabre as linhas. Uso interno (funções e gatilhos).
create or replace function public.dissolve_reconciliation_sets(p_set_ids uuid[], p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  s record;
  dissolved int := 0;
begin
  for s in
    select rl.link_set_id, min(l.group_id::text)::uuid as group_id,
      array_agg(distinct rl.statement_line_id) as line_ids, array_agg(distinct rl.ledger_entry_id) as entry_ids,
      jsonb_agg(jsonb_build_object('statement_line_id', rl.statement_line_id, 'ledger_entry_id', rl.ledger_entry_id, 'amount_cents', rl.amount_cents)) as links
    from public.reconciliation_links rl
    join public.statement_lines l on l.id = rl.statement_line_id
    where rl.link_set_id = any(p_set_ids)
    group by rl.link_set_id
  loop
    delete from public.reconciliation_links where link_set_id = s.link_set_id;
    update public.statement_lines set status = 'aberta'
    where id = any(s.line_ids) and status = 'conciliada'
      and not exists (select 1 from public.reconciliation_links rl where rl.statement_line_id = statement_lines.id);
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (s.group_id, auth.uid(), 'reconciliation.unlinked', 'reconciliation', s.link_set_id::text,
      jsonb_build_object('reason', p_reason, 'statement_line_ids', to_jsonb(s.line_ids), 'ledger_entry_ids', to_jsonb(s.entry_ids), 'links', s.links));
    dissolved := dissolved + 1;
  end loop;
  return dissolved;
end;
$$;
revoke all on function public.dissolve_reconciliation_sets(uuid[], text) from public, anon, authenticated;

-- Vincular ------------------------------------------------------------------------
create or replace function public.link_reconciliation(p_statement_line_ids uuid[], p_ledger_entry_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  line_ids uuid[];
  entry_ids uuid[];
  set_id uuid := gen_random_uuid();
  first_group uuid;
  first_account uuid;
  line_count int;
  entry_count int;
  line_sum bigint;
  entry_sum bigint;
begin
  select coalesce(array_agg(distinct x), '{}') into line_ids from unnest(p_statement_line_ids) x where x is not null;
  select coalesce(array_agg(distinct x), '{}') into entry_ids from unnest(p_ledger_entry_ids) x where x is not null;
  line_count := cardinality(line_ids);
  entry_count := cardinality(entry_ids);
  if line_count = 0 or entry_count = 0 then raise exception 'Selecione ao menos uma linha do extrato e um lançamento'; end if;
  if line_count > 1 and entry_count > 1 then
    raise exception 'Vincule uma linha a vários lançamentos ou um lançamento a várias linhas, não vários com vários';
  end if;
  if line_count > 200 or entry_count > 200 then raise exception 'Seleção grande demais'; end if;

  -- trava as linhas e os lançamentos na mesma ordem para evitar corridas
  perform 1 from public.statement_lines where id = any(line_ids) order by id for update;
  perform 1 from public.ledger_entries where id = any(entry_ids) order by id for update;

  select min(group_id::text)::uuid, min(account_id::text)::uuid into first_group, first_account
  from public.statement_lines where id = any(line_ids);
  if first_group is null or not public.can_edit_group(first_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;

  if (select count(*) from public.statement_lines where id = any(line_ids) and group_id = first_group and account_id = first_account) <> line_count then
    raise exception 'As linhas do extrato precisam ser da mesma conta';
  end if;
  if (select count(*) from public.ledger_entries where id = any(entry_ids) and group_id = first_group) <> entry_count then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;
  if exists (select 1 from public.ledger_entries where id = any(entry_ids) and account_id <> first_account) then
    raise exception 'Os lançamentos precisam ser da mesma conta do extrato';
  end if;
  if exists (select 1 from public.statement_lines where id = any(line_ids) and status <> 'aberta') then
    raise exception 'Alguma linha do extrato já foi conciliada ou ignorada';
  end if;
  if exists (select 1 from public.reconciliation_links where ledger_entry_id = any(entry_ids)) then
    raise exception 'Algum lançamento já está conciliado';
  end if;
  if exists (select 1 from public.ledger_entries where id = any(entry_ids) and outside_statement) then
    raise exception 'Algum lançamento está marcado como fora do extrato';
  end if;

  select sum(amount_cents) into line_sum from public.statement_lines where id = any(line_ids);
  select sum(total_cents) into entry_sum from public.ledger_entries where id = any(entry_ids);
  if line_sum <> entry_sum then
    raise exception 'As somas não batem: extrato % e lançamentos % (centavos)', line_sum, entry_sum;
  end if;

  -- cada lado soma o próprio valor: 1:N usa o total de cada lançamento; N:1, o valor de cada linha
  if line_count = 1 then
    insert into public.reconciliation_links(statement_line_id, ledger_entry_id, amount_cents, created_by, link_set_id)
    select line_ids[1], e.id, e.total_cents, auth.uid(), set_id from public.ledger_entries e where e.id = any(entry_ids);
  else
    insert into public.reconciliation_links(statement_line_id, ledger_entry_id, amount_cents, created_by, link_set_id)
    select l.id, entry_ids[1], l.amount_cents, auth.uid(), set_id from public.statement_lines l where l.id = any(line_ids);
  end if;

  update public.statement_lines set status = 'conciliada' where id = any(line_ids);

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (first_group, auth.uid(), 'reconciliation.linked', 'reconciliation', set_id::text,
    jsonb_build_object('account_id', first_account, 'statement_line_ids', to_jsonb(line_ids),
      'ledger_entry_ids', to_jsonb(entry_ids), 'amount_cents', line_sum));
  return set_id;
end;
$$;

-- Desfaz o conjunto inteiro de que a linha faz parte e reabre todas as linhas dele.
create or replace function public.unlink_reconciliation(p_statement_line_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare line_group uuid; set_ids uuid[];
begin
  select group_id into line_group from public.statement_lines where id = p_statement_line_id for update;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  select array_agg(distinct link_set_id) into set_ids from public.reconciliation_links where statement_line_id = p_statement_line_id;
  if set_ids is null then raise exception 'A linha não está conciliada'; end if;
  perform public.dissolve_reconciliation_sets(set_ids, 'desfeito');
end;
$$;

-- Sugestão recusada: o mesmo par não volta a ser sugerido.
create or replace function public.reject_reconciliation_suggestion(p_statement_line_id uuid, p_ledger_entry_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare line_group uuid;
begin
  select group_id into line_group from public.statement_lines where id = p_statement_line_id;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if not exists (select 1 from public.ledger_entries where id = p_ledger_entry_id and group_id = line_group) then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;
  insert into public.reconciliation_rejections(statement_line_id, ledger_entry_id, rejected_by)
  values (p_statement_line_id, p_ledger_entry_id, auth.uid())
  on conflict do nothing;
  if found then
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (line_group, auth.uid(), 'reconciliation.suggestion_rejected', 'statement_line', p_statement_line_id::text,
      jsonb_build_object('ledger_entry_id', p_ledger_entry_id));
  end if;
end;
$$;

-- Ignorar / reabrir linhas do extrato ------------------------------------------------
create or replace function public.ignore_statement_line(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare line_group uuid; line_status public.statement_line_status;
begin
  select group_id, status into line_group, line_status from public.statement_lines where id = p_id for update;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if line_status <> 'aberta' then raise exception 'Só linhas abertas podem ser ignoradas'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 200 then raise exception 'Informe o motivo (até 200 caracteres)'; end if;
  update public.statement_lines set status = 'ignorada', ignored_reason = trim(p_reason) where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (line_group, auth.uid(), 'statement_line.ignored', 'statement_line', p_id::text, jsonb_build_object('reason', trim(p_reason)));
end;
$$;

create or replace function public.reopen_statement_line(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare line_group uuid; line_status public.statement_line_status; previous_reason text;
begin
  select group_id, status, ignored_reason into line_group, line_status, previous_reason from public.statement_lines where id = p_id for update;
  if line_group is null or not public.can_edit_group(line_group) then raise exception 'Linha do extrato não encontrada ou sem permissão'; end if;
  if line_status <> 'ignorada' then raise exception 'Só linhas ignoradas podem ser reabertas (para conciliadas, desfaça o vínculo)'; end if;
  update public.statement_lines set status = 'aberta', ignored_reason = null where id = p_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (line_group, auth.uid(), 'statement_line.reopened', 'statement_line', p_id::text, jsonb_build_object('previous_reason', previous_reason));
end;
$$;

-- Criar lançamento a partir de uma linha e vinculá-los na mesma transação --------------
-- Conta e total vêm da linha; o total informado precisa ser igual ao valor da linha.
create or replace function public.create_entry_from_statement_line(
  p_statement_line_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb
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
    p_document, p_document_filed, p_total_cents, p_splits, line.account_id);
  perform public.link_reconciliation(array[line.id], array[new_entry_id]);
  return new_entry_id;
end;
$$;

-- Lançamentos: fora do extrato e troca de conta --------------------------------------
create or replace function public.set_ledger_entry_outside_statement(p_entry_id uuid, p_outside boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare entry_group uuid;
begin
  select group_id into entry_group from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  if coalesce(p_outside, false) and exists (select 1 from public.reconciliation_links where ledger_entry_id = p_entry_id) then
    raise exception 'O lançamento está conciliado com o extrato; desfaça o vínculo antes';
  end if;
  update public.ledger_entries set outside_statement = coalesce(p_outside, false), updated_at = now() where id = p_entry_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.outside_statement', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('outside_statement', coalesce(p_outside, false)));
end;
$$;

-- Trocar a conta de um lançamento (ex.: foi em dinheiro → Caixa). Um vínculo existente é desfeito pelo gatilho.
create or replace function public.set_ledger_entry_account(p_entry_id uuid, p_account_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare entry_group uuid; old_account uuid;
begin
  select group_id, account_id into entry_group, old_account from public.ledger_entries where id = p_entry_id for update;
  if entry_group is null or not public.can_edit_group(entry_group) then raise exception 'Lançamento não encontrado ou sem permissão'; end if;
  if p_account_id is null or not exists (select 1 from public.accounts where id = p_account_id and group_id = entry_group and active) then
    raise exception 'Conta inválida';
  end if;
  if p_account_id = old_account then return; end if;
  update public.ledger_entries set account_id = p_account_id, updated_at = now() where id = p_entry_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (entry_group, auth.uid(), 'ledger_entry.account_changed', 'ledger_entry', p_entry_id::text,
    jsonb_build_object('from', old_account, 'to', p_account_id));
end;
$$;

-- Gatilhos: excluir um lançamento conciliado, ou mudar seu total/conta, desfaz o conjunto
-- inteiro e reabre as linhas (senão sobrariam vínculos com somas que não batem).
create or replace function public.ledger_entry_reconciliation_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare set_ids uuid[];
begin
  select array_agg(distinct link_set_id) into set_ids from public.reconciliation_links where ledger_entry_id = old.id;
  if set_ids is not null then
    perform public.dissolve_reconciliation_sets(set_ids,
      case when tg_op = 'DELETE' then 'lançamento excluído' else 'lançamento alterado (valor ou conta)' end);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.ledger_entry_reconciliation_guard() from public, anon, authenticated;

create trigger ledger_entry_reconciliation_on_delete
before delete on public.ledger_entries
for each row execute function public.ledger_entry_reconciliation_guard();

create trigger ledger_entry_reconciliation_on_update
after update of total_cents, account_id on public.ledger_entries
for each row when (old.total_cents is distinct from new.total_cents or old.account_id is distinct from new.account_id)
execute function public.ledger_entry_reconciliation_guard();

revoke all on function public.link_reconciliation(uuid[], uuid[]) from public;
revoke all on function public.unlink_reconciliation(uuid) from public;
revoke all on function public.reject_reconciliation_suggestion(uuid, uuid) from public;
revoke all on function public.ignore_statement_line(uuid, text) from public;
revoke all on function public.reopen_statement_line(uuid) from public;
revoke all on function public.create_entry_from_statement_line(uuid, date, text, uuid, text, boolean, bigint, jsonb) from public;
revoke all on function public.set_ledger_entry_outside_statement(uuid, boolean) from public;
revoke all on function public.set_ledger_entry_account(uuid, uuid) from public;
grant execute on function public.link_reconciliation(uuid[], uuid[]) to authenticated;
grant execute on function public.unlink_reconciliation(uuid) to authenticated;
grant execute on function public.reject_reconciliation_suggestion(uuid, uuid) to authenticated;
grant execute on function public.ignore_statement_line(uuid, text) to authenticated;
grant execute on function public.reopen_statement_line(uuid) to authenticated;
grant execute on function public.create_entry_from_statement_line(uuid, date, text, uuid, text, boolean, bigint, jsonb) to authenticated;
grant execute on function public.set_ledger_entry_outside_statement(uuid, boolean) to authenticated;
grant execute on function public.set_ledger_entry_account(uuid, uuid) to authenticated;

-- Visões: status de conciliação no fim (create or replace view só aceita colunas novas no fim) ------
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
  e.name || ' ' || s.description as search_text,
  c.code as category_code,
  c.kind as category_kind,
  e.account_id,
  acc.name as account_name,
  exists (select 1 from public.reconciliation_links rl where rl.ledger_entry_id = e.id) as reconciled,
  e.outside_statement
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id;

create or replace view public.ledger_entry_rows with (security_invoker = true) as
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
  e.name || ' ' || coalesce(string_agg(s.description, ' '), '') as search_text,
  coalesce(bool_or(s.associate_id is null), false) as has_split_without_associate,
  e.account_id,
  acc.name as account_name,
  exists (select 1 from public.reconciliation_links rl where rl.ledger_entry_id = e.id) as reconciled,
  e.outside_statement
from public.ledger_entries e
join public.payment_methods pm on pm.id = e.payment_method_id
join public.accounts acc on acc.id = e.account_id
left join public.entry_splits s on s.entry_id = e.id
group by e.id, pm.name, acc.name;

-- Vínculos com os dados dos dois lados, para a seção "Vinculados" da conciliação.
create or replace view public.reconciliation_link_rows with (security_invoker = true) as
select
  rl.id as link_id,
  rl.link_set_id,
  l.group_id,
  l.account_id,
  rl.statement_line_id,
  l.line_date,
  l.description as line_description,
  l.kind as line_kind,
  l.counterparty as line_counterparty,
  l.amount_cents as line_amount_cents,
  rl.ledger_entry_id,
  e.entry_date,
  e.name as entry_name,
  e.total_cents as entry_total_cents,
  rl.amount_cents,
  rl.created_at
from public.reconciliation_links rl
join public.statement_lines l on l.id = rl.statement_line_id
join public.ledger_entries e on e.id = rl.ledger_entry_id;
