-- pgTAP: Lojinha a pagar depois (022): a venda vira dívida do associado com os itens, o estoque baixa na hora, "Receber"
-- cria o lançamento e quita, e excluir a dívida devolve os itens. Rode com `npm run test:db`.
begin;
select plan(19);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.inventory_save_location(:'gid_a', null, null, 'Lojinha', null) as loja \gset
select public.inventory_save_material(:'gid_a', null, null, 'Lenço', 'lot', false, null, null) as lenco \gset
select public.inventory_add_lot(:'lenco', :'loja', 10, 'bom', 1000, null, null, 'compra', null, null, null, null, true, 3500) as lote \gset
select public.inventory_add_lot(:'lenco', :'loja', 5, 'bom', 1000, null, null, 'compra', null, null, null, 'usado') as fora \gset
reset role;
select id as cat_loja from public.categories where group_id = :'gid_a' and kind = 'receita' and parent_id is not null
  and not (id = any(public.fee_category_ids(:'gid_a'))) order by code limit 1 \gset
update public.categories set sells_items = true where id = :'cat_loja';
select id as cat_outra from public.categories where group_id = :'gid_a' and kind = 'receita' and parent_id is not null and id <> :'cat_loja'
  and not public.category_sells_items(id) and not (id = any(public.fee_category_ids(:'gid_a'))) order by code limit 1 \gset

-- Venda a pagar pela tesouraria (…f0a2, Editor do Financeiro sem papel no Inventário).
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.create_sale_debt(:'gid_a', :'assoc_a', '2026-05-01', :'cat_loja', 'Lenço da promessa', 'paga na próxima reunião',
  jsonb_build_array(jsonb_build_object('lot_id', :'lote', 'quantity', 2, 'unit_price_cents', 3500))) as debt \gset
select is((select (amount_cents, category_id = :'cat_loja', associate_id = :'assoc_a')::text from public.debts where id = :'debt'), '(7000,t,t)',
  'dívida com o valor dos itens, a rubrica e o associado');
select is((select quantity from public.inventory_lots where id = :'lote'), 8, 'estoque baixou na venda');
select is((select count(*)::int from public.inventory_movements where details->>'debt_id' = :'debt' and kind = 'baixa' and write_off_reason = 'venda'
  and channel = 'financeiro'), 1, 'baixa "venda" ligada à dívida');
select is((select count(*)::int from public.entry_sale_items where debt_id = :'debt'), 1, 'itens na dívida');
select is((select count(*)::int from public.ledger_entries where group_id = :'gid_a' and name like '%promessa%'), 0, 'nenhum lançamento: não entrou dinheiro');
select is((select amount_cents - paid_cents from public.debt_rows(:'gid_a') where id = :'debt'), 7000::bigint, 'em Devedores, aberta');

-- Recusas
select throws_like(format($$select public.create_sale_debt(%L, %L, '2026-05-01', %L, 'Lenço', null, jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 3500)))$$,
  :'gid_a', :'assoc_a', :'cat_outra', :'lote'), 'Escolha uma rubrica de venda de itens', 'rubrica que não vende');
select throws_like(format($$select public.create_sale_debt(%L, %L, '2026-05-01', %L, 'Lenço', null, jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 3500)))$$,
  :'gid_a', :'assoc_a', :'cat_loja', :'fora'), 'Lote à venda inválido', 'lote fora da venda');
select throws_like(format($$select public.create_sale_debt(%L, %L, '2026-05-01', %L, 'Lenço', null, jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 9, 'unit_price_cents', 3500)))$$,
  :'gid_a', :'assoc_a', :'cat_loja', :'lote'), 'Estoque insuficiente%', 'sem estoque');
select throws_like(format($$select public.save_debt(%L, %L, %L, '2026-05-01', 5000, 'Lenço da promessa', null, '[]'::jsonb)$$,
  :'gid_a', :'debt', :'assoc_a'), 'Dívida de venda: o valor é a soma dos itens%', 'valor de dívida com itens não muda');
reset role;
select throws_like(format($$delete from public.debts where id = %L$$, :'debt'), '%exclua em Devedores%', 'exclusão direta recusada');

-- Receber: parte agora (R$ 30), o resto depois.
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.receive_debt(:'debt', '2026-05-10', 'Pai do associado', :'pix_a', null, false, 3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_loja', 'amount_cents', 3000, 'description', 'Lenço da promessa', 'associate_id', :'assoc_a')), :'acc_a') as pay1 \gset
select is((select paid_cents from public.debt_rows(:'gid_a') where id = :'debt'), 3000::bigint, 'pagamento parcial alocado');
select is((select quantity from public.inventory_lots where id = :'lote'), 8, 'receber não mexe no estoque');
select public.receive_debt(:'debt', '2026-05-20', 'Pai do associado', :'pix_a', null, false, 5000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_loja', 'amount_cents', 5000, 'description', 'Lenço da promessa', 'associate_id', :'assoc_a')), :'acc_a') as pay2 \gset
select is((select paid_cents from public.debt_rows(:'gid_a') where id = :'debt'), 7000::bigint, 'quitada (o excesso fica fora da dívida)');
select is((select amount_cents from public.debt_payments where entry_id = :'pay2'), 4000::bigint, 'só o que faltava foi alocado');
select throws_like(format($$select public.receive_debt(%L, '2026-05-20', 'Pai', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'Lenço')), %L)$$,
  :'debt', :'pix_a', :'cat_loja', :'acc_a'), '%precisa de um rateio de receita%', 'receber sem o associado no rateio');

-- Quem só consulta não vende a pagar.
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.create_sale_debt(%L, %L, '2026-05-01', %L, 'Lenço', null, jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 3500)))$$,
  :'gid_a', :'assoc_a', :'cat_loja', :'lote'), 'Sem permissão%', 'consulta não lança');

-- Excluir a dívida devolve os itens ao lote
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select lives_ok(format($$select public.delete_debt(%L)$$, :'debt'), 'exclui a dívida');
select is((select quantity from public.inventory_lots where id = :'lote'), 10, 'itens de volta ao lote');

select * from finish();
rollback;
