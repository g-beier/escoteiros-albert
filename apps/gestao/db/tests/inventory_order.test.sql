-- pgTAP: ordem dos materiais dentro de cada divisão (017, inventory_order_materials). Rode com `npm run test:db`.
begin;
select plan(10);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.inventory_save_location(:'gid_a', null, null, 'Almoxarifado', null) as alm \gset
select public.inventory_save_location(:'gid_a', null, null, 'Cozinha', null) as coz \gset
select public.inventory_save_material(:'gid_a', null, null, 'Panela', 'lot', false, null, null) as panela \gset
select public.inventory_save_material(:'gid_a', null, null, 'Fósforo', 'lot', false, null, null) as fosforo \gset
select public.inventory_save_material(:'gid_a', null, null, 'Caneca', 'lot', false, null, null) as caneca \gset

select is(public.inventory_order_materials(:'alm', array[:'fosforo', :'panela', :'caneca']::uuid[]), 3, 'grava a ordem da divisão');
select is((select string_agg(m.name, ',' order by p.position) from public.inventory_material_positions p join public.inventory_materials m on m.id = p.material_id
    where p.location_id = :'alm'), 'Fósforo,Panela,Caneca', 'posições na ordem pedida');
select is(public.inventory_order_materials(:'coz', array[:'caneca', :'fosforo']::uuid[]), 2, 'outra divisão, outra ordem');
select is(public.inventory_order_materials(:'alm', array[:'caneca', :'fosforo']::uuid[]), 2, 'reordena');
select is((select string_agg(m.name, ',' order by p.position) from public.inventory_material_positions p join public.inventory_materials m on m.id = p.material_id
    where p.location_id = :'alm'), 'Caneca,Fósforo', 'quem ficou de fora perde a posição');
select is((select count(*)::int from public.inventory_material_positions where location_id = :'coz'), 2, 'a outra divisão não muda');
select is((select count(*)::int from public.audit_events where action = 'inventory.materials_ordered' and entity_id = :'alm'), 2, 'auditado');

select throws_like(format($$select public.inventory_order_materials(%L, array[%L, %L]::uuid[])$$, :'alm', :'panela', :'panela'), 'Material repetido%', 'material repetido');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.inventory_order_materials(%L, array[%L]::uuid[])$$, :'alm', :'panela'), '%sem permissão%', 'consulta não ordena');

select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is((select count(*)::int from public.inventory_material_positions), 0, 'outro grupo não lê as posições');

select * from finish();
rollback;
