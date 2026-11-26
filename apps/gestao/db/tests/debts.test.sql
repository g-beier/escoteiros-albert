-- pgTAP: Devedores (023) — dívida é uma conta a receber por rubrica do associado, paga só por rateios ligados a ela;
-- a diferença de um lançamento vira dívida; "Não pago" na mensalidade cria a dívida do mês. Rode com `npm run test:db`.
begin;
select plan(41);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select id as cat_loja from public.categories where group_id = :'gid_a' and kind = 'receita' and code = '1.2' \gset
select id as cat_desp from public.categories where group_id = :'gid_a' and kind = 'despesa' and parent_id is not null order by code limit 1 \gset
reset role;
insert into public.associates(group_id, name, branch) values (:'gid_a', 'Bia', 'escoteiro') returning id as bia \gset
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset

-- Dívida manual (rubrica obrigatória)
select public.save_debt(:'gid_a', null, :'assoc_a', '2026-04-01', 5000, :'cat_loja', 'Acampamento de abril', '2x de R$ 25') as d1 \gset
select is((select (origin, category_id = :'cat_loja', paid_cents)::text from public.debt_rows(:'gid_a') where id = :'d1'), '(manual,t,0)', 'manual, na rubrica, aberta');
select throws_like(format($$select public.save_debt(%L, null, %L, '2026-04-01', 100, %L, 'Despesa', null)$$, :'gid_a', :'assoc_a', :'cat_desp'),
  'Escolha a rubrica de receita da dívida', 'rubrica de despesa recusada');

-- Rateio avulso do associado não paga a dívida
select public.create_ledger_entry(:'gid_a', '2026-04-10', 'Ana avulso', :'pix_a', null, false, 3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_loja', 'amount_cents', 3000, 'description', 'acampamento', 'associate_id', :'assoc_a')), :'acc_a') as avulso \gset
select is((select paid_cents from public.debt_rows(:'gid_a') where id = :'d1'), 0::bigint, 'rateio sem ligação não paga');

-- Rateio ligado paga: parcial, depois o resto
select public.create_ledger_entry(:'gid_a', '2026-04-15', 'Ana parcela 1', :'pix_a', null, false, 2000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_loja', 'amount_cents', 2000, 'description', 'Acampamento de abril', 'associate_id', :'assoc_a', 'debt_id', :'d1')), :'acc_a') as p1 \gset
select is((select paid_cents from public.debt_rows(:'gid_a') where id = :'d1'), 2000::bigint, 'parcela ligada paga');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-04-20', 'Ana a mais', %L, null, false, 4000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 4000, 'description', 'x acampamento', 'associate_id', %L, 'debt_id', %L)), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'assoc_a', :'d1', :'acc_a'), 'O pagamento passa do que falta%', 'não passa do que falta');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-04-20', 'Outra rubrica', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'x acampamento', 'associate_id', %L, 'debt_id', %L)), %L)$$,
  :'gid_a', :'pix_a', :'cat_a', :'assoc_a', :'d1', :'acc_a'), '%na rubrica da dívida', 'rubrica tem de ser a da dívida');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-04-20', 'Outro associado', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'x acampamento', 'associate_id', %L, 'debt_id', %L)), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'bia', :'d1', :'acc_a'), '%do associado da dívida', 'associado tem de ser o da dívida');
select public.create_ledger_entry(:'gid_a', '2026-04-30', 'Ana parcela 2', :'pix_a', null, false, 3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_loja', 'amount_cents', 3000, 'description', 'Acampamento de abril', 'associate_id', :'assoc_a', 'debt_id', :'d1')), :'acc_a') as p2 \gset
select is((select paid_cents from public.debt_rows(:'gid_a') where id = :'d1'), 5000::bigint, 'quitada');
select is((select jsonb_array_length(payments) from public.debt_rows(:'gid_a') where id = :'d1'), 2, 'dois pagamentos (rateios)');

-- Editar o lançamento reenvia o rateio ligado: continua pagando
select lives_ok(format($$select public.update_ledger_entry(%L, '2026-04-15', 'Ana parcela 1 (pix)', %L, null, true, 2000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 2000, 'description', 'Acampamento de abril', 'associate_id', %L, 'debt_id', %L)), %L, null)$$,
  :'p1', :'pix_a', :'cat_loja', :'assoc_a', :'d1', :'acc_a'), 'edita o lançamento pagador');
select is((select paid_cents from public.debt_rows(:'gid_a') where id = :'d1'), 5000::bigint, 'pagamento mantido ao editar');

-- Regras de edição e exclusão da dívida
select throws_like(format($$select public.save_debt(%L, %L, %L, '2026-04-01', 4000, %L, 'Acampamento de abril', null)$$, :'gid_a', :'d1', :'assoc_a', :'cat_loja'),
  'O valor não pode ficar abaixo do que já foi pago', 'valor abaixo do pago');
select throws_like(format($$select public.save_debt(%L, %L, %L, '2026-04-01', 5000, %L, 'Acampamento de abril', null)$$, :'gid_a', :'d1', :'bia', :'cat_loja'),
  'A dívida já tem pagamento%', 'com pagamento, associado não muda');
select throws_like(format($$select public.delete_debt(%L)$$, :'d1'), 'A dívida tem pagamento%', 'com pagamento, não exclui');

-- Excluir o lançamento pagador: a dívida reabre
select public.delete_ledger_entry(:'p2');
select is((select paid_cents from public.debt_rows(:'gid_a') where id = :'d1'), 2000::bigint, 'pagamento some com o lançamento');

-- Diferença no lançamento: recebeu 60 de 100, 40 viram dívida
select public.create_ledger_entry(:'gid_a', '2026-05-02', 'Bia lojinha', :'pix_a', null, false, 6000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_loja', 'amount_cents', 6000, 'description', 'Camiseta', 'associate_id', :'bia', 'due_cents', 4000)), :'acc_a') as parcial \gset
select id as d_diff from public.debts where origin_entry_id = :'parcial' \gset
select is((select (origin, amount_cents, category_id = :'cat_loja', associate_id = :'bia', description)::text from public.debts where id = :'d_diff'),
  '(lancamento,4000,t,t,Camiseta)', 'diferença vira dívida na mesma rubrica, associado e descrição');
select is((select total_cents from public.ledger_entries where id = :'parcial'), 6000::bigint, 'o lançamento fica com o que entrou');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Sem associado', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'Camiseta', 'due_cents', 500)), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'acc_a'), 'A dívida da diferença precisa%', 'diferença exige associado');
select throws_like(format($$select public.update_ledger_entry(%L, '2026-05-02', 'Bia lojinha', %L, null, false, 6000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 6000, 'description', 'Camiseta', 'associate_id', %L, 'due_cents', 1000)), %L, null)$$,
  :'parcial', :'pix_a', :'cat_loja', :'bia', :'acc_a'), 'A diferença só vira dívida ao criar o lançamento', 'diferença só ao criar');
-- pagar a dívida da diferença e tentar excluir o lançamento de origem
select public.create_ledger_entry(:'gid_a', '2026-05-20', 'Bia paga', :'pix_a', null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_loja', 'amount_cents', 1000, 'description', 'Camiseta', 'associate_id', :'bia', 'debt_id', :'d_diff')), :'acc_a') as bia_paga \gset
select throws_like(format($$select public.delete_ledger_entry(%L)$$, :'parcial'), 'Este lançamento gerou dívida que já tem pagamento%',
  'origem com dívida paga não sai');
select public.delete_ledger_entry(:'bia_paga');
select lives_ok(format($$select public.delete_ledger_entry(%L)$$, :'parcial'), 'sem pagamento, sai');
select is((select count(*)::int from public.debts where id = :'d_diff'), 0, 'e a dívida da diferença sai junto');

-- Mensalidade: Não pago → dívida do mês (valor individual do ano: R$ 25)
select public.set_fee_record(:'assoc_a', 2026, 4, 'nao_pago', 'não veio', null) \gset
select id as d_fee, fee_record_id as rec_apr from public.debts where fee_record_id = (select id from public.fee_records where associate_id = :'assoc_a' and year = 2026 and month = 4) \gset
select is((select (origin, amount_cents, category_id = :'cat_a', description)::text from public.debts where id = :'d_fee'), '(mensalidade,2500,t,"Mensalidade abr./2026")',
  'dívida do mês na rubrica de mensalidade');
select throws_like(format($$select public.delete_debt(%L)$$, :'d_fee'), 'Dívida de mensalidade%', 'não exclui em Devedores');
select throws_like(format($$select public.save_debt(%L, %L, %L, '2026-04-01', 3000, %L, 'Mensalidade', null)$$, :'gid_a', :'d_fee', :'assoc_a', :'cat_a'),
  'Dívida de mensalidade%', 'valor de mensalidade não muda');
-- receber: o mês vira Pago ligado ao rateio
select public.create_ledger_entry(:'gid_a', '2026-05-05', 'Mensalidade abril', :'pix_a', null, false, 2500,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_a', 'amount_cents', 2500, 'description', 'Mensalidade abr./2026', 'associate_id', :'assoc_a', 'debt_id', :'d_fee')), :'acc_a') as fee_pay \gset
select is((select status::text from public.fee_records where id = :'rec_apr'), 'pago', 'quitada: mês Pago');
select is((select count(*)::int from public.fee_record_splits f join public.entry_splits s on s.id = f.split_id where f.fee_record_id = :'rec_apr' and s.entry_id = :'fee_pay'), 1,
  'mês ligado ao rateio que pagou');
select lives_ok(format($$select public.set_fee_record(%L, 2026, 4, 'pago', 'pagou em maio', null)$$, :'assoc_a'), 'regravar o mês Pago (nota) mantém a dívida');
select is((select count(*)::int from public.fee_record_splits where fee_record_id = :'rec_apr'), 1, 'e o vínculo com o rateio');
select throws_like(format($$select public.set_fee_record(%L, 2026, 4, 'isento', null, null)$$, :'assoc_a'), 'Este mês tem dívida com pagamento%', 'com pagamento, não vira isento');
select public.delete_ledger_entry(:'fee_pay');
select is((select status::text from public.fee_records where id = :'rec_apr'), 'nao_pago', 'pagamento excluído: volta a Não pago');
select lives_ok(format($$select public.set_fee_record(%L, 2026, 4, null, null, null)$$, :'assoc_a'), 'limpa o mês');
select is((select count(*)::int from public.debts where id = :'d_fee'), 0, 'sem pagamento, a dívida do mês sai');

-- Sem valor de mensalidade no ano, o mês fica Não pago sem dívida
select lives_ok(format($$select public.set_fee_record(%L, 2030, 3, 'nao_pago', null, null)$$, :'assoc_a'), 'Não pago sem valor do ano');
select is((select count(*)::int from public.debts d join public.fee_records r on r.id = d.fee_record_id where r.year = 2030), 0, 'sem dívida (não há valor)');

-- Consulta vê valores sem associado nem pagamentos; outro grupo não vê
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select is((select count(*)::int from public.debt_rows(:'gid_a') where associate_id is null and payments is null and origin_entry_id is null), 1, 'consulta: anônimo');
select throws_like(format($$select public.save_debt(%L, null, %L, '2026-04-01', 100, %L, 'Consulta', null)$$, :'gid_a', :'assoc_a', :'cat_loja'), 'Sem permissão%', 'consulta não anota');
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is((select count(*)::int from public.debt_rows(:'gid_a')), 0, 'outro grupo não vê');
select throws_like(format($$select public.delete_debt(%L)$$, :'d1'), 'Dívida não encontrada%', 'outro grupo não exclui');

-- Pagamento ligado não é trocado em lote
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select throws_like(format($$select public.set_splits_category(%L, array(select id from public.entry_splits where entry_id = %L), %L)$$, :'gid_a', :'p1', :'cat_a'),
  'Há rateios que pagam dívidas%', 'rubrica em lote recusa');
select throws_like(format($$select public.set_splits_associate(%L, array(select id from public.entry_splits where entry_id = %L), %L)$$, :'gid_a', :'p1', :'bia'),
  'Há rateios que pagam dívidas%', 'associado em lote recusa');

select * from finish();
rollback;
