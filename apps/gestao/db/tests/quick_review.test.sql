-- pgTAP: registro rápido comum (049). Lançamento e associado entram para revisar; só quem edita o módulo registra e
-- revisa; a revisão é auditada e não atravessa grupos. Rode com `npm run test:db`.
begin;
select plan(24);
\ir _fixture.psql

select id as despesa_a from public.categories where group_id = :'gid_a' and kind = 'despesa' and code = '2.1' \gset

-- Financeiro ------------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.create_quick_ledger_entry(:'gid_a', '2026-03-12', ' Mercado ', :'pix_a', -4590, :'despesa_a', 'lanche', null) as quick_a \gset
select public.create_quick_ledger_entry(:'gid_a', '2026-03-12', 'Sem descrição', :'pix_a', -100, :'despesa_a', '  ', null) as quick_nodesc \gset
select is((select review_status from public.ledger_entries where id = :'quick_a'), 'para_revisar', 'lançamento rápido fica para revisar');
select is((select name || '|' || total_cents from public.ledger_entries where id = :'quick_a'), 'Mercado|-4590', 'nome limpo e valor com sinal');
select is((select count(*)::int from public.entry_splits where entry_id = :'quick_a' and category_id = :'despesa_a' and amount_cents = -4590 and description = 'lanche'),
  1, 'um rateio com a rubrica e o total');
select is((select description from public.entry_splits where entry_id = :'quick_nodesc'), 'Sem descrição', 'sem descrição: o rateio repete o histórico');
select is((select review_status from public.ledger_entry_rows where entry_id = :'quick_a'), 'para_revisar', 'ledger_entry_rows traz review_status');
select is((select review_status from public.entry_split_rows where entry_id = :'quick_a'), 'para_revisar', 'entry_split_rows traz review_status');
select is((select review_status from public.ledger_entries where id = :'entry_a'), 'revisado', 'lançamento normal nasce revisado');
select throws_like(format($$select public.create_quick_ledger_entry(%L, '2026-03-12', 'Errado', %L, 1000, %L, null, null)$$, :'gid_a', :'pix_a', :'despesa_a'),
  'Rubrica de despesa exige%', 'sinal segue a rubrica');
select tests.logout() \gset
select ok(exists (select 1 from public.audit_events where entity_id = :'quick_a' and action = 'ledger_entry.quick'), 'origem auditada');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.create_quick_ledger_entry(%L, '2026-03-12', 'Consulta', %L, -100, %L, null, null)$$, :'gid_a', :'pix_a', :'despesa_a'),
  'Sem permissão%', 'consulta não registra');
select throws_like(format($$select public.review_ledger_entries(%L, array[%L]::uuid[])$$, :'gid_a', :'quick_a'), 'Sem permissão%', 'consulta não revisa');

select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is(public.review_ledger_entries(:'gid_b', array[:'quick_a']::uuid[]), 0, 'outro grupo não revisa o lançamento');

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select throws_like(format($$select public.review_ledger_entries(%L, array[%L, %L]::uuid[])$$, :'gid_a', :'quick_a', :'entry_a'), 'Revisar em lote é do administrador%', 'editor não revisa em lote (015)');
select is(public.review_ledger_entries(:'gid_a', array[:'quick_a']::uuid[]), 1, 'editor revisa um lançamento');
select is((select review_status || '|' || (reviewed_by = '00000000-0000-0000-0000-00000000f0a2') from public.ledger_entries where id = :'quick_a'),
  'revisado|true', 'quem revisou fica gravado');
select tests.logout() \gset
select ok(exists (select 1 from public.audit_events where entity_id = :'quick_a' and action = 'ledger_entry.reviewed'), 'revisão auditada');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select is(public.review_ledger_entries(:'gid_a', array[:'quick_a']::uuid[]), 0, 'revisar de novo não muda nada');

-- Associados ------------------------------------------------------------------------------------
select public.associates_create_quick(:'gid_a', 'Novo Rápido', 'adulto', null, null, null, null, null, null) as quick_assoc \gset
select is((select review_status from public.associate_profile_rows where id = :'quick_assoc'), 'para_revisar', 'associado rápido fica para revisar');
select is((select count(*)::int from public.associate_movements where associate_id = :'quick_assoc' and kind = 'entrada'), 1, 'cadastro igual ao normal (entrada)');
select is((select review_status from public.associates where id = :'assoc_a'), 'revisado', 'associado existente está revisado');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.associates_create_quick(%L, 'Consulta', 'adulto', null, null, null, null, null, null)$$, :'gid_a'),
  'Sem permissão%', 'consulta não cadastra');
select throws_like(format($$select public.associates_review(%L, array[%L]::uuid[])$$, :'gid_a', :'quick_assoc'), 'Sem permissão%', 'consulta não revisa associado');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select is(public.associates_review(:'gid_a', array[:'quick_assoc']::uuid[]), 1, 'administrador revisa o cadastro');
select ok(exists (select 1 from public.audit_events where entity_id = :'quick_assoc' and action = 'associate.reviewed'), 'revisão do cadastro auditada');

select * from finish();
rollback;
