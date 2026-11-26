-- pgTAP: ações em lote do Financeiro (012): documentos, forma de pagamento, rubrica e associado dos rateios.
-- Rode com `npm run test:db`.
begin;
select plan(22);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select id as boleto from public.payment_methods where group_id = :'gid_a' and name <> 'PIX' and active order by name limit 1 \gset
select id as cat_r2 from public.categories where group_id = :'gid_a' and kind = 'receita' and active and id <> :'cat_a'
  and not (id = any(public.fee_category_ids(:'gid_a'))) order by code desc limit 1 \gset
select id as cat_d from public.categories where group_id = :'gid_a' and kind = 'despesa' and active order by code limit 1 \gset
select id as cat_d2 from public.categories where group_id = :'gid_a' and kind = 'despesa' and active order by code desc limit 1 \gset
insert into public.associates(group_id, name, branch) values (:'gid_a', 'Outro Associado', 'escoteiro') returning id as assoc_2 \gset
select public.create_ledger_entry(:'gid_a', '2026-04-01', 'Papelaria', :'pix_a', null, false, -3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -2000, 'description', 'cartolina'),
                    jsonb_build_object('category_id', :'cat_d', 'amount_cents', -1000, 'description', 'cola')), :'acc_a') as e1 \gset
select public.create_ledger_entry(:'gid_a', '2026-04-02', 'Doação', :'pix_a', null, false, 500,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r2', 'amount_cents', 500, 'description', 'doação')), :'acc_a') as e2 \gset
select array_agg(id order by amount_cents) as e1_splits from public.entry_splits where entry_id = :'e1' \gset
select id as e2_split from public.entry_splits where entry_id = :'e2' \gset

-- Documentos
select is(public.set_entries_document_filed(:'gid_a', array[:'e1', :'e2', :'e1']::uuid[], true), 2, 'arquiva 2 (repetido conta uma vez)');
select is(public.set_entries_document_filed(:'gid_a', array[:'e1', :'e2']::uuid[], true), 0, 'já arquivados: nada muda');
select is((select count(*)::int from public.ledger_entry_history(:'e1') h where h.action = 'ledger_entry.document_filed' and h.details->>'reason' = 'em lote')
  + (select count(*)::int from public.ledger_entry_history(:'e2') h where h.action = 'ledger_entry.document_filed' and h.details->>'reason' = 'em lote'), 2, 'auditoria em lote no histórico');

-- Forma de pagamento
select is(public.set_entries_payment_method(:'gid_a', array[:'e1', :'e2']::uuid[], :'boleto'), 2, 'troca a forma de 2');
select is((select count(*)::int from public.ledger_entries where id in (:'e1', :'e2') and payment_method_id = :'boleto'), 2, 'forma gravada');
select is((select count(*)::int from public.ledger_entry_history(:'e1') where action = 'ledger_entry.updated'), 1, 'histórico com o retrato antes/depois');
select throws_like(format($$select public.set_entries_payment_method(%L, array[%L]::uuid[], %L)$$, :'gid_a', :'e1', :'pix_b'), 'Forma de pagamento inválida%', 'forma de outro grupo');

-- Rubrica
select is(public.set_splits_category(:'gid_a', :'e1_splits'::uuid[], :'cat_d2'), 1, 'um lançamento alterado (2 rateios)');
select is((select count(*)::int from public.entry_splits where entry_id = :'e1' and category_id = :'cat_d2'), 2, 'rateios na nova rubrica');
select is((select sum(amount_cents)::int from public.entry_splits where entry_id = :'e1'), -3000, 'valores intactos');
select throws_like(format($$select public.set_splits_category(%L, array[%L, %L]::uuid[], %L)$$, :'gid_a', (:'e1_splits'::uuid[])[1], :'e2_split', :'cat_d'),
  '%selecione só rateios do mesmo tipo%', 'despesa não serve a rateio de entrada');
select throws_like(format($$select public.set_splits_category(%L, array[%L]::uuid[], %L)$$, :'gid_a', :'split_a', :'cat_r2'),
  '%ligados a mensalidades%', 'rateio de mensalidade só para rubrica de mensalidade');
select is((select count(*)::int from public.fee_record_splits where split_id = :'split_a'), 1, 'vínculo com a mensalidade intacto');

-- Associado
select is(public.set_splits_associate(:'gid_a', array[:'e2_split']::uuid[], :'assoc_2'), 1, 'define o associado');
select is((select associate_id from public.entry_splits where id = :'e2_split'), :'assoc_2'::uuid, 'associado gravado');
select is(public.set_splits_associate(:'gid_a', array[:'e2_split']::uuid[], null), 1, 'tira o associado');
select throws_like(format($$select public.set_splits_associate(%L, array[%L]::uuid[], %L)$$, :'gid_a', :'split_a', :'assoc_2'),
  '%ligados a mensalidades%', 'mensalidade não troca de associado em lote');

-- Permissão: o Editor (tesouraria) não faz em lote; revisa um lançamento de cada vez.
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select throws_like(format($$select public.set_entries_document_filed(%L, array[%L]::uuid[], false)$$, :'gid_a', :'e1'), '%ações em lote são do administrador%', 'editor não faz em lote');
select throws_like(format($$select public.review_ledger_entries(%L, array[%L, %L]::uuid[])$$, :'gid_a', :'e1', :'e2'), 'Revisar em lote é do administrador%', 'editor não revisa em lote');

-- Permissão e isolamento
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.set_entries_document_filed(%L, array[%L]::uuid[], false)$$, :'gid_a', :'e1'), '%ações em lote são do administrador%', 'consulta não altera');
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select throws_like(format($$select public.set_entries_document_filed(%L, array[%L]::uuid[], false)$$, :'gid_b', :'e1'), 'Lançamento não encontrado%', 'lançamento de outro grupo');
select throws_like(format($$select public.set_splits_category(%L, array[%L]::uuid[], %L)$$, :'gid_a', :'e2_split', :'cat_r2'), '%ações em lote são do administrador%', 'outro grupo não edita');

select * from finish();
rollback;
