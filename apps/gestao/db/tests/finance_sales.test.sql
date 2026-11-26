-- pgTAP: Lojinha (019, 021): o lote fica à venda; itens vendidos no lançamento dão baixa exatamente no lote vendido e o
-- estoque acompanha edição e exclusão. Rode com `npm run test:db`.
begin;
select plan(36);
\ir _fixture.psql

-- Inventário: anéis de lenço em dois lotes (couro e metal) e lenços com parte separada para a Lojinha.
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.inventory_save_location(:'gid_a', null, null, 'Lojinha', null) as loja \gset
select public.inventory_save_location(:'gid_a', null, null, 'Tropa', null) as tropa \gset
select public.inventory_save_material(:'gid_a', null, null, 'Anel de lenço', 'lot', false, null, null) as anel \gset
select public.inventory_save_material(:'gid_a', null, null, 'Lenço', 'lot', false, null, null) as lenco \gset
select public.inventory_add_lot(:'anel', :'loja', 10, 'bom', 500, null, null, 'compra', null, null, null, 'couro', true, 1500) as couro \gset
select public.inventory_add_lot(:'anel', :'loja', 4, 'bom', 800, null, null, 'compra', null, null, null, 'metal', true, 2000) as metal \gset
select public.inventory_add_lot(:'lenco', :'tropa', 20, 'bom', 1000, null, null, 'compra', null, null, null, null) as lencos \gset

select is((select for_sale from public.inventory_lots where id = :'couro'), true, 'entrada já à venda (Editor)');
select is(public.inventory_add_lot(:'anel', :'loja', 2, 'bom', 500, null, null, 'compra', null, null, null, 'couro', true, 1500), :'couro'::uuid,
  'entrada igual (à venda, mesmo preço) soma no lote');
select isnt(public.inventory_add_lot(:'anel', :'loja', 1, 'bom', 500, null, null, 'compra', null, null, null, 'couro'), :'couro'::uuid,
  'entrada fora da venda não soma no lote à venda');

-- Separar 5 lenços para a Lojinha: lote novo à venda; o resto continua fora da venda.
select public.inventory_set_lot_sale(:'lencos', true, 3500, 5) as lenco_venda \gset
select is((select quantity from public.inventory_lots where id = :'lencos'), 15, 'resto fora da venda');
select is((select (for_sale, sale_price_cents, quantity)::text from public.inventory_lots where id = :'lenco_venda'), '(t,3500,5)', 'lote separado à venda');
select is((select count(*)::int from public.inventory_movements where kind = 'edicao' and details->>'action' = 'lot_sale' and lot_id = :'lenco_venda'), 1,
  'separação no histórico');
select throws_like(format($$select public.inventory_set_lot_sale(%L, true, 3500, null)$$, :'lenco_venda'), 'O lote já está assim', 'nada a mudar');
-- transferir leva a marca junto, e volta somando no lote igual
select public.inventory_transfer_lot(:'lenco_venda', :'loja', 2, null) as moved \gset
select is((select (for_sale, sale_price_cents, quantity)::text from public.inventory_lots where id = :'moved'), '(t,3500,2)',
  'transferência parcial: o lote novo continua à venda, com o preço');
select is(public.inventory_transfer_lot(:'moved', :'tropa', null, null), :'lenco_venda'::uuid, 'volta e soma no lote à venda igual');

-- Em lote (linha material × divisão): tira da venda e põe de volta.
select is(public.inventory_bulk(:'gid_a', 'venda', jsonb_build_array(jsonb_build_object('material_id', :'lenco', 'location_id', :'tropa')), jsonb_build_object('value', false)),
  1, 'tira da venda os lotes da linha');
select is((select count(*)::int from public.inventory_lots where material_id = :'lenco' and for_sale and quantity > 0), 0, 'nenhum lenço à venda (juntou com o resto)');
select is(public.inventory_bulk(:'gid_a', 'venda', jsonb_build_array(jsonb_build_object('material_id', :'anel', 'location_id', :'loja')), jsonb_build_object('value', true)),
  1, 'põe à venda o lote de couro que estava fora; os outros já estavam');

-- Quem não é Editor do Inventário não põe à venda.
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select throws_like(format($$select public.inventory_set_lot_sale(%L, true, 100, null)$$, :'lencos'), 'Lote não encontrado ou sem permissão', 'sem papel no Inventário');

-- Rubrica de receita marcada (vale para a filha).
reset role;
select id as cat_loja from public.categories where group_id = :'gid_a' and kind = 'receita' and parent_id is not null
  and not (id = any(public.fee_category_ids(:'gid_a'))) order by code limit 1 \gset
update public.categories set sells_items = true where id = :'cat_loja';
insert into public.categories(group_id, name, parent_id, kind, position) values (:'gid_a', 'Anéis', :'cat_loja', 'receita', 99) returning id as cat_filha \gset
select id as cat_outra from public.categories where group_id = :'gid_a' and kind = 'receita' and parent_id is not null and id <> :'cat_loja'
  and not public.category_sells_items(id) and not (id = any(public.fee_category_ids(:'gid_a'))) order by code limit 1 \gset
select ok(public.category_sells_items(:'cat_filha'), 'filha herda a marca');

-- Venda pelo Editor do Financeiro sem acesso ao Inventário (…f0a2): 3 de couro e 1 de metal.
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.create_ledger_entry(:'gid_a', '2026-05-01', 'Venda na reunião', :'pix_a', null, false, 6500,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_filha', 'amount_cents', 6500, 'description', 'anéis',
    'items', jsonb_build_array(jsonb_build_object('lot_id', :'couro', 'quantity', 3, 'unit_price_cents', 1500),
                               jsonb_build_object('lot_id', :'metal', 'quantity', 1, 'unit_price_cents', 2000)))), :'acc_a') as sale \gset
select is((select quantity from public.inventory_lots where id = :'couro'), 9, 'baixa no lote de couro');
select is((select quantity from public.inventory_lots where id = :'metal'), 3, 'baixa no lote de metal');
select is((select count(*)::int from public.inventory_movements where kind = 'baixa' and write_off_reason = 'venda' and details->>'entry_id' = :'sale'
  and channel = 'financeiro' and review_status = 'para_revisar'), 2, 'uma baixa "venda" por lote, canal financeiro, para revisar');
select is((select count(*)::int from public.finance_sale_lots(:'gid_a')), 3, 'catálogo: os 3 lotes de anel à venda, legível sem acesso ao Inventário');
select is((select quantity from public.finance_sale_lots(:'gid_a') where id = :'couro'), 9, 'saldo do lote no catálogo');

-- Recusas
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 900)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'couro', :'acc_a'), '%soma dos itens vendidos não confere%', 'soma diferente do rateio');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 1500,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1500, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 1500)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_outra', :'couro', :'acc_a'), '%não vende itens%', 'rubrica sem a marca');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 1000)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'lencos', :'acc_a'), 'Lote à venda inválido', 'lote fora da venda');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 8000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 8000, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 4, 'unit_price_cents', 2000)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'metal', :'acc_a'), 'Estoque insuficiente de Anel de lenço · metal: faltam 1 (há 3 no lote)', 'sem estoque no lote');

-- Edição: menos couro; o lote de metal saiu da venda e continua editável no lançamento.
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select lives_ok(format($$select public.inventory_set_lot_sale(%L, false, null, null)$$, :'metal'), 'metal sai da venda');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select lives_ok(format($$select public.update_ledger_entry(%L, '2026-05-01', 'Venda na reunião', %L, null, false, 3500,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 3500, 'description', 'anéis',
    'items', jsonb_build_array(jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 1500),
                               jsonb_build_object('lot_id', %L, 'quantity', 1, 'unit_price_cents', 2000)))), %L)$$,
  :'sale', :'pix_a', :'cat_filha', :'couro', :'metal', :'acc_a'), 'edita mantendo o lote que saiu da venda');
select is((select quantity from public.inventory_lots where id = :'couro'), 11, 'couro devolvido (2)');
select is((select quantity from public.inventory_lots where id = :'metal'), 3, 'metal igual');
select is((select count(*)::int from public.inventory_movements where kind = 'entrada' and details->>'sale_return' = 'true' and details->>'entry_id' = :'sale'), 1,
  'devolução registrada como entrada');

-- Travas
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select throws_like(format($$select public.set_splits_category(%L, array[s.id]::uuid[], %L) from public.entry_splits s where s.entry_id = %L$$,
  :'gid_a', :'cat_outra', :'sale'), '%tem itens vendidos%', 'rubrica em lote para uma que não vende');
select lives_ok(format($$select public.set_splits_category(%L, array[s.id]::uuid[], %L) from public.entry_splits s where s.entry_id = %L$$,
  :'gid_a', :'cat_loja', :'sale'), 'para outra que vende: pode');
select throws_like(format($$select public.save_category_tree(%L, jsonb_build_array(jsonb_build_object('key', c.id, 'id', c.id, 'parent', c.parent_id,
  'position', c.position, 'name', c.name, 'active', true, 'sellsItems', false)), '[]'::jsonb) from public.categories c where c.id = %L$$,
  :'gid_a', :'cat_loja'), '%tem lançamentos com itens vendidos%', 'tirar a marca de rubrica com vendas');
reset role;
select throws_like(format($$update public.entry_splits set entry_id = %L where entry_id = %L$$, :'entry_a', :'sale'),
  '%tem itens vendidos%', 'rateio não muda de lançamento (agrupar, desagrupar)');
select throws_like(format($$delete from public.ledger_entries where id = %L$$, :'sale'), '%exclua pelo formulário%', 'exclusão direta recusada');

-- Exclusão pelo formulário devolve tudo ao mesmo lote
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select lives_ok(format($$select public.delete_ledger_entry(%L)$$, :'sale'), 'exclui');
select is((select quantity from public.inventory_lots where id = :'couro'), 12, 'couro de volta');
select is((select quantity from public.inventory_lots where id = :'metal'), 4, 'metal de volta');

select * from finish();
rollback;
