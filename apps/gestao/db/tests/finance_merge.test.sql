-- pgTAP: agrupar e desagrupar lançamentos (014). Rode com `npm run test:db`.
begin;
select plan(15);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select id as cat_d from public.categories where group_id = :'gid_a' and kind = 'despesa' and active order by code limit 1 \gset
select id as cat_d2 from public.categories where group_id = :'gid_a' and kind = 'despesa' and active order by code desc limit 1 \gset
select public.create_ledger_entry(:'gid_a', '2026-04-02', 'Feira legumes', :'pix_a', null, false, -4000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -4000, 'description', 'legumes')), :'acc_a', 'nota 1') as e1 \gset
select public.create_ledger_entry(:'gid_a', '2026-04-01', 'Feira copos', :'pix_a', null, false, -1250,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d2', 'amount_cents', -1250, 'description', 'copos')), :'acc_a') as e2 \gset
select public.create_ledger_entry(:'gid_a', '2026-04-03', 'Outra conta', :'pix_a', null, false, -100,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -100, 'description', 'x1')),
  (select id from public.accounts where group_id = :'gid_a' and name = 'A definir')) as e3 \gset
select id as s1 from public.entry_splits where entry_id = :'e1' \gset
select id as s2 from public.entry_splits where entry_id = :'e2' \gset
select id as s3 from public.entry_splits where entry_id = :'e3' \gset

-- Agrupar
select jsonb_build_object('date', '2026-04-05', 'name', 'Feira do mês', 'account_id', :'acc_a', 'payment_method_id', :'pix_a',
  'document', 'NF 9', 'filed', true, 'notes', 'juntas') as data \gset
select throws_like(format($$select public.merge_ledger_entries(%L, array[%L]::uuid[], %L)$$, :'gid_a', :'s1', :'data'), '%pelo menos dois lançamentos%', 'um lançamento só não agrupa');
select throws_like(format($$select public.merge_ledger_entries(%L, array[%L, %L]::uuid[], %L)$$, :'gid_a', :'s1', :'split_a', :'data'), '%conciliado%', 'conciliado não agrupa');
select throws_like(format($$select public.merge_ledger_entries(%L, array[%L, %L]::uuid[], %L)$$, :'gid_a', :'s1', :'s2', '{"date":"2026-04-05","name":"x"}'), '%histórico%', 'dados do lançamento conferidos');
-- contas diferentes agrupam: a conta é a escolhida
select is(public.merge_ledger_entries(:'gid_a', array[:'s1', :'s2', :'s3']::uuid[], :'data'), :'e1'::uuid, 'continua o do primeiro rateio marcado');
select is((select total_cents::int from public.ledger_entries where id = :'e1'), -5350, 'total somado');
select is((select count(*)::int from public.entry_splits where entry_id = :'e1'), 3, 'três rateios');
select ok(not exists (select 1 from public.ledger_entries where id in (:'e2', :'e3')), 'os outros somem');
select is((select row(entry_date, name, account_id, payment_method_id, document, document_filed, notes)::text from public.ledger_entries where id = :'e1'),
  row('2026-04-05'::date, 'Feira do mês', :'acc_a'::uuid, :'pix_a'::uuid, 'NF 9', true, 'juntas')::text, 'dados escolhidos gravados');
select is((select count(*)::int from public.ledger_entry_history(:'e1') h where h.details->>'reason' = 'agrupado'), 1, 'histórico do agrupamento');

-- Desagrupar: volta a dois lançamentos com os dados do original
select is(public.split_ledger_entry_splits(:'gid_a', array[:'s2', :'s3']::uuid[]), 2, 'dois lançamentos novos');
select is((select total_cents::int from public.ledger_entries where id = :'e1'), -4000, 'original com o que ficou');
select is((select e.total_cents::int from public.ledger_entries e join public.entry_splits s on s.entry_id = e.id where s.id = :'s2'), -1250, 'novo com o rateio');
select throws_like(format($$select public.split_ledger_entry_splits(%L, array[%L]::uuid[])$$, :'gid_a', :'s1'), '%mais de um rateio%', 'rateio único não desagrupa');
select throws_like(format($$select public.split_ledger_entry_splits(%L, array[%L]::uuid[])$$, :'gid_a', :'split_a'), '%conciliado%', 'conciliado não desagrupa');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select throws_like(format($$select public.split_ledger_entry_splits(%L, array[%L]::uuid[])$$, :'gid_a', :'s1'), '%ações em lote são do administrador%', 'editor não desagrupa');

select * from finish();
rollback;
