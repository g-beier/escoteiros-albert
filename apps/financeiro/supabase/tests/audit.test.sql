-- pgTAP: as funções principais de escrita deixam um evento em audit_events (grupo, ação, autor).
-- Parte vem do _fixture.psql (criação de conta, lançamento, importação, conciliação, anexo, mensalidades…);
-- o restante é exercitado aqui como tesouraria. Rode com `npm run test:db` (supabase test db).
begin;
select plan(43);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.update_ledger_entry(:'entry_a', '2026-03-10', 'Lançamento RLS A editado', :'pix_a', 'NF 1', false, 3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_a', 'amount_cents', 3000, 'description', 'mensalidade', 'associate_id', :'assoc_a')),
  :'acc_a') \gset
select public.set_entry_document_filed(:'entry_a', true) \gset
select public.unlink_reconciliation(:'line_a') \gset
select public.reject_reconciliation_suggestion(:'line_a', :'entry_a') \gset
select public.set_ledger_entry_outside_statement(:'entry_a', true) \gset
select public.ignore_statement_lines(array[:'line_a2']::uuid[], 'tarifa') \gset
select public.reopen_statement_line(:'line_a2') \gset
select public.create_account(:'gid_a', 'Conta Auditoria', 'caixa', null, null, null, 0, null, null) as acc_new \gset
select public.update_account(:'acc_new', 'Conta Auditoria 2', 'caixa', null, null, null, 0, null, null) \gset
select public.set_ledger_entry_account(:'entry_a', :'acc_new') \gset
select public.create_category(:'gid_a', '1.9', 'Rubrica Auditoria', null) as cat_new \gset
select public.update_category(:'cat_new', 'Rubrica Auditoria 2', null) \gset
select public.set_category_active(:'cat_new', false) \gset
select public.create_payment_method(:'gid_a', 'Forma Auditoria') as pm_new \gset
select public.update_payment_method(:'pm_new', 'Forma Auditoria 2') \gset
select public.set_payment_method_default_account(:'pm_new', :'acc_a') \gset
select public.set_payment_method_active(:'pm_new', false) \gset
select public.rename_import_profile(:'profile_a', 'Perfil Auditoria') \gset
select public.delete_statement_import(:'import_a') \gset
select public.delete_import_profile(:'profile_a') \gset
select public.delete_entry_attachment(:'attach_a') \gset
select public.import_associates(:'gid_a', '[{"name":"Associado Auditoria","branch":"senior"}]') \gset
select public.create_ledger_entry(:'gid_a', '2026-03-20', 'Para excluir', :'pix_a', null, false, -700,
  jsonb_build_array(jsonb_build_object('category_id', (select id from public.categories where group_id = :'gid_a' and code like '2.%' order by code limit 1),
    'amount_cents', -700, 'description', 'material')), :'acc_a') as entry_del \gset
select public.delete_ledger_entry(:'entry_del') \gset
select public.set_account_active(:'acc_new', false) \gset
select tests.logout() \gset

create function tests.audited(p_action text, p_entity text default null) returns integer language sql as $$
  select count(*)::int from public.audit_events
  where group_id = current_setting('test.gid_a')::uuid and action = p_action
    and actor_id = '00000000-0000-0000-0000-00000000f0a2' and (p_entity is null or entity_id = p_entity)
$$;

-- vindos do fixture
select is(tests.audited('account.created', :'acc_a'), 1, 'create_account audita account.created');
select is(tests.audited('ledger_entry.created', :'entry_a'), 1, 'create_ledger_entry audita ledger_entry.created');
select is(tests.audited('import_profile.created', :'profile_a'), 1, 'save_import_profile audita import_profile.created');
select is(tests.audited('statement.imported', :'import_a'), 1, 'import_statement_lines audita statement.imported');
select is(tests.audited('reconciliation.linked'), 1, 'link_reconciliation audita reconciliation.linked');
select is(tests.audited('ledger_entry.attachment_added', :'entry_a'), 1, 'add_entry_attachment audita');
select is(tests.audited('fee.settings_updated'), 1, 'set_fee_settings audita');
select is(tests.audited('fee.year_settings_updated'), 1, 'set_fee_year_settings audita');
select is(tests.audited('fee.recorded'), 1, 'set_fee_record audita');
select is(tests.audited('fee.exempted'), 1, 'set_fee_exemption audita');
select is(tests.audited('fee.price_set'), 1, 'set_fee_associate_price audita');
select is(tests.audited('associate.movement_added'), 1, 'add_associate_movement audita');

-- exercitados acima
select is(tests.audited('ledger_entry.updated', :'entry_a'), 1, 'update_ledger_entry audita');
select ok((select details ? 'before' and details ? 'after' from public.audit_events
  where action = 'ledger_entry.updated' and entity_id = :'entry_a'), 'ledger_entry.updated guarda antes e depois');
select is(tests.audited('ledger_entry.document_filed', :'entry_a'), 1, 'set_entry_document_filed audita');
select is(tests.audited('reconciliation.unlinked'), 1, 'unlink_reconciliation audita');
select is(tests.audited('reconciliation.suggestion_rejected'), 1, 'reject_reconciliation_suggestion audita');
select is(tests.audited('ledger_entry.outside_statement', :'entry_a'), 1, 'set_ledger_entry_outside_statement audita');
select is(tests.audited('statement_line.ignored', :'line_a2'), 1, 'ignore_statement_lines audita');
select is(tests.audited('statement_line.reopened', :'line_a2'), 1, 'reopen_statement_line audita');
select is(tests.audited('account.created', :'acc_new'), 1, 'create_account (2) audita');
select is(tests.audited('account.updated', :'acc_new'), 1, 'update_account audita');
select is(tests.audited('account.deactivated', :'acc_new'), 1, 'set_account_active audita');
select is(tests.audited('ledger_entry.account_changed', :'entry_a'), 1, 'set_ledger_entry_account audita');
select is(tests.audited('category.created', :'cat_new'), 1, 'create_category audita');
select is(tests.audited('category.updated', :'cat_new'), 1, 'update_category audita');
select is(tests.audited('category.deactivated', :'cat_new'), 1, 'set_category_active audita');
select is(tests.audited('payment_method.created', :'pm_new'), 1, 'create_payment_method audita');
select is(tests.audited('payment_method.updated', :'pm_new'), 1, 'update_payment_method audita');
select is(tests.audited('payment_method.default_account_set', :'pm_new'), 1, 'set_payment_method_default_account audita');
select is(tests.audited('payment_method.deactivated', :'pm_new'), 1, 'set_payment_method_active audita');
select is(tests.audited('import_profile.renamed', :'profile_a'), 1, 'rename_import_profile audita');
select is(tests.audited('statement.import_deleted', :'import_a'), 1, 'delete_statement_import audita');
select is(tests.audited('import_profile.deleted', :'profile_a'), 1, 'delete_import_profile audita');
select is(tests.audited('ledger_entry.attachment_removed', :'entry_a'), 1, 'delete_entry_attachment audita');
select is(tests.audited('associates.imported'), 1, 'import_associates audita');
select is(tests.audited('ledger_entry.created', :'entry_del'), 1, 'create_ledger_entry (2) audita');
select is(tests.audited('ledger_entry.deleted', :'entry_del'), 1, 'delete_ledger_entry audita');
select ok((select details ? 'before' from public.audit_events where action = 'ledger_entry.deleted' and entity_id = :'entry_del'),
  'ledger_entry.deleted guarda o estado anterior');

-- integridade da trilha
select is((select count(*)::int from public.audit_events where group_id = :'gid_a' and actor_id is null), 0,
  'todo evento das funções tem autor');
select is((select count(*)::int from public.audit_events where group_id = :'gid_b' and action <> 'group.bootstrapped'
  and actor_id <> '00000000-0000-0000-0000-00000000f0b1'), 0, 'eventos de B só têm autores de B');
select is((select count(*)::int from public.audit_events where group_id = :'gid_a' and action = 'group.bootstrapped'), 1, 'bootstrap auditado');

-- a trilha também não se edita: nem a administração do grupo altera ou apaga eventos
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select is(tests.affected(format($$delete from public.audit_events where group_id = %L$$, :'gid_a')), 0, 'administração não apaga auditoria');
select tests.logout() \gset

select * from finish();
rollback;
