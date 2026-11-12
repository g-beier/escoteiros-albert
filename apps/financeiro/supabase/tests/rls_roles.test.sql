-- pgTAP: papéis dentro do mesmo grupo (A). Consulta lê tudo e não escreve nada; tesouraria escreve
-- lançamentos, cadastros, extrato e associados, mas não administra usuários nem lê a auditoria;
-- administração faz tudo, inclusive papéis e remoções. Rode com `npm run test:db` (supabase test db).
begin;
select plan(68);
\ir _fixture.psql

-- ================================================================ consulta (viewer)
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset

select ok(exists(select 1 from public.groups where id = :'gid_a'), 'consulta lê groups');
select is((select count(*)::int from public.memberships where group_id = :'gid_a'), 3, 'consulta lê memberships do grupo');
select ok(exists(select 1 from public.accounts where id = :'acc_a'), 'consulta lê accounts');
select ok(exists(select 1 from public.categories where id = :'cat_a'), 'consulta lê categories');
select ok(exists(select 1 from public.payment_methods where id = :'pix_a'), 'consulta lê payment_methods');
select ok(exists(select 1 from public.associates where id = :'assoc_a'), 'consulta lê associates');
select ok(exists(select 1 from public.associate_movements where associate_id = :'assoc_a'), 'consulta lê associate_movements');
select ok(exists(select 1 from public.ledger_entry_rows where entry_id = :'entry_a'), 'consulta lê ledger_entry_rows');
select ok(exists(select 1 from public.entry_split_rows where entry_id = :'entry_a'), 'consulta lê entry_split_rows');
select ok(exists(select 1 from public.entry_attachments where id = :'attach_a'), 'consulta lê entry_attachments');
select ok(exists(select 1 from storage.objects where bucket_id = 'comprovantes' and name = :'path_a'), 'consulta lê o arquivo no bucket');
select ok(exists(select 1 from public.import_profiles where id = :'profile_a'), 'consulta lê import_profiles');
select ok(exists(select 1 from public.statement_imports where id = :'import_a'), 'consulta lê statement_imports');
select ok(exists(select 1 from public.reconciliation_links where statement_line_id = :'line_a'), 'consulta lê reconciliation_links');
select ok(exists(select 1 from public.fee_settings where group_id = :'gid_a')
  and exists(select 1 from public.fee_year_settings where group_id = :'gid_a')
  and exists(select 1 from public.fee_records where id = :'fee_rec_a')
  and exists(select 1 from public.fee_record_splits where fee_record_id = :'fee_rec_a')
  and exists(select 1 from public.fee_exemptions where associate_id = :'assoc_a')
  and exists(select 1 from public.fee_associate_prices where associate_id = :'assoc_a'), 'consulta lê fee_*');
select ok((select count(*) from public.ledger_entry_history(:'entry_a')) > 0, 'consulta lê o histórico do lançamento');
select is((select count(*)::int from public.audit_events), 0, 'consulta não lê audit_events');

select throws_like(format($$select public.create_ledger_entry(%L, '2026-03-15', 'Consulta', %L, null, false, 100,
  '[{"category_id":"%s","amount_cents":100,"description":"material"}]', %L)$$, :'gid_a', :'pix_a', :'cat_a', :'acc_a'),
  '%permissão%', 'consulta não cria lançamento');
select throws_like(format($$select public.update_ledger_entry(%L, '2026-03-10', 'Consulta', %L, null, false, 3000,
  '[{"category_id":"%s","amount_cents":3000,"description":"material"}]', %L)$$, :'entry_a', :'pix_a', :'cat_a', :'acc_a'),
  '%permissão%', 'consulta não edita lançamento');
select throws_like(format($$select public.delete_ledger_entry(%L)$$, :'entry_a'), '%permissão%', 'consulta não exclui lançamento');
select throws_like(format($$select public.set_entry_document_filed(%L, true)$$, :'entry_a'), '%permissão%', 'consulta não marca documento');
select throws_like(format($$select public.move_ledger_entries_account(array[%L]::uuid[], %L)$$, :'entry_a', :'acc_a'), '%permissão%',
  'consulta não move lançamentos');
select throws_like(format($$select public.create_account(%L, 'Consulta', 'corrente', null, null, null, 0, null, null)$$, :'gid_a'),
  '%permissão%', 'consulta não cria conta');
select throws_like(format($$select public.set_account_active(%L, false)$$, :'acc_a'), '%permissão%', 'consulta não desativa conta');
select throws_like(format($$select public.create_category(%L, '1.9', 'Consulta', null)$$, :'gid_a'), '%permissão%', 'consulta não cria rubrica');
select throws_like(format($$select public.create_payment_method(%L, 'Consulta')$$, :'gid_a'), '%permissão%', 'consulta não cria forma de pagamento');
select throws_like(format($$select public.import_statement_lines(%L, null, null, 'x.ofx', '2026-03-01', '2026-03-31', null, null,
  '[{"date":"2026-03-20","amountCents":100,"description":"Consulta","externalId":"X1"}]')$$, :'acc_a'), '%permissão%', 'consulta não importa extrato');
select throws_like(format($$select public.ignore_statement_lines(array[%L]::uuid[], 'x')$$, :'line_a2'), '%permissão%', 'consulta não ignora linha');
select throws_like(format($$select public.unlink_reconciliation(%L)$$, :'line_a'), '%permissão%', 'consulta não desfaz conciliação');
select throws_like(format($$select public.delete_entry_attachment(%L)$$, :'attach_a'), '%permissão%', 'consulta não exclui anexo');
select throws_like(format($$select public.import_associates(%L, '[{"name":"Consulta","branch":"adulto"}]')$$, :'gid_a'), '%permissão%',
  'consulta não importa associados');
select throws_like(format($$select public.set_fee_record(%L, 2026, 4, 'pago', null, '{}')$$, :'assoc_a'), '%permissão%',
  'consulta não registra mensalidade');
select throws_like(format($$select public.save_import_profile(%L, null, 'Consulta', 'ofx', null, '{}')$$, :'gid_a'), '%permissão%',
  'consulta não cria perfil de importação');
select throws_ok(format($$insert into public.associates(group_id, name, branch) values (%L, 'Consulta', 'adulto')$$, :'gid_a'),
  '42501', null, 'consulta não insere associado direto');
select is(tests.affected(format($$update public.associates set name = 'Consulta' where id = %L$$, :'assoc_a')), 0,
  'consulta não altera associado direto');
select throws_ok(format($$insert into storage.objects(bucket_id, name, metadata) values ('comprovantes', %L, '{}')$$,
  :'gid_a' || '/' || :'entry_a' || '/' || gen_random_uuid() || '.pdf'), '42501', null, 'consulta não envia arquivo');
set local storage.allow_delete_query = 'true';
select is(tests.affected(format($$delete from storage.objects where bucket_id = 'comprovantes' and name = %L$$, :'path_a')), 0,
  'consulta não apaga arquivo');
reset storage.allow_delete_query;
select throws_like(format($$select public.record_user_invite(%L, '00000000-0000-0000-0000-00000000f0a3', 'viewer')$$, :'gid_a'),
  'Apenas administradores%', 'consulta não registra convite');
select throws_like(format($$select public.admin_change_member_role(%L, '00000000-0000-0000-0000-00000000f0a3', 'admin')$$, :'gid_a'),
  'Apenas administradores%', 'consulta não se promove');

-- ================================================================ tesouraria (treasurer)
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select is((select count(*)::int from public.audit_events), 0, 'tesouraria não lê audit_events');
select lives_ok(format($$select public.create_ledger_entry(%L, '2026-03-15', 'Tesouraria', %L, null, false, 100,
  '[{"category_id":"%s","amount_cents":100,"description":"material"}]', %L)$$, :'gid_a', :'pix_a', :'cat_a', :'acc_a'),
  'tesouraria cria lançamento');
select lives_ok(format($$select public.set_entry_document_filed(%L, true)$$, :'entry_a'), 'tesouraria marca documento');
select lives_ok(format($$select public.create_account(%L, 'Conta Tesouraria', 'caixa', null, null, null, 0, null, null)$$, :'gid_a'),
  'tesouraria cria conta');
select lives_ok(format($$select public.create_category(%L, '1.9', 'Rubrica Tesouraria', null)$$, :'gid_a'), 'tesouraria cria rubrica');
select lives_ok(format($$select public.create_payment_method(%L, 'Forma Tesouraria')$$, :'gid_a'), 'tesouraria cria forma de pagamento');
select lives_ok(format($$select public.ignore_statement_lines(array[%L]::uuid[], 'tarifa')$$, :'line_a2'), 'tesouraria ignora linha do extrato');
select lives_ok(format($$insert into public.associates(group_id, name, branch) values (%L, 'Novo Tesouraria', 'adulto')$$, :'gid_a'),
  'tesouraria insere associado direto (política editors manage associates)');
select is(tests.affected(format($$update public.associates set section = 'Alcateia' where id = %L$$, :'assoc_a')), 1,
  'tesouraria altera associado direto');
select lives_ok(format($$select public.set_fee_record(%L, 2026, 4, 'atencao', 'metade', '{}')$$, :'assoc_a'), 'tesouraria registra mensalidade');
select throws_like(format($$select public.record_user_invite(%L, '00000000-0000-0000-0000-00000000f0a3', 'viewer')$$, :'gid_a'),
  'Apenas administradores%', 'tesouraria não registra convite');
select throws_like(format($$select public.admin_change_member_role(%L, '00000000-0000-0000-0000-00000000f0a2', 'admin')$$, :'gid_a'),
  'Apenas administradores%', 'tesouraria não se promove');
select throws_like(format($$select public.admin_remove_member(%L, '00000000-0000-0000-0000-00000000f0a3')$$, :'gid_a'),
  'Apenas administradores%', 'tesouraria não remove membro');
select lives_ok(format($$select public.rename_import_profile(%L, 'Perfil RLS A renomeado')$$, :'profile_a'), 'tesouraria renomeia perfil de importação');

-- ================================================================ administração (admin)
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select ok((select count(*) from public.audit_events where group_id = :'gid_a') > 0, 'administração lê audit_events do grupo');
select lives_ok(format($$select public.record_user_invite(%L, '00000000-0000-0000-0000-00000000f0a3', 'viewer')$$, :'gid_a'),
  'administração registra convite');
select lives_ok(format($$select public.admin_change_member_role(%L, '00000000-0000-0000-0000-00000000f0a3', 'treasurer')$$, :'gid_a'),
  'administração muda papel');
select is((select role::text from public.memberships where user_id = '00000000-0000-0000-0000-00000000f0a3'), 'treasurer', 'papel mudou');
select throws_like(format($$select public.admin_change_member_role(%L, '00000000-0000-0000-0000-00000000f0a1', 'viewer')$$, :'gid_a'),
  'Você não pode remover sua própria função%', 'administração não rebaixa a si mesma');
select throws_like(format($$select public.admin_remove_member(%L, '00000000-0000-0000-0000-00000000f0a1')$$, :'gid_a'),
  'Você não pode remover seu próprio acesso', 'administração não remove a si mesma');
select throws_like(format($$select public.admin_change_member_role(%L, '00000000-0000-0000-0000-00000000f0b1', 'viewer')$$, :'gid_a'),
  'Usuário não encontrado no grupo', 'administração não muda papel de quem não é do grupo');
select lives_ok(format($$select public.delete_import_profile(%L)$$, :'profile_a'), 'administração exclui perfil de importação');
select lives_ok(format($$select public.admin_remove_member(%L, '00000000-0000-0000-0000-00000000f0a3')$$, :'gid_a'),
  'administração remove membro');

-- quem foi removido perde o acesso na hora
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select is((select count(*)::int from public.ledger_entries where group_id = :'gid_a'), 0, 'removido não lê mais lançamentos');
select is((select count(*)::int from storage.objects where bucket_id = 'comprovantes'), 0, 'removido não lê mais arquivos');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-03-15', 'Removido', %L, null, false, 100,
  '[{"category_id":"%s","amount_cents":100,"description":"material"}]', %L)$$, :'gid_a', :'pix_a', :'cat_a', :'acc_a'),
  '%permissão%', 'removido não cria lançamento');

-- ================================================================ auditoria das ações acima (lida como postgres)
select tests.logout() \gset
select is((select count(*)::int from public.audit_events where group_id = :'gid_a' and action = 'user.invited'
  and actor_id = '00000000-0000-0000-0000-00000000f0a1'), 1, 'convite auditado');
select is((select details from public.audit_events where group_id = :'gid_a' and action = 'user.role_changed'),
  '{"from": "viewer", "to": "treasurer"}'::jsonb, 'mudança de papel auditada com de/para');
select is((select details->>'role' from public.audit_events where group_id = :'gid_a' and action = 'user.removed'),
  'treasurer', 'remoção auditada');

select * from finish();
rollback;
