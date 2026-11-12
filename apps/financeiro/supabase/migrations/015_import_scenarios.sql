-- Importações reais: lançamentos digitados antes do extrato, extratos parciais seguidos do completo,
-- importação no banco errado e muitas linhas viradas em lançamentos de uma vez.
--
-- - preview_statement_lines: conferência antes de gravar (novas, já importadas, suspeitas, órfãs).
-- - delete_statement_import: desfaz uma importação inteira (desfazendo vínculos de conciliação).
-- - create_entries_from_statement_lines: cria e concilia vários lançamentos numa transação.
-- - ignore_statement_lines: ignora várias linhas com o mesmo motivo.
-- - import_statement_lines: aceita "skip" nas linhas desmarcadas na conferência.
-- - link_reconciliation: lançamentos em "A definir" passam para a conta do extrato ao vincular.

/*
  Conferência antes de importar, sem gravar nada. Mesmo formato de linhas de import_statement_lines.
  Para cada linha do arquivo (pela ordem, `index` 1-based):
    importada = já existe na conta (mesmo ID OFX + data + valor, ou mesma impressão digital): será pulada;
    suspeita  = não existe igual, mas há linha da conta com mesma data e valor que o arquivo não explica
                (típico de OFX convertido: ID e histórico mudam entre exportações);
    nova.
  Órfãs: linhas não ignoradas da conta, dentro do período, que o arquivo não traz nem como suspeita
  (ex.: lançamento pendente de um extrato parcial que sumiu ou mudou no completo).
*/
create function public.preview_statement_lines(p_account_id uuid, p_period_from date, p_period_to date, p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account_group uuid; result jsonb;
begin
  select group_id into account_group from public.accounts where id = p_account_id;
  if account_group is null or not public.can_edit_group(account_group) then raise exception 'Conta não encontrada ou sem permissão'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'Linhas inválidas'; end if;
  if jsonb_array_length(p_lines) > 10000 then raise exception 'Arquivo grande demais: no máximo 10.000 linhas por vez'; end if;

  with input as (
    select t.ord,
      (t.v->>'date')::date as line_date,
      (t.v->>'amountCents')::bigint as amount_cents,
      trim(t.v->>'description') as description,
      nullif(trim(t.v->>'externalId'), '') as external_id
    from jsonb_array_elements(p_lines) with ordinality as t(v, ord)
  ), numbered as (
    select input.*, public.statement_line_fingerprint(p_account_id, line_date, amount_cents, description,
      (row_number() over (partition by line_date, amount_cents, public.statement_description_key(description) order by ord))::int) as fingerprint
    from input
  ), exact as (
    select n.ord, coalesce(
      (select l.id from public.statement_lines l where l.account_id = p_account_id and l.fingerprint = n.fingerprint),
      (select l.id from public.statement_lines l where l.account_id = p_account_id and n.external_id is not null
        and l.external_id = n.external_id and l.line_date = n.line_date and l.amount_cents = n.amount_cents)
    ) as match_id
    from numbered n
  ), unexplained as (
    -- linhas já gravadas na conta que nenhuma linha do arquivo repete exatamente
    select l.* from public.statement_lines l
    where l.account_id = p_account_id and l.status <> 'ignorada'
      and l.line_date between coalesce(p_period_from, (select min(line_date) from input)) and coalesce(p_period_to, (select max(line_date) from input))
      and not exists (select 1 from exact e where e.match_id = l.id)
  ), classified as (
    select n.ord, n.line_date, n.amount_cents, e.match_id,
      case when e.match_id is not null then null else (
        select u.id from unexplained u where u.line_date = n.line_date and u.amount_cents = n.amount_cents order by u.id limit 1
      ) end as suspect_id
    from numbered n join exact e on e.ord = n.ord
  )
  select jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'index', c.ord,
        'status', case when c.match_id is not null then 'importada' when c.suspect_id is not null then 'suspeita' else 'nova' end,
        'matchDescription', (select l.description from public.statement_lines l where l.id = coalesce(c.match_id, c.suspect_id)),
        'matchStatus', (select l.status from public.statement_lines l where l.id = coalesce(c.match_id, c.suspect_id))
      ) order by c.ord) from classified c), '[]'::jsonb),
    'orphans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'date', u.line_date, 'description', u.description, 'amountCents', u.amount_cents, 'status', u.status
      ) order by u.line_date, u.amount_cents)
      from unexplained u where not exists (select 1 from classified c where c.suspect_id = u.id)), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Desfazer importação ------------------------------------------------------------------
-- Apaga a importação e suas linhas. Vínculos de conciliação dessas linhas são desfeitos antes
-- (os lançamentos continuam, só deixam de estar conciliados).
create function public.delete_statement_import(p_import_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  import_row public.statement_imports%rowtype;
  set_ids uuid[];
  unlinked int := 0;
  removed int;
begin
  select * into import_row from public.statement_imports where id = p_import_id for update;
  if import_row.id is null or not public.can_edit_group(import_row.group_id) then raise exception 'Importação não encontrada ou sem permissão'; end if;
  select array_agg(distinct rl.link_set_id) into set_ids
  from public.reconciliation_links rl join public.statement_lines l on l.id = rl.statement_line_id
  where l.import_id = p_import_id;
  if set_ids is not null then unlinked := public.dissolve_reconciliation_sets(set_ids, 'importação desfeita'); end if;
  delete from public.statement_lines where import_id = p_import_id;
  get diagnostics removed = row_count;
  delete from public.statement_imports where id = p_import_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (import_row.group_id, auth.uid(), 'statement.import_deleted', 'statement_import', p_import_id::text,
    jsonb_build_object('account_id', import_row.account_id, 'file_name', import_row.file_name,
      'period_from', import_row.period_from, 'period_to', import_row.period_to, 'lines', removed, 'unlinked_sets', unlinked));
  return jsonb_build_object('lines', removed, 'unlinked', unlinked);
end;
$$;

-- Criação em massa ---------------------------------------------------------------------
/*
  Cria um lançamento de uma rubrica por linha do extrato e já os concilia, tudo ou nada.
  Itens: [{ lineId, name?, paymentMethodId, categoryId?, description? }]
  Sem rubrica, entradas vão para a raiz de receitas (código 1) e saídas para a de despesas (código 2),
  para recategorizar depois. Histórico padrão: contraparte, senão o histórico do banco.
*/
create function public.create_entries_from_statement_lines(p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  idx bigint;
  line public.statement_lines%rowtype;
  category uuid;
  entry_name text;
  split_description text;
  created int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Nenhuma linha selecionada'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Crie no máximo 500 lançamentos por vez'; end if;
  for item, idx in select value, ordinality from jsonb_array_elements(p_items) with ordinality
  loop
    select * into line from public.statement_lines where id = (item->>'lineId')::uuid;
    if line.id is null then raise exception 'Item %: linha do extrato não encontrada', idx; end if;
    category := nullif(item->>'categoryId', '')::uuid;
    if category is null then
      select id into category from public.categories
      where group_id = line.group_id and active and code = case when line.amount_cents > 0 then '1' else '2' end;
      if category is null then raise exception 'Cadastre (ou reative) as rubricas raiz 1 Receitas e 2 Despesas'; end if;
    end if;
    entry_name := left(coalesce(nullif(trim(item->>'name'), ''), line.counterparty, line.description), 200);
    if char_length(entry_name) < 2 then entry_name := 'Extrato ' || to_char(line.line_date, 'DD/MM'); end if;
    split_description := left(coalesce(nullif(trim(item->>'description'), ''), line.kind, line.description), 200);
    if char_length(split_description) < 2 then split_description := 'Importado do extrato'; end if;
    begin
      perform public.create_entry_from_statement_line(line.id, line.line_date, entry_name,
        nullif(item->>'paymentMethodId', '')::uuid, null, false, line.amount_cents,
        jsonb_build_array(jsonb_build_object('category_id', category, 'amount_cents', line.amount_cents, 'description', split_description)));
    exception when others then
      raise exception 'Linha de % (%): %', to_char(line.line_date, 'DD/MM/YYYY'), left(coalesce(line.counterparty, line.description), 40), sqlerrm;
    end;
    created := created + 1;
  end loop;
  return created;
end;
$$;

-- Ignorar em massa ------------------------------------------------------------------------
create function public.ignore_statement_lines(p_ids uuid[], p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare line_id uuid; done int := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Nenhuma linha selecionada'; end if;
  if cardinality(p_ids) > 1000 then raise exception 'Seleção grande demais'; end if;
  foreach line_id in array p_ids loop
    perform public.ignore_statement_line(line_id, p_reason);
    done := done + 1;
  end loop;
  return done;
end;
$$;

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
  moved record;
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
  -- Lançamentos ainda em "A definir" (digitados sem conta) passam para a conta do extrato ao vincular.
  for moved in
    update public.ledger_entries e set account_id = first_account, updated_at = now()
    from public.accounts a
    where e.id = any(entry_ids) and a.id = e.account_id and a.name = 'A definir' and a.group_id = first_group
    returning e.id, a.id as from_account
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (first_group, auth.uid(), 'ledger_entry.account_changed', 'ledger_entry', moved.id::text,
      jsonb_build_object('from', moved.from_account, 'to', first_account, 'reason', 'conciliação'));
  end loop;
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

/*
  Importação: as linhas que a pessoa desmarcou na conferência (suspeitas) vêm com "skip": true.
  Elas continuam na lista para numerar as ocorrências da impressão digital como no arquivo inteiro;
  senão, pular uma linha mudaria a impressão digital das iguais a ela e uma próxima importação duplicaria.
*/
create or replace function public.import_statement_lines(
  p_account_id uuid, p_profile_id uuid, p_profile_settings jsonb, p_file_name text,
  p_period_from date, p_period_to date, p_opening_balance_cents bigint, p_closing_balance_cents bigint,
  p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account_group uuid;
  account_active boolean;
  used_settings jsonb := p_profile_settings;
  line jsonb;
  idx bigint;
  total int;
  inserted int;
  skipped int;
  first_date date;
  last_date date;
  new_import_id uuid;
begin
  select group_id, active into account_group, account_active from public.accounts where id = p_account_id;
  if account_group is null or not public.can_edit_group(account_group) then raise exception 'Conta não encontrada ou sem permissão'; end if;
  if not account_active then raise exception 'A conta está inativa'; end if;

  if p_profile_id is not null then
    select coalesce(used_settings, p.settings) into used_settings from public.import_profiles p where p.id = p_profile_id and p.group_id = account_group;
    if not found then raise exception 'Perfil de importação inválido'; end if;
  end if;
  if used_settings is not null and jsonb_typeof(used_settings) <> 'object' then raise exception 'Configurações do perfil inválidas'; end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Nenhuma linha para importar'; end if;
  total := jsonb_array_length(p_lines);
  if total > 10000 then raise exception 'Arquivo grande demais: importe no máximo 10.000 linhas por vez'; end if;

  for line, idx in select value, ordinality from jsonb_array_elements(p_lines) with ordinality
  loop
    if jsonb_typeof(line) <> 'object' then raise exception 'Linha %: formato inválido', idx; end if;
    if jsonb_typeof(line->'date') is distinct from 'string' or (line->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or not pg_input_is_valid(line->>'date', 'date') then
      raise exception 'Linha %: data inválida', idx;
    end if;
    if (case when jsonb_typeof(line->'amountCents') = 'number' and pg_input_is_valid(line->>'amountCents', 'bigint')
      then (line->>'amountCents')::bigint = 0 else true end) then
      raise exception 'Linha %: valor inválido (centavos inteiros, diferente de zero)', idx;
    end if;
    if jsonb_typeof(line->'description') is distinct from 'string' or char_length(trim(line->>'description')) not between 1 and 500 then
      raise exception 'Linha %: histórico obrigatório (até 500 caracteres)', idx;
    end if;
    if exists (select 1 from unnest(array['kind', 'counterparty', 'externalId', 'payee']) k
      where line ? k and jsonb_typeof(line->k) <> 'null' and (jsonb_typeof(line->k) <> 'string' or char_length(line->>k) > 200)) then
      raise exception 'Linha %: tipo, favorecido ou identificador inválido (texto de até 200 caracteres)', idx;
    end if;
    if exists (select 1 from unnest(array['trnType', 'checkNumber', 'reference']) k
      where line ? k and jsonb_typeof(line->k) <> 'null' and (jsonb_typeof(line->k) <> 'string' or char_length(line->>k) > case k when 'trnType' then 20 else 60 end)) then
      raise exception 'Linha %: TRNTYPE, CHECKNUM ou REFNUM inválido', idx;
    end if;
    if line ? 'skip' and jsonb_typeof(line->'skip') not in ('boolean', 'null') then raise exception 'Linha %: skip inválido', idx; end if;
    if line ? 'balanceCents' and jsonb_typeof(line->'balanceCents') <> 'null'
      and (jsonb_typeof(line->'balanceCents') <> 'number' or not pg_input_is_valid(line->>'balanceCents', 'bigint')) then
      raise exception 'Linha %: saldo inválido (centavos inteiros)', idx;
    end if;
  end loop;

  select min((value->>'date')::date), max((value->>'date')::date) into first_date, last_date from jsonb_array_elements(p_lines);
  if coalesce(p_period_from, first_date) > coalesce(p_period_to, last_date) then raise exception 'Período inválido'; end if;

  insert into public.statement_imports(group_id, account_id, profile_id, profile_settings, file_name, imported_by,
    period_from, period_to, opening_balance_cents, closing_balance_cents)
  values (account_group, p_account_id, p_profile_id, used_settings, coalesce(nullif(trim(p_file_name), ''), 'extrato'), auth.uid(),
    coalesce(p_period_from, first_date), coalesce(p_period_to, last_date), p_opening_balance_cents, p_closing_balance_cents)
  returning id into new_import_id;

  with input as (
    select t.ord,
      (t.v->>'date')::date as line_date,
      (t.v->>'amountCents')::bigint as amount_cents,
      trim(t.v->>'description') as description,
      nullif(trim(t.v->>'kind'), '') as kind,
      nullif(trim(t.v->>'counterparty'), '') as counterparty,
      nullif(trim(t.v->>'externalId'), '') as external_id,
      (t.v->>'balanceCents')::bigint as balance_cents,
      upper(nullif(trim(t.v->>'trnType'), '')) as trn_type,
      nullif(trim(t.v->>'checkNumber'), '') as check_number,
      nullif(trim(t.v->>'reference'), '') as reference,
      nullif(trim(t.v->>'payee'), '') as payee,
      coalesce((t.v->>'skip')::boolean, false) as skip
    from jsonb_array_elements(p_lines) with ordinality as t(v, ord)
  ), numbered as (
    select input.*, row_number() over (
      partition by line_date, amount_cents, public.statement_description_key(description) order by ord) as occurrence
    from input
  )
  insert into public.statement_lines(group_id, account_id, import_id, line_date, description, kind, counterparty,
    external_id, amount_cents, balance_cents, fingerprint, trn_type, check_number, reference, payee)
  select account_group, p_account_id, new_import_id, line_date, description, kind, counterparty,
    external_id, amount_cents, balance_cents,
    public.statement_line_fingerprint(p_account_id, line_date, amount_cents, description, occurrence::int),
    trn_type, check_number, reference, payee
  from numbered where not skip order by ord
  on conflict do nothing;
  get diagnostics inserted = row_count;
  select count(*) into skipped from jsonb_array_elements(p_lines) v where coalesce((v->>'skip')::boolean, false);

  update public.statement_imports set line_count = inserted, duplicate_count = total - skipped - inserted where id = new_import_id;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (account_group, auth.uid(), 'statement.imported', 'statement_import', new_import_id::text,
    jsonb_build_object('account_id', p_account_id, 'profile_id', p_profile_id, 'file_name', p_file_name,
      'period_from', coalesce(p_period_from, first_date), 'period_to', coalesce(p_period_to, last_date),
      'inserted', inserted, 'skipped_duplicates', total - skipped - inserted, 'skipped_by_user', skipped));

  return jsonb_build_object('import_id', new_import_id, 'inserted', inserted, 'skipped_duplicates', total - skipped - inserted,
    'skipped_by_user', skipped);
end;
$$;

revoke all on function public.preview_statement_lines(uuid, date, date, jsonb) from public;
revoke all on function public.delete_statement_import(uuid) from public;
revoke all on function public.create_entries_from_statement_lines(jsonb) from public;
revoke all on function public.ignore_statement_lines(uuid[], text) from public;
grant execute on function public.preview_statement_lines(uuid, date, date, jsonb) to authenticated;
grant execute on function public.delete_statement_import(uuid) to authenticated;
grant execute on function public.create_entries_from_statement_lines(jsonb) to authenticated;
grant execute on function public.ignore_statement_lines(uuid[], text) to authenticated;
