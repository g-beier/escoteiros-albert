-- pgTAP: isolamento entre grupos. O admin do grupo B (o papel mais forte) não lê nem escreve nada do grupo A,
-- nem por SELECT/INSERT/UPDATE/DELETE direto (RLS), nem pelas funções auditadas, nem no bucket `comprovantes`.
-- Rode com `npm run test:db` (supabase test db). Tudo dentro de begin/rollback.
begin;
select plan(69);
\ir _fixture.psql

-- Controle: a consulta do grupo A enxerga os dados (os "zero" abaixo não são vazios por acaso).
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select ok((select count(*) from public.ledger_entries where group_id = :'gid_a') = 1
  and (select count(*) from public.entry_splits where entry_id = :'entry_a') = 1
  and (select count(*) from public.statement_lines where group_id = :'gid_a') = 2
  and (select count(*) from public.entry_attachments where group_id = :'gid_a') = 1
  and (select count(*) from public.fee_records where group_id = :'gid_a') = 1
  and (select count(*) from storage.objects where bucket_id = 'comprovantes' and name = :'path_a') = 1,
  'controle: membro do grupo A vê os dados de A');

-- ---------------------------------------------------------------- leitura
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select ok((select count(*) from public.ledger_entries where group_id = :'gid_b') = 1, 'controle: admin de B vê o próprio lançamento');

select is((select count(*)::int from public.groups where id = :'gid_a'), 0, 'B não lê groups de A');
select is((select count(*)::int from public.memberships where group_id = :'gid_a'), 0, 'B não lê memberships de A');
select is((select count(*)::int from public.accounts where group_id = :'gid_a'), 0, 'B não lê accounts de A');
select is((select count(*)::int from public.categories where group_id = :'gid_a'), 0, 'B não lê categories de A');
select is((select count(*)::int from public.payment_methods where group_id = :'gid_a'), 0, 'B não lê payment_methods de A');
select is((select count(*)::int from public.associates where group_id = :'gid_a'), 0, 'B não lê associates de A');
select is((select count(*)::int from public.associate_movements where group_id = :'gid_a'), 0, 'B não lê associate_movements de A');
select is((select count(*)::int from public.ledger_entries where group_id = :'gid_a'), 0, 'B não lê ledger_entries de A');
select is((select count(*)::int from public.entry_splits where entry_id = :'entry_a'), 0, 'B não lê entry_splits de A');
select is((select count(*)::int from public.ledger_entry_rows where group_id = :'gid_a'), 0, 'B não lê ledger_entry_rows de A');
select is((select count(*)::int from public.entry_split_rows where entry_id = :'entry_a'), 0, 'B não lê entry_split_rows de A');
select is((select count(*)::int from public.entry_attachments where group_id = :'gid_a'), 0, 'B não lê entry_attachments de A');
select is((select count(*)::int from public.import_profiles where group_id = :'gid_a'), 0, 'B não lê import_profiles de A');
select is((select count(*)::int from public.statement_imports where group_id = :'gid_a'), 0, 'B não lê statement_imports de A');
select is((select count(*)::int from public.statement_lines where group_id = :'gid_a'), 0, 'B não lê statement_lines de A');
select is((select count(*)::int from public.reconciliation_links where ledger_entry_id = :'entry_a'), 0, 'B não lê reconciliation_links de A');
select is((select count(*)::int from public.fee_settings where group_id = :'gid_a'), 0, 'B não lê fee_settings de A');
select is((select count(*)::int from public.fee_year_settings where group_id = :'gid_a'), 0, 'B não lê fee_year_settings de A');
select is((select count(*)::int from public.fee_records where group_id = :'gid_a'), 0, 'B não lê fee_records de A');
select is((select count(*)::int from public.fee_record_splits where fee_record_id = :'fee_rec_a'), 0, 'B não lê fee_record_splits de A');
select is((select count(*)::int from public.fee_exemptions where group_id = :'gid_a'), 0, 'B não lê fee_exemptions de A');
select is((select count(*)::int from public.fee_associate_prices where group_id = :'gid_a'), 0, 'B não lê fee_associate_prices de A');
select is((select count(*)::int from public.audit_events where group_id = :'gid_a'), 0, 'admin de B não lê audit_events de A');
select is((select count(*)::int from storage.objects where bucket_id = 'comprovantes' and name like :'gid_a' || '/%'), 0,
  'B não lê arquivos de A no bucket comprovantes');
select is((select count(*)::int from public.ledger_entry_history(:'entry_a')), 0, 'B não lê o histórico de um lançamento de A');
select throws_like(format($$select public.account_balance_before(%L, '2026-12-31')$$, :'acc_a'), 'Conta não encontrada',
  'B não calcula o saldo de uma conta de A');

-- ---------------------------------------------------------------- escrita direta (RLS)
select throws_ok(format($$insert into public.associates(group_id, name, branch) values (%L, 'Intruso', 'adulto')$$, :'gid_a'),
  '42501', null, 'B não insere associado em A');
select is(tests.affected(format($$update public.associates set name = 'Hackeado' where id = %L$$, :'assoc_a')), 0, 'B não altera associado de A');
select is(tests.affected(format($$delete from public.associates where id = %L$$, :'assoc_a')), 0, 'B não exclui associado de A');
select is(tests.affected(format($$update public.ledger_entries set name = 'Hackeado' where id = %L$$, :'entry_a')), 0, 'B não altera lançamento de A');
select is(tests.affected(format($$delete from public.ledger_entries where id = %L$$, :'entry_a')), 0, 'B não exclui lançamento de A');
select is(tests.affected(format($$update public.entry_splits set amount_cents = 1 where entry_id = %L$$, :'entry_a')), 0, 'B não altera rateio de A');
select is(tests.affected(format($$update public.statement_lines set status = 'ignorada' where group_id = %L$$, :'gid_a')), 0, 'B não altera extrato de A');
select is(tests.affected(format($$delete from public.memberships where group_id = %L$$, :'gid_a')), 0, 'B não remove membros de A');
select throws_ok(format($$insert into public.memberships(group_id, user_id, role) values (%L, '00000000-0000-0000-0000-00000000f0b1', 'admin')$$, :'gid_a'),
  '42501', null, 'B não se insere como membro de A');
select throws_ok(format($$insert into storage.objects(bucket_id, name, metadata) values ('comprovantes', %L, '{}')$$,
  :'gid_a' || '/' || :'entry_a' || '/' || gen_random_uuid() || '.pdf'), '42501', null, 'B não envia arquivo para a pasta de A');
select throws_ok(format($$insert into storage.objects(bucket_id, name, metadata) values ('comprovantes', %L, '{}')$$,
  :'gid_b' || '/' || :'entry_a' || '/' || gen_random_uuid() || '.pdf'), '42501', null, 'B não envia arquivo de um lançamento de A pela própria pasta');
-- A API do Storage libera o DELETE com storage.allow_delete_query e apaga como o usuário (RLS vale).
set local storage.allow_delete_query = 'true';
select is(tests.affected(format($$delete from storage.objects where bucket_id = 'comprovantes' and name = %L$$, :'path_a')), 0, 'B não apaga arquivo de A');
reset storage.allow_delete_query;
select is(tests.affected(format($$update storage.objects set name = name || '.x' where bucket_id = 'comprovantes' and name = %L$$, :'path_a')), 0, 'B não renomeia arquivo de A');

-- ---------------------------------------------------------------- escrita pelas funções
select throws_like(format($$select public.create_ledger_entry(%L, '2026-03-15', 'Intruso', %L, null, false, 100,
  '[{"category_id":"%s","amount_cents":100,"description":"material"}]', %L)$$, :'gid_a', :'pix_a', :'cat_a', :'acc_a'),
  '%permissão%', 'B não cria lançamento em A');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-03-15', 'Mistura', %L, null, false, 100,
  '[{"category_id":"%s","amount_cents":100,"description":"material"}]', %L)$$, :'gid_b', :'pix_b', :'cat_a', :'acc_b'), 'Rubrica inválida', 'B não usa rubrica de A num lançamento seu');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-03-15', 'Mistura', %L, null, false, 100,
  '[{"category_id":"%s","amount_cents":100,"description":"material"}]', %L)$$, :'gid_b', :'pix_b', :'cat_b', :'acc_a'), 'Conta inválida', 'B não usa conta de A num lançamento seu');
select throws_like(format($$select public.update_ledger_entry(%L, '2026-03-10', 'Hackeado', %L, null, false, 3000,
  '[{"category_id":"%s","amount_cents":3000,"description":"material"}]', %L)$$, :'entry_a', :'pix_a', :'cat_a', :'acc_a'), '%permissão%', 'B não edita lançamento de A');
select throws_like(format($$select public.delete_ledger_entry(%L)$$, :'entry_a'), '%permissão%', 'B não exclui lançamento de A');
select throws_like(format($$select public.set_entry_document_filed(%L, true)$$, :'entry_a'), '%permissão%', 'B não marca documento de A');
select throws_like(format($$select public.move_ledger_entries_account(array[%L]::uuid[], %L)$$, :'entry_a', :'acc_b'), '%permissão%',
  'B não move lançamento de A');
select throws_like(format($$select public.move_ledger_entries_account(array[%L]::uuid[], %L)$$, :'entry_b', :'acc_a'), '%permissão%',
  'B não move lançamento seu para conta de A');
select throws_like(format($$select public.create_account(%L, 'Intrusa', 'corrente', null, null, null, 0, null, null)$$, :'gid_a'), '%permissão%',
  'B não cria conta em A');
select throws_like(format($$select public.update_account(%L, 'Hackeada', 'corrente', null, null, null, 0, null, null)$$, :'acc_a'), '%permissão%',
  'B não altera conta de A');
select throws_like(format($$select public.create_category(%L, '1.9', 'Intrusa', null)$$, :'gid_a'), '%permissão%', 'B não cria rubrica em A');
select throws_like(format($$select public.update_category(%L, 'Hackeada', null)$$, :'cat_a'), '%permissão%', 'B não altera rubrica de A');
select throws_like(format($$select public.create_payment_method(%L, 'Intrusa')$$, :'gid_a'), '%permissão%', 'B não cria forma de pagamento em A');
select throws_like(format($$select public.set_payment_method_active(%L, false)$$, :'pix_a'), '%permissão%', 'B não desativa forma de pagamento de A');
select throws_like(format($$select public.import_statement_lines(%L, null, null, 'x.ofx', '2026-03-01', '2026-03-31', null, null,
  '[{"date":"2026-03-20","amountCents":100,"description":"Intruso","externalId":"X1"}]')$$, :'acc_a'), '%permissão%', 'B não importa extrato em A');
select throws_like(format($$select public.delete_statement_import(%L)$$, :'import_a'), '%permissão%', 'B não desfaz importação de A');
select throws_like(format($$select public.ignore_statement_lines(array[%L]::uuid[], 'x')$$, :'line_a2'), '%permissão%', 'B não ignora linha de A');
select throws_like(format($$select public.unlink_reconciliation(%L)$$, :'line_a'), '%permissão%', 'B não desfaz conciliação de A');
select throws_like(format($$select public.link_reconciliation(array[%L]::uuid[], array[%L]::uuid[])$$, :'line_a2', :'entry_b'), '%permissão%',
  'B não concilia linha de A com lançamento seu');
select throws_like(format($$select public.add_entry_attachment(%L, %L, 'x.pdf')$$, :'entry_a', :'path_a'), '%permissão%', 'B não registra anexo em A');
select throws_like(format($$select public.delete_entry_attachment(%L)$$, :'attach_a'), '%permissão%', 'B não exclui anexo de A');
select throws_like(format($$select public.import_associates(%L, '[{"name":"Intruso","branch":"adulto"}]')$$, :'gid_a'), '%permissão%',
  'B não importa associados em A');
select throws_like(format($$select public.set_fee_record(%L, 2026, 4, 'pago', null, '{}')$$, :'assoc_a'), '%permissão%', 'B não registra mensalidade em A');
select throws_like(format($$select public.set_fee_settings(%L, 'dia_fixo', 5, null)$$, :'gid_a'), '%permissão%', 'B não configura mensalidades de A');
select throws_like(format($$select public.save_import_profile(%L, null, 'Intruso', 'ofx', null, '{}')$$, :'gid_a'), '%permissão%',
  'B não cria perfil de importação em A');
select throws_like(format($$select public.admin_change_member_role(%L, '00000000-0000-0000-0000-00000000f0a3', 'admin')$$, :'gid_a'), 'Apenas administradores%',
  'admin de B não muda papel em A');
select throws_like(format($$select public.admin_remove_member(%L, '00000000-0000-0000-0000-00000000f0a3')$$, :'gid_a'), 'Apenas administradores%',
  'admin de B não remove membro de A');

-- ---------------------------------------------------------------- nada mudou em A
select tests.logout() \gset
select ok((select name from public.ledger_entries where id = :'entry_a') = 'Lançamento RLS A'
  and (select name from public.associates where id = :'assoc_a') = 'Associado RLS A'
  and (select count(*) from public.memberships where group_id = :'gid_a') = 3
  and (select count(*) from storage.objects where name = :'path_a') = 1
  and (select count(*) from public.statement_lines where group_id = :'gid_a' and status = 'aberta') = 1,
  'dados de A intactos depois das tentativas de B');

select * from finish();
rollback;
