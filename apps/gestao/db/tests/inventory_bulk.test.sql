-- pgTAP: edição em massa da lista de Materiais (011, inventory_bulk). Rode com `npm run test:db`.
begin;
select plan(22);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.inventory_save_location(:'gid_a', null, null, 'Almoxarifado', null) as alm \gset
select public.inventory_save_location(:'gid_a', null, null, 'Cozinha', null) as coz \gset
select public.inventory_save_family(:'gid_a', null, 'Cozinha', '002') as fam \gset
select public.inventory_save_family(:'gid_a', null, 'Barracas', '001') as barracas \gset
select public.inventory_save_material(:'gid_a', null, null, 'Panela', 'lot', false, null, null) as panela \gset
select public.inventory_save_material(:'gid_a', null, null, 'Fósforo', 'lot', false, null, null) as fosforo \gset
select public.inventory_save_material(:'gid_a', null, :'barracas', 'Barraca', 'unit', false, null, null) as barraca \gset
select public.inventory_add_lot(:'panela', :'alm', 3, 'bom', 1000, null, null, 'nao_informada', null, null, null) as lot1 \gset
select public.inventory_add_lot(:'panela', :'alm', 1, 'ruim', 1000, null, null, 'nao_informada', null, null, null) as lot2 \gset
select public.inventory_add_lot(:'panela', :'coz', 2, 'bom', 1000, null, null, 'nao_informada', null, null, null) as lot3 \gset
select public.inventory_add_lot(:'fosforo', :'alm', 10, null, 50, null, null, 'nao_informada', null, null, null) as lot4 \gset
select public.inventory_add_unit(:'barraca', :'alm', 'GEAS-001-0001', null, null, 'bom', null, null, 'nao_informada', null, null, null);

-- Transferir: os dois lotes da panela no almoxarifado vão para a cozinha (o "bom" soma no lote igual de lá).
select is(public.inventory_bulk(:'gid_a', 'transferir',
  jsonb_build_array(jsonb_build_object('material_id', :'panela', 'location_id', :'alm'), jsonb_build_object('material_id', :'barraca', 'location_id', :'alm')),
  jsonb_build_object('to_location_id', :'coz'), 'arrumação'), 3, 'transfere 2 lotes e 1 peça');
select is((select coalesce(sum(quantity), 0)::int from public.inventory_lots where material_id = :'panela' and location_id = :'alm'), 0, 'nada da panela fica no almoxarifado');
select is((select quantity from public.inventory_lots where material_id = :'panela' and location_id = :'coz' and condition = 'bom'), 5, 'lote bom somou no da cozinha');
select is((select location_id from public.inventory_units where material_id = :'barraca'), :'coz'::uuid, 'peça transferida');
select is((select count(*)::int from public.inventory_movements where kind = 'transferencia' and notes = 'arrumação'), 3, 'um movimento por lote/peça, com a observação');

-- Condição e baixa: tudo o que a linha tem.
select is(public.inventory_bulk(:'gid_a', 'condicao', jsonb_build_array(jsonb_build_object('material_id', :'panela', 'location_id', :'coz')),
  jsonb_build_object('condition', 'regular')), 2, 'condição em todos os lotes da linha');
select is((select string_agg(distinct condition::text, ',') from public.inventory_lots where material_id = :'panela' and quantity > 0), 'regular', 'lotes juntos em regular');
select is(public.inventory_bulk(:'gid_a', 'baixa', jsonb_build_array(jsonb_build_object('material_id', :'fosforo', 'location_id', :'alm')),
  jsonb_build_object('reason', 'consumo')), 1, 'baixa de tudo');
select is((select quantity from public.inventory_lots where id = :'lot4'), 0, 'lote zerado');
select throws_like(format($$select public.inventory_bulk(%L, 'baixa', jsonb_build_array(jsonb_build_object('material_id', %L, 'location_id', %L)), '{}')$$, :'gid_a', :'panela', :'coz'),
  'Escolha o motivo%', 'baixa pede motivo');

-- Cadastro: família e consumível valem para o material (uma vez, mesmo em várias linhas).
select is(public.inventory_bulk(:'gid_a', 'familia',
  jsonb_build_array(jsonb_build_object('material_id', :'panela', 'location_id', :'coz'), jsonb_build_object('material_id', :'panela', 'location_id', null),
    jsonb_build_object('material_id', :'fosforo', 'location_id', null)),
  jsonb_build_object('family_id', :'fam')), 2, 'família de 2 materiais');
select is((select count(*)::int from public.inventory_materials where family_id = :'fam'), 2, 'família gravada');
select throws_like(format($$select public.inventory_bulk(%L, 'familia', jsonb_build_array(jsonb_build_object('material_id', %L)), jsonb_build_object('family_id', %L))$$, :'gid_a', :'barraca', :'fam'),
  '%peças com etiqueta de outra família%', 'peça etiquetada segura a família');
select is(public.inventory_bulk(:'gid_a', 'consumivel', jsonb_build_array(jsonb_build_object('material_id', :'fosforo')), jsonb_build_object('value', true)), 1, 'marca consumível');
select throws_like(format($$select public.inventory_bulk(%L, 'consumivel', jsonb_build_array(jsonb_build_object('material_id', %L)), jsonb_build_object('value', true))$$, :'gid_a', :'barraca'),
  '%controlado por peça%', 'peça não vira consumível');

-- Lojinha (020): à venda em lote, sem mexer no preço; peça fica de fora.
select public.inventory_set_material_sale(:'panela', false, 1000);
select is(public.inventory_bulk(:'gid_a', 'venda', jsonb_build_array(jsonb_build_object('material_id', :'panela'), jsonb_build_object('material_id', :'fosforo'),
  jsonb_build_object('material_id', :'barraca')), jsonb_build_object('value', true)), 2, 'marca à venda os dois por quantidade');
select is((select sale_price_cents from public.inventory_materials where id = :'panela'), 1000::bigint, 'preço de venda mantido');
select is((select for_sale from public.inventory_materials where id = :'barraca'), false, 'peça pulada');
select is(public.inventory_bulk(:'gid_a', 'venda', jsonb_build_array(jsonb_build_object('material_id', :'panela')), jsonb_build_object('value', true)), 0, 'já à venda: nada muda');
select is(public.inventory_bulk(:'gid_a', 'venda', jsonb_build_array(jsonb_build_object('material_id', :'panela'), jsonb_build_object('material_id', :'fosforo')),
  jsonb_build_object('value', false)), 2, 'tira da venda');

-- Permissão e isolamento.
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select throws_like(format($$select public.inventory_bulk(%L, 'consumivel', jsonb_build_array(jsonb_build_object('material_id', %L)), jsonb_build_object('value', false))$$, :'gid_a', :'fosforo'),
  'Sem permissão%', 'consulta não edita em massa');
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select throws_like(format($$select public.inventory_bulk(%L, 'consumivel', jsonb_build_array(jsonb_build_object('material_id', %L)), jsonb_build_object('value', false))$$, :'gid_a', :'fosforo'),
  'Sem permissão%', 'outro grupo não edita');

select * from finish();
rollback;
