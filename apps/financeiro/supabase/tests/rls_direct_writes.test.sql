-- pgTAP: tabelas que só aceitam as funções auditadas (security definer) não têm política de escrita.
-- Nem a administração nem a tesouraria do próprio grupo conseguem INSERT/UPDATE/DELETE direto:
-- o INSERT falha com 42501 (RLS) e UPDATE/DELETE não alcançam nenhuma linha (RLS filtra em silêncio).
-- A exceção proposital é `associates` (política "editors manage associates"), coberta em rls_roles.
-- Rode com `npm run test:db` (supabase test db).
begin;
select plan(149);
\ir _fixture.psql

-- Uma linha por tabela: INSERT plausível (todas as colunas obrigatórias), filtro que alcança linhas do grupo A
-- e uma coluna para o UPDATE (set col = col).
create table tests.targets(name text primary key, ins text not null, filter text not null, col text not null);
grant select on tests.targets to authenticated;
insert into tests.targets values
  ('groups', $$insert into public.groups(name) values ('Grupo direto')$$,
    format('id = %L', :'gid_a'), 'name'),
  ('memberships', format($$insert into public.memberships(group_id, user_id, role) values (%L, '00000000-0000-0000-0000-00000000f0b1', 'admin')$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'role'),
  ('accounts', format($$insert into public.accounts(group_id, name) values (%L, 'Conta direta')$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'name'),
  ('categories', format($$insert into public.categories(group_id, name, code, kind) values (%L, 'Rubrica direta', '1.99', 'receita')$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'name'),
  ('payment_methods', format($$insert into public.payment_methods(group_id, name) values (%L, 'Forma direta')$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'name'),
  ('ledger_entries', format($$insert into public.ledger_entries(group_id, entry_date, total_cents, created_by, payment_method_id, name, account_id)
      values (%L, '2026-03-20', 100, auth.uid(), %L, 'Lançamento direto', %L)$$, :'gid_a', :'pix_a', :'acc_a'),
    format('group_id = %L', :'gid_a'), 'name'),
  ('entry_splits', format($$insert into public.entry_splits(entry_id, category_id, amount_cents, description) values (%L, %L, 1, 'rateio direto')$$, :'entry_a', :'cat_a'),
    format('entry_id = %L', :'entry_a'), 'amount_cents'),
  ('entry_attachments', format($$insert into public.entry_attachments(group_id, entry_id, storage_path, file_name, content_type, size_bytes)
      values (%L, %L, %L, 'direto.pdf', 'application/pdf', 1)$$, :'gid_a', :'entry_a', :'path_a'),
    format('group_id = %L', :'gid_a'), 'file_name'),
  ('import_profiles', format($$insert into public.import_profiles(group_id, name, format) values (%L, 'Perfil direto', 'ofx')$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'name'),
  ('statement_imports', format($$insert into public.statement_imports(group_id, account_id, file_name, period_from, period_to)
      values (%L, %L, 'direto.ofx', '2026-03-01', '2026-03-31')$$, :'gid_a', :'acc_a'),
    format('group_id = %L', :'gid_a'), 'file_name'),
  ('statement_lines', format($$insert into public.statement_lines(group_id, account_id, import_id, line_date, description, amount_cents, fingerprint)
      values (%L, %L, %L, '2026-03-20', 'Linha direta', 100, 'direta')$$, :'gid_a', :'acc_a', :'import_a'),
    format('group_id = %L', :'gid_a'), 'description'),
  ('reconciliation_links', format($$insert into public.reconciliation_links(statement_line_id, ledger_entry_id, amount_cents) values (%L, %L, -500)$$, :'line_a2', :'entry_a'),
    format('statement_line_id = %L', :'line_a'), 'amount_cents'),
  ('reconciliation_rejections', format($$insert into public.reconciliation_rejections(statement_line_id, ledger_entry_id) values (%L, %L)$$, :'line_a2', :'entry_a'),
    'true', 'rejected_at'),
  ('audit_events', format($$insert into public.audit_events(group_id, action, entity_type) values (%L, 'forjado', 'x')$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'details'),
  ('fee_settings', format($$insert into public.fee_settings(group_id) values (%L)$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'due_day'),
  ('fee_year_settings', format($$insert into public.fee_year_settings(group_id, year, monthly_cents) values (%L, 2030, 1)$$, :'gid_a'),
    format('group_id = %L', :'gid_a'), 'monthly_cents'),
  ('fee_records', format($$insert into public.fee_records(group_id, associate_id, year, month, status) values (%L, %L, 2026, 6, 'pago')$$, :'gid_a', :'assoc_a'),
    format('group_id = %L', :'gid_a'), 'status'),
  ('fee_record_splits', format($$insert into public.fee_record_splits(fee_record_id, split_id) values (%L, %L)$$, :'fee_rec_a', :'split_a'),
    format('fee_record_id = %L', :'fee_rec_a'), 'split_id'),
  ('fee_exemptions', format($$insert into public.fee_exemptions(group_id, associate_id, year, reason) values (%L, %L, 2030, 'direta')$$, :'gid_a', :'assoc_a'),
    format('group_id = %L', :'gid_a'), 'reason'),
  ('fee_associate_prices', format($$insert into public.fee_associate_prices(group_id, associate_id, year, monthly_cents, reason) values (%L, %L, 2030, 1, 'direto')$$, :'gid_a', :'assoc_a'),
    format('group_id = %L', :'gid_a'), 'reason'),
  ('associate_movements', format($$insert into public.associate_movements(group_id, associate_id, movement_date, kind) values (%L, %L, '2026-04-01', 'saida')$$, :'gid_a', :'assoc_a'),
    format('group_id = %L', :'gid_a'), 'reason');

-- reconciliation_rejections precisa de uma linha no grupo A para o UPDATE/DELETE terem alvo.
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.reject_reconciliation_suggestion(:'line_a2', :'entry_a') \gset
select tests.logout() \gset

create function tests.no_direct_writes(p_who text) returns setof text language plpgsql as $$
declare t tests.targets;
begin
  for t in select * from tests.targets order by name loop
    return next throws_ok(t.ins, '42501', null, p_who || ': sem INSERT direto em ' || t.name);
    return next is(tests.affected(format('update public.%I set %I = %I where %s', t.name, t.col, t.col, t.filter)), 0,
      p_who || ': sem UPDATE direto em ' || t.name);
    return next is(tests.affected(format('delete from public.%I where %s', t.name, t.filter)), 0,
      p_who || ': sem DELETE direto em ' || t.name);
  end loop;
end $$;
grant execute on function tests.no_direct_writes(text) to authenticated;

-- Controle: como postgres, cada filtro alcança linhas (o 0 acima vem da RLS, não de um filtro vazio).
create function tests.filters_reach_rows() returns setof text language plpgsql as $$
declare t tests.targets; n bigint;
begin
  for t in select * from tests.targets order by name loop
    execute format('select count(*) from public.%I where %s', t.name, t.filter) into n;
    return next ok(n > 0, 'controle: o filtro de ' || t.name || ' alcança linhas do grupo A');
  end loop;
end $$;
select * from tests.filters_reach_rows();

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select * from tests.no_direct_writes('administração');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select * from tests.no_direct_writes('tesouraria');

-- Bucket comprovantes: sem política de UPDATE (comprovante não é sobrescrito, é excluído e reenviado).
select is(tests.affected(format($$update storage.objects set name = name || '.x' where bucket_id = 'comprovantes' and name = %L$$, :'path_a')), 0,
  'tesouraria: sem UPDATE em storage.objects (comprovantes)');
select tests.logout() \gset
select is((select count(*)::int from storage.objects where name = :'path_a'), 1, 'arquivo continua no lugar');

select * from finish();
rollback;
