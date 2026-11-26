-- pgTAP: Lojinha (019): itens vendidos no lançamento dão baixa no Inventário e o estoque acompanha edição e exclusão.
-- Rode com `npm run test:db`.
begin;
select plan(29);
\ir _fixture.psql

-- Inventário: material à venda com dois lotes (o que vence antes sai primeiro) e um que não está à venda.
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.inventory_save_location(:'gid_a', null, null, 'Lojinha', null) as loja \gset
select public.inventory_save_material(:'gid_a', null, null, 'Lenço', 'lot', false, null, null) as lenco \gset
select public.inventory_save_material(:'gid_a', null, null, 'Distintivo', 'lot', false, null, null) as distintivo \gset
select public.inventory_save_material(:'gid_a', null, null, 'Barraca', 'unit', false, null, null) as barraca \gset
select public.inventory_add_lot(:'lenco', :'loja', 5, 'bom', 1000, '2027-12-31', null, 'compra', null, null, null, null) as lot_late \gset
select public.inventory_add_lot(:'lenco', :'loja', 2, 'bom', 1000, '2027-01-31', null, 'compra', null, null, null, 'antigo') as lot_soon \gset
select public.inventory_add_lot(:'distintivo', :'loja', 10, 'bom', 200, null, null, 'compra', null, null, null, null) as lot_dist \gset

select lives_ok(format($$select public.inventory_set_material_sale(%L, true, 2500)$$, :'lenco'), 'lenço à venda por R$ 25');
select lives_ok(format($$select public.inventory_set_material_sale(%L, true, null)$$, :'distintivo'), 'distintivo à venda sem preço');
select throws_like(format($$select public.inventory_set_material_sale(%L, true, null)$$, :'barraca'), 'Só material controlado por quantidade%', 'peça não vai à venda');
select is((select count(*)::int from public.inventory_movements where material_id = :'lenco' and kind = 'edicao' and details->'after'->>'for_sale' = 'true'), 1,
  'marca à venda no histórico do material');

-- Rubrica de receita marcada (vale para a filha).
reset role;
select id as cat_loja from public.categories where group_id = :'gid_a' and kind = 'receita' and parent_id is not null
  and not (id = any(public.fee_category_ids(:'gid_a'))) order by code limit 1 \gset
update public.categories set sells_items = true where id = :'cat_loja';
insert into public.categories(group_id, name, parent_id, kind, position) values (:'gid_a', 'Lenços', :'cat_loja', 'receita', 99) returning id as cat_filha \gset
select id as cat_outra from public.categories where group_id = :'gid_a' and kind = 'receita' and parent_id is not null and id <> :'cat_loja'
  and not public.category_sells_items(id) and not (id = any(public.fee_category_ids(:'gid_a'))) order by code limit 1 \gset
select ok(public.category_sells_items(:'cat_filha'), 'filha herda a marca');

-- Venda pelo Editor do Financeiro sem acesso ao Inventário (…f0a2).
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.create_ledger_entry(:'gid_a', '2026-05-01', 'Venda na reunião', :'pix_a', null, false, 7000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_filha', 'amount_cents', 7000, 'description', 'lenços',
    'items', jsonb_build_array(jsonb_build_object('material_id', :'lenco', 'quantity', 3, 'unit_price_cents', 2000),
                               jsonb_build_object('material_id', :'distintivo', 'quantity', 2, 'unit_price_cents', 500)))), :'acc_a') as sale \gset
select is((select quantity from public.inventory_lots where id = :'lot_soon'), 0, 'lote que vence antes sai primeiro');
select is((select quantity from public.inventory_lots where id = :'lot_late'), 4, 'o resto do lote seguinte');
select is((select quantity from public.inventory_lots where id = :'lot_dist'), 8, 'distintivo baixado');
select is((select count(*)::int from public.inventory_movements where kind = 'baixa' and write_off_reason = 'venda' and details->>'entry_id' = :'sale'), 3,
  'uma baixa "venda" por lote');
select is((select count(*)::int from public.inventory_movements where details->>'entry_id' = :'sale' and channel = 'financeiro' and review_status = 'para_revisar'), 3,
  'canal financeiro, para revisar (quem vendeu não é Editor do Inventário)');
select is((select count(*)::int from public.entry_sale_items where entry_id = :'sale'), 2, 'itens gravados');
select is((select count(*)::int from public.finance_sale_materials(:'gid_a')), 2, 'catálogo (lenço e distintivo) legível sem acesso ao Inventário');
select is((select stock from public.finance_sale_materials(:'gid_a') where id = :'lenco'), 4, 'saldo do lenço no catálogo');

-- Recusas
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select lives_ok(format($$select public.inventory_set_material_sale(%L, false, null)$$, :'distintivo'), 'distintivo sai da venda');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('material_id', %L, 'quantity', 1, 'unit_price_cents', 900)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'lenco', :'acc_a'), '%soma dos itens vendidos não confere%', 'soma diferente do rateio');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('material_id', %L, 'quantity', 1, 'unit_price_cents', 1000)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_outra', :'lenco', :'acc_a'), '%não vende itens%', 'rubrica sem a marca');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 1000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 1000, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('material_id', %L, 'quantity', 1, 'unit_price_cents', 1000)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'distintivo', :'acc_a'), 'Material à venda inválido', 'material que não está à venda');
select throws_like(format($$select public.create_ledger_entry(%L, '2026-05-02', 'Venda', %L, null, false, 100000,
  jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 100000, 'description', 'venda',
    'items', jsonb_build_array(jsonb_build_object('material_id', %L, 'quantity', 5, 'unit_price_cents', 20000)))), %L)$$,
  :'gid_a', :'pix_a', :'cat_loja', :'lenco', :'acc_a'), 'Estoque insuficiente de Lenço: faltam 1 (há 4 no inventário)', 'sem estoque');

-- Edição: menos lenços (devolve ao último lote baixado), distintivo sai da venda (que deixou de estar à venda: continua editável).
select public.update_ledger_entry(:'sale', '2026-05-01', 'Venda na reunião', :'pix_a', null, false, 2000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_filha', 'amount_cents', 2000, 'description', 'lenços',
    'items', jsonb_build_array(jsonb_build_object('material_id', :'lenco', 'quantity', 1, 'unit_price_cents', 2000)))), :'acc_a');
select is((select quantity from public.inventory_lots where id = :'lot_late'), 5, 'devolvido primeiro ao último lote baixado');
select is((select quantity from public.inventory_lots where id = :'lot_soon'), 1, 'e depois ao anterior');
select is((select quantity from public.inventory_lots where id = :'lot_dist'), 10, 'distintivo devolvido');
select is((select count(*)::int from public.inventory_movements where kind = 'entrada' and details->>'sale_return' = 'true' and details->>'entry_id' = :'sale'), 3,
  'devoluções registradas como entrada');
select is((select sum(quantity)::int from public.entry_sale_draws where entry_id = :'sale'), 1, 'resta 1 baixado');

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

-- Exclusão pelo formulário devolve tudo
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.delete_ledger_entry(:'sale');
select is((select sum(quantity)::int from public.inventory_lots where material_id = :'lenco'), 7, 'estoque do lenço de volta');

select * from finish();
rollback;
