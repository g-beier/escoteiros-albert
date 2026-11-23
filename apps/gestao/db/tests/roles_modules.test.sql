-- pgTAP: acesso por módulo (002, 003). Os mesmos cinco níveis nos três módulos: "Sem acesso" tira a leitura do
-- módulo; o Colaborador faz o dia a dia e o que grava fica para revisar; o Editor revisa e configura; o Administrador
-- gerencia os usuários só do seu módulo. O chefe (só Inventário) vê no Início só os jovens das seções em que é
-- escotista, pelo associado ligado ao acesso.
-- Rode com `npm run test:db`.
begin;
select plan(55);
\ir _fixture.psql

-- Chefe: sem Financeiro, sem Associados, Colaborador no Inventário.
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000f0a4', 'rls.chefe.a@escoteirosalbert.com.br');
insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
values (:'gid_a', '00000000-0000-0000-0000-00000000f0a4', 'none', 'contributor', 'none');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Papéis') as tropa \gset
select public.create_section(:'gid_a', 'lobinho', 'Alcateia Papéis') as alcateia \gset
select public.associates_create(:'gid_a', 'Chefe Papéis', 'adulto', null, null, null, null, null, null) as chefe \gset
select public.associates_create(:'gid_a', 'Outro Adulto', 'adulto', null, null, null, null, null, null) as outro \gset
select public.associates_create(:'gid_a', 'Jovem da Tropa', 'escoteiro', :'tropa', null, '2014-05-10', null, null, null) as jovem_tropa \gset
select public.associates_create(:'gid_a', 'Jovem da Alcateia', 'lobinho', :'alcateia', null, '2018-05-10', null, null, null) as jovem_alcateia \gset
select public.associates_add_function(:'chefe', 'escotista', null, current_date - 30, :'tropa') \gset
select id as funcao from public.associate_functions where associate_id = :'chefe' \gset

-- ================================================================ chefe: leitura
select tests.login('00000000-0000-0000-0000-00000000f0a4') \gset
select ok(exists(select 1 from public.groups where id = :'gid_a'), 'chefe lê o grupo');
select ok(exists(select 1 from public.sections where id = :'tropa'), 'chefe lê as seções');
select is((select count(*)::int from public.accounts), 0, 'chefe não lê accounts');
select is((select count(*)::int from public.categories), 0, 'chefe não lê categories');
select is((select count(*)::int from public.ledger_entries), 0, 'chefe não lê ledger_entries');
select is((select count(*)::int from public.entry_splits), 0, 'chefe não lê entry_splits');
select is((select count(*)::int from public.ledger_entry_rows), 0, 'chefe não lê ledger_entry_rows');
select is((select count(*)::int from public.statement_lines), 0, 'chefe não lê statement_lines');
select is((select count(*)::int from public.reconciliation_links), 0, 'chefe não lê reconciliation_links');
select is((select count(*)::int from public.fee_records) + (select count(*)::int from public.fee_record_splits), 0, 'chefe não lê fee_*');
select is((select count(*)::int from public.ledger_entry_history(:'entry_a')), 0, 'chefe não lê o histórico do lançamento');
select ok(not public.can_read_attachment_object(:'path_a'), 'chefe não abre comprovante');
select is((select count(*)::int from public.associates), 0, 'chefe não lê associates');
select is((select count(*)::int from public.associate_functions), 0, 'chefe não lê associate_functions');
select is((select count(*)::int from public.control_items), 0, 'chefe não lê control_items');
select is((select count(*)::int from public.associate_profile_rows), 0, 'chefe não lê associate_profile_rows');
select throws_like(format($$select public.associates_create(%L, 'Novo', 'lobinho', %L, null, null, null, null, null)$$, :'gid_a', :'alcateia'),
  '%permissão%', 'chefe não cadastra associado');
select is((select count(*)::int from public.associates_section_alert_rows(:'gid_a')), 0, 'chefe sem associado ligado: sem avisos');

-- ================================================================ ligação do acesso ao associado
select throws_like(format($$select public.admin_link_member_associate(%L, %L, %L)$$, :'gid_a', '00000000-0000-0000-0000-00000000f0a4', :'chefe'),
  '%administrador do Associados%', 'o próprio chefe não se liga');
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select throws_like(format($$select public.admin_link_member_associate(%L, %L, %L)$$, :'gid_a', '00000000-0000-0000-0000-00000000f0a4', :'jovem_tropa'),
  'Só um associado adulto%', 'só adulto se liga a um acesso');
select throws_like(format($$select public.admin_link_member_associate(%L, %L, %L)$$, :'gid_a', '00000000-0000-0000-0000-00000000f0a4', :'assoc_a'),
  'Só um associado adulto%', 'associado lobinho do fixture também não');
select lives_ok(format($$select public.admin_link_member_associate(%L, %L, %L)$$, :'gid_a', '00000000-0000-0000-0000-00000000f0a4', :'chefe'),
  'administrador liga o chefe ao associado');
select throws_like(format($$select public.admin_link_member_associate(%L, %L, %L)$$, :'gid_a', '00000000-0000-0000-0000-00000000f0a3', :'chefe'),
  '%já está ligado%', 'um associado, um acesso');
select is((select associate_id from public.group_users(:'gid_a') where user_id = '00000000-0000-0000-0000-00000000f0a4'), :'chefe'::uuid,
  'group_users mostra o associado ligado');
select ok(exists(select 1 from public.audit_events where action = 'user.associate_linked' and entity_id = '00000000-0000-0000-0000-00000000f0a4'),
  'ligação auditada');

-- ================================================================ avisos da seção
select tests.login('00000000-0000-0000-0000-00000000f0a4') \gset
select results_eq(format($$select name from public.associates_section_alert_rows(%L)$$, :'gid_a'), array['Jovem da Tropa'],
  'chefe vê só os jovens da seção em que é escotista');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.associates_update_function(:'funcao', 'escotista', :'tropa', null, current_date - 30, current_date - 1);
select tests.login('00000000-0000-0000-0000-00000000f0a4') \gset
select is((select count(*)::int from public.associates_section_alert_rows(:'gid_a')), 0, 'função encerrada: sem avisos');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.associates_add_function(:'chefe', 'escotista', null, current_date, :'alcateia') \gset
select public.admin_link_member_associate(:'gid_a', '00000000-0000-0000-0000-00000000f0a4', null);
select tests.login('00000000-0000-0000-0000-00000000f0a4') \gset
select is((select count(*)::int from public.associates_section_alert_rows(:'gid_a')), 0, 'desligado do associado: sem avisos');

-- ================================================================ consulta sem Associados; administrador
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.admin_set_module_role(:'gid_a', '00000000-0000-0000-0000-00000000f0a3', 'associates', 'none');
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select ok(exists(select 1 from public.ledger_entries where id = :'entry_a'), 'consulta sem Associados continua lendo o Financeiro');
select is((select count(*)::int from public.associates), 0, 'consulta sem Associados não lê associates');

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select ok(exists(select 1 from public.ledger_entries where id = :'entry_a')
  and exists(select 1 from public.associates where id = :'chefe'), 'Editor no Financeiro e no Associados lê os dois módulos');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.admin_set_module_role(:'gid_a', '00000000-0000-0000-0000-00000000f0a2', 'finance', 'none');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select is((select count(*)::int from public.ledger_entries), 0, 'sem acesso ao Financeiro, não lê lançamentos');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select ok(exists(select 1 from public.ledger_entries where id = :'entry_a')
  and exists(select 1 from public.associates where id = :'chefe'), 'administrador lê os dois módulos');

-- ================================================================ Colaborador: o dia a dia fica para revisar
select tests.logout() \gset
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000f0a7', 'rls.colaborador.a@escoteirosalbert.com.br');
insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
values (:'gid_a', '00000000-0000-0000-0000-00000000f0a7', 'contributor', 'none', 'contributor');
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.inventory_save_location(:'gid_a', null, null, 'Depósito Papéis', null) as deposito \gset
select public.associates_create(:'gid_a', 'Adulto Revisado', 'adulto', null, null, null, null, null, null) as adulto \gset

select tests.login('00000000-0000-0000-0000-00000000f0a7') \gset
select throws_like(format($$select public.delete_ledger_entry(%L)$$, :'entry_a'), 'Lançamento já revisado%',
  'colaborador não apaga lançamento revisado');
select lives_ok(format($$select public.set_entry_document_filed(%L, true)$$, :'entry_a'), 'colaborador mexe em lançamento revisado');
select is((select review_status from public.ledger_entries where id = :'entry_a'), 'para_revisar', 'que volta a ficar para revisar');
select public.create_ledger_entry(:'gid_a', '2026-03-20', 'Colaborador', :'pix_a', null, false, 100,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_a', 'amount_cents', 100, 'description', 'material')), :'acc_a') as entry_c \gset
select is((select review_status from public.ledger_entries where id = :'entry_c'), 'para_revisar', 'lançamento do colaborador fica para revisar');
select throws_like(format($$select public.review_ledger_entries(%L, array[%L]::uuid[])$$, :'gid_a', :'entry_c'), '%', 'colaborador não revisa lançamento');
select throws_like(format($$select public.create_account(%L, 'Conta Colaborador', 'caixa', null, null, null, 0, null, null)$$, :'gid_a'),
  '%permissão%', 'colaborador não cria conta');
select lives_ok(format($$select public.delete_ledger_entry(%L)$$, :'entry_c'), 'colaborador apaga o próprio lançamento ainda não revisado');

select public.associates_create(:'gid_a', 'Novo do Colaborador', 'lobinho', :'alcateia', null, null, null, null, null) as novo_c \gset
select is((select review_status from public.associates where id = :'novo_c'), 'para_revisar', 'associado do colaborador fica para revisar');
select lives_ok(format($$select public.associates_add_function(%L, 'colaborador', 'Apoio', current_date)$$, :'adulto'), 'colaborador inclui função');
select is((select review_status from public.associates where id = :'adulto'), 'para_revisar', 'associado com função nova fica para revisar');
select throws_like(format($$select public.associates_review(%L, array[%L]::uuid[])$$, :'gid_a', :'adulto'), '%', 'colaborador não revisa associado');
select throws_like(format($$select public.create_section(%L, 'senior', 'Tropa Colaborador')$$, :'gid_a'), '%permissão%', 'colaborador não cria seção');
select is((select count(*)::int from public.inventory_locations where id = :'deposito'), 0, 'sem acesso ao Inventário, não lê divisões');

-- ================================================================ administrador de um módulo só
select tests.logout() \gset
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000f0a8', 'rls.adm.inventario.a@escoteirosalbert.com.br');
insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
values (:'gid_a', '00000000-0000-0000-0000-00000000f0a8', 'none', 'admin', 'none');
select tests.login('00000000-0000-0000-0000-00000000f0a8') \gset
select ok((select count(*) from public.group_users(:'gid_a')) > 0, 'administrador do Inventário vê os usuários');
select ok((select count(*) from public.audit_events where group_id = :'gid_a') > 0, 'e lê a auditoria');
select throws_like(format($$select public.admin_add_member(%L, 'rls.novo.inv@exemplo.org', 'viewer', 'viewer', 'none')$$, :'gid_a'),
  'Você só pode dar acesso aos módulos que administra', 'não dá acesso ao Financeiro');
select lives_ok(format($$select public.admin_add_member(%L, 'rls.novo.inv@exemplo.org', 'none', 'contributor', 'none')$$, :'gid_a'),
  'cadastra com acesso só ao Inventário');
select throws_like(format($$select public.admin_set_module_role(%L, '00000000-0000-0000-0000-00000000f0a3', 'finance', 'editor')$$, :'gid_a'),
  'Apenas o administrador do módulo%', 'não muda papel no Financeiro');
select throws_like(format($$select public.admin_set_module_role(%L, '00000000-0000-0000-0000-00000000f0a8', 'inventory', 'editor')$$, :'gid_a'),
  'Você não pode tirar sua própria função%', 'não tira o próprio papel de administrador');
select is(public.admin_remove_member(:'gid_a', '00000000-0000-0000-0000-00000000f0a3'), false,
  'remover tira só o Inventário: quem tem outros módulos continua no grupo');
select is((select inventory_role::text || '/' || finance_role::text from public.memberships where user_id = '00000000-0000-0000-0000-00000000f0a3'),
  'none/viewer', 'Financeiro de quem foi removido do Inventário não muda');
select is(public.admin_remove_member(:'gid_a', (select g.user_id from public.group_users(:'gid_a') g where g.email = 'rls.novo.inv@exemplo.org')), true,
  'sem acesso a nenhum módulo, sai do grupo');

select * from finish();
rollback;
