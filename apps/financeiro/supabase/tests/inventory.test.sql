-- pgTAP: Inventário (032_inventory_catalog.sql). Papéis por app, divisões em árvore, famílias, materiais,
-- lotes, peças com etiqueta, revisão, escrita só pelas funções e isolamento entre grupos.
-- Rode com `npm run test:db`.
begin;
select plan(113);
\ir _fixture.psql

-- Chefe (…f0a4) e gestor (…f0a5) do grupo A: no Financeiro são só consulta.
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000f0a4', 'rls.chefe.a@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-00000000f0a5', 'rls.gestor.a@escoteirosalbert.com.br');
insert into public.memberships(group_id, user_id, role) values
  (:'gid_a', '00000000-0000-0000-0000-00000000f0a4', 'viewer'),
  (:'gid_a', '00000000-0000-0000-0000-00000000f0a5', 'viewer');

-- Papéis -------------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select ok(public.can_manage_inventory(:'gid_a'), 'administrador do grupo é gestor do Inventário');
select lives_ok(format($$select public.admin_change_inventory_role(%L, '00000000-0000-0000-0000-00000000f0a4', 'chief')$$, :'gid_a'), 'admin define chefe');
select lives_ok(format($$select public.admin_change_inventory_role(%L, '00000000-0000-0000-0000-00000000f0a5', 'manager')$$, :'gid_a'), 'admin define gestor');
select is((select inventory_role::text from public.memberships where user_id = '00000000-0000-0000-0000-00000000f0a4'), 'chief', 'papel do chefe gravado');
select is((select role::text from public.memberships where user_id = '00000000-0000-0000-0000-00000000f0a5'), 'viewer', 'papel no Financeiro não muda');

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select ok(not public.can_edit_inventory(:'gid_a'), 'tesouraria sem papel no Inventário não edita');
select throws_like(format($$select public.inventory_save_location(%L, null, null, 'Tesouraria', null)$$, :'gid_a'), 'Sem permissão%', 'tesouraria não cria divisão');
select throws_like(format($$select public.admin_change_inventory_role(%L, '00000000-0000-0000-0000-00000000f0a4', 'manager')$$, :'gid_a'), 'Apenas administradores%', 'tesouraria não altera papéis');

select tests.login('00000000-0000-0000-0000-00000000f0a5') \gset
select ok(public.can_manage_inventory(:'gid_a'), 'gestor gerencia o Inventário');
select throws_like(format($$select public.admin_change_inventory_role(%L, '00000000-0000-0000-0000-00000000f0a4', 'manager')$$, :'gid_a'), 'Apenas administradores%', 'gestor não altera papéis');

-- Divisões (gestor) ---------------------------------------------------------------------------
select public.inventory_save_location(:'gid_a', null, null, 'Cozinha', null) as coz \gset
select public.inventory_save_location(:'gid_a', null, :'coz', 'Estante', null) as est \gset
select public.inventory_save_location(:'gid_a', null, :'est', 'Nível 2', null) as niv \gset
select public.inventory_save_location(:'gid_a', null, null, 'Vazia', null) as vazia \gset
select is((select path from public.inventory_location_paths where id = :'niv'), 'Cozinha › Estante › Nível 2', 'caminho da divisão em árvore');
select is((select depth from public.inventory_location_paths where id = :'niv'), 2, 'profundidade da divisão');
select throws_like(format($$select public.inventory_save_location(%L, null, %L, 'estante', null)$$, :'gid_a', :'coz'), 'Já existe a divisão%', 'nome repetido no mesmo nível');
select lives_ok(format($$select public.inventory_save_location(%L, null, null, 'Estante', null)$$, :'gid_a'), 'mesmo nome em outro nível');
select throws_like(format($$select public.inventory_save_location(%L, %L, %L, 'Cozinha', null)$$, :'gid_a', :'coz', :'niv'), 'Uma divisão não pode ficar dentro dela mesma%', 'ciclo barrado');
select throws_like(format($$select public.inventory_save_location(%L, %L, %L, 'Cozinha', null)$$, :'gid_a', :'coz', :'coz'), 'Uma divisão não pode ficar dentro dela mesma%', 'divisão não é pai de si mesma');
select lives_ok(format($$select public.inventory_save_location(%L, %L, null, 'Vazia', null, false)$$, :'gid_a', :'vazia'), 'inativa divisão vazia');

-- Ordem escolhida (034): divisão nova entra no fim; o gestor sobe/desce entre as irmãs.
select is((select string_agg(name, ',' order by sort_key) from public.inventory_location_paths where group_id = :'gid_a' and depth = 0), 'Cozinha,Vazia,Estante', 'raízes na ordem de criação, não alfabética');
select lives_ok(format($$select public.inventory_move_location((select id from public.inventory_locations where group_id = %L and parent_id is null and name = 'Estante'), -1)$$, :'gid_a'), 'gestor sobe a divisão');
select is((select string_agg(name, ',' order by sort_key) from public.inventory_location_paths where group_id = :'gid_a' and depth = 0), 'Cozinha,Estante,Vazia', 'nova ordem das raízes');
select throws_like(format($$select public.inventory_move_location(%L, -1)$$, :'coz'), 'A divisão já é a primeira%', 'primeira não sobe');
select throws_like(format($$select public.inventory_move_location(%L, 1)$$, :'vazia'), 'A divisão já é a última%', 'última não desce');
select public.inventory_save_location(:'gid_a', null, null, 'Despensa', null) as desp \gset
select lives_ok(format($$select public.inventory_save_location(%L, %L, %L, 'Despensa', null)$$, :'gid_a', :'desp', :'coz'), 'muda de superior');
select is((select string_agg(name, ',' order by sort_key) from public.inventory_location_paths where parent_id = :'coz'), 'Estante,Despensa', 'ao mudar de superior, entra no fim');

-- Famílias (gestor) ---------------------------------------------------------------------------
select public.inventory_save_family(:'gid_a', null, 'Barracas', '001') as fam \gset
select public.inventory_save_family(:'gid_a', null, 'Sem código', null) as fam_sem \gset
select throws_like(format($$select public.inventory_save_family(%L, null, 'Lonas', '01')$$, :'gid_a'), 'O código da família tem 3 dígitos%', 'código com 3 dígitos');
select throws_like(format($$select public.inventory_save_family(%L, null, 'Lonas', '001')$$, :'gid_a'), 'O código 001 já é de outra família', 'código único no grupo');
select throws_like(format($$select public.inventory_save_family(%L, null, 'barracas', null)$$, :'gid_a'), 'Já existe a família%', 'nome de família único');

-- Chefe: não mexe em divisões nem famílias ------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a4') \gset
select ok(public.can_edit_inventory(:'gid_a') and not public.can_manage_inventory(:'gid_a'), 'chefe edita, mas não gerencia');
select throws_like(format($$select public.inventory_save_location(%L, null, null, 'Do chefe', null)$$, :'gid_a'), 'Sem permissão para alterar divisões', 'chefe não cria divisão');
select throws_like(format($$select public.inventory_move_location(%L, 1)$$, :'coz'), 'Divisão não encontrada ou sem permissão', 'chefe não reordena divisões');
select throws_like(format($$select public.inventory_save_family(%L, null, 'Do chefe', null)$$, :'gid_a'), 'Sem permissão para alterar famílias', 'chefe não cria família');

-- Materiais (chefe) ---------------------------------------------------------------------------
select throws_like(format($$select public.inventory_save_material(%L, null, null, 'Gás', 'unit', true, null, null)$$, :'gid_a'), 'Consumível é controlado por quantidade', 'consumível só por lote');
select public.inventory_save_material(:'gid_a', null, null, 'Caneca', 'lot', false, 10, null) as can \gset
select public.inventory_save_material(:'gid_a', null, :'fam', 'Barraca iglu', 'unit', false, null, null) as bar \gset
select public.inventory_save_material(:'gid_a', null, :'fam_sem', 'Lampião', 'unit', false, null, null) as lamp \gset
select throws_like(format($$select public.inventory_save_material(%L, null, null, 'caneca', 'lot', false, null, null)$$, :'gid_a'), 'Já existe o material%', 'nome de material único');
select is((select review_status::text from public.inventory_movements where material_id = :'can' and kind = 'edicao'), 'pendente', 'cadastro do chefe nasce pendente');

-- Lote: entrada, transferência, condição, ajuste, baixa ----------------------------------------
select public.inventory_add_lot(:'can', :'coz', 12, 'bom', 500, null, null, null, null, null, null) as lot \gset
select throws_like(format($$select public.inventory_add_lot(%L, %L, 1, null, null, null, null, null, null, null, null)$$, :'bar', :'coz'), 'Este material é controlado por peça%', 'peça não recebe lote');
select throws_like(format($$select public.inventory_add_lot(%L, %L, 0, null, null, null, null, null, null, null, null)$$, :'can', :'coz'), 'A quantidade deve ser positiva', 'lote com quantidade positiva');
select throws_like(format($$select public.inventory_add_lot(%L, %L, 1, null, null, null, null, null, null, null, null)$$, :'can', :'vazia'), 'Escolha uma divisão ativa', 'divisão inativa não recebe material');
select is((select origin::text from public.inventory_lots where id = :'lot'), 'nao_informada', 'origem padrão: não informada');

select public.inventory_transfer_lot(:'lot', :'est', 4, 'metade') as lot2 \gset
select is((select quantity from public.inventory_lots where id = :'lot'), 8, 'transferência parcial tira do lote de origem');
select is((select quantity || '@' || (location_id = :'est') from public.inventory_lots where id = :'lot2'), '4@true', 'transferência parcial cria lote no destino');
select is((select unit_value_cents from public.inventory_lots where id = :'lot2'), 500::bigint, 'lote novo herda o valor');
select is(public.inventory_transfer_lot(:'lot2', :'niv', null, null), :'lot2'::uuid, 'transferência total move o próprio lote');
select ok((select location_id = :'niv' from public.inventory_lots where id = :'lot2'), 'lote inteiro na nova divisão');
select throws_like(format($$select public.inventory_transfer_lot(%L, %L, null, null)$$, :'lot2', :'niv'), 'O lote já está nesta divisão', 'transferência para a mesma divisão');
select throws_like(format($$select public.inventory_transfer_lot(%L, %L, 99, null)$$, :'lot2', :'coz'), 'Quantidade inválida%', 'transferência maior que o lote');

select public.inventory_set_lot_condition(:'lot2', 'ruim', 1, null) as lot3 \gset
select is((select quantity from public.inventory_lots where id = :'lot2'), 3, 'condição parcial tira do lote');
select is((select quantity || ' ' || condition from public.inventory_lots where id = :'lot3'), '1 ruim', 'condição parcial cria lote com a nova condição');
select throws_like(format($$select public.inventory_set_lot_condition(%L, 'ruim', null, null)$$, :'lot3'), 'O lote já está nesta condição', 'condição igual recusada');

select throws_like(format($$select public.inventory_adjust_lot(%L, 9, null)$$, :'lot'), 'Explique o ajuste%', 'ajuste exige observação');
select throws_like(format($$select public.inventory_adjust_lot(%L, 8, 'igual')$$, :'lot'), 'A quantidade não mudou', 'ajuste sem mudança recusado');
select lives_ok(format($$select public.inventory_adjust_lot(%L, 9, 'contagem')$$, :'lot'), 'ajuste com observação');
select is((select details from public.inventory_movements where lot_id = :'lot' and kind = 'ajuste'), '{"to": 9, "from": 8}'::jsonb, 'ajuste guarda de/para');

select throws_like(format($$select public.inventory_write_off_lot(%L, 1, null, null)$$, :'lot'), 'Escolha o motivo da baixa', 'baixa exige motivo');
select throws_like(format($$select public.inventory_write_off_lot(%L, 10, 'perda', null)$$, :'lot'), 'Quantidade inválida%', 'baixa maior que o lote');
select lives_ok(format($$select public.inventory_write_off_lot(%L, 2, 'perda', 'sumiram')$$, :'lot'), 'baixa parcial');
select lives_ok(format($$select public.inventory_write_off_lot(%L, null, 'descarte', null)$$, :'lot3'), 'baixa total');
select is((select quantity from public.inventory_lots where id = :'lot') + (select quantity from public.inventory_lots where id = :'lot3'), 7, 'baixas descontadas do estoque');
select is((select write_off_reason::text from public.inventory_movements where lot_id = :'lot3' and kind = 'baixa'), 'descarte', 'motivo da baixa no movimento');

select throws_like(format($$select public.inventory_save_material(%L, %L, null, 'Caneca', 'unit', false, 10, null)$$, :'gid_a', :'can'), 'Não é possível trocar o controle%', 'controle não muda com estoque');

-- Peças com etiqueta ---------------------------------------------------------------------------
select throws_like(format($$select public.inventory_add_unit(%L, %L, 'GEAS-1-1', null, null, null, null, null, null, null, null, null)$$, :'bar', :'est'), 'A etiqueta segue o formato%', 'formato da etiqueta');
select throws_like(format($$select public.inventory_add_unit(%L, %L, 'GEAS-002-0001', null, null, null, null, null, null, null, null, null)$$, :'bar', :'est'), 'A etiqueta deve começar com GEAS-001-%', 'etiqueta com o código da família');
select throws_like(format($$select public.inventory_add_unit(%L, %L, 'GEAS-001-0001', null, null, null, null, null, null, null, null, null)$$, :'lamp', :'est'), 'Defina a família do material%', 'etiqueta exige família com código');
select throws_like(format($$select public.inventory_add_unit(%L, %L, null, null, null, null, null, null, null, null, null, null)$$, :'can', :'est'), 'Este material é controlado por quantidade%', 'lote não recebe peça');
select public.inventory_add_unit(:'bar', :'est', 'geas-001-0001', 'B1', 'verde', 'bom', 15000, null, 'compra', null, null, null) as u1 \gset
select is((select tag from public.inventory_units where id = :'u1'), 'GEAS-001-0001', 'etiqueta normalizada em maiúsculas');
select throws_like(format($$select public.inventory_add_unit(%L, %L, 'GEAS-001-0001', null, null, null, null, null, null, null, null, null)$$, :'bar', :'est'), 'A etiqueta GEAS-001-0001 já está em uso', 'etiqueta única');
select public.inventory_add_unit(:'bar', :'est', null, 'B2', null, 'regular', 9000, null, null, null, null, null) as u2 \gset
select is((select tag from public.inventory_units where id = :'u2'), null, 'etiqueta opcional');
select lives_ok(format($$select public.inventory_add_unit(%L, %L, null, null, null, null, null, null, null, null, null, null)$$, :'lamp', :'est'), 'peça sem etiqueta em família sem código');
select is(public.inventory_next_tag(:'fam'), 'GEAS-001-0002', 'próxima etiqueta livre da família');
select is(public.inventory_next_tag(:'fam_sem'), null, 'família sem código não sugere etiqueta');
select lives_ok(format($$select public.inventory_update_unit(%L, 'GEAS-001-0007', 'B2', null, 9000, null, null, null, null, null)$$, :'u2'), 'etiqueta a peça depois');
select is(public.inventory_next_tag(:'fam'), 'GEAS-001-0008', 'sugestão segue a maior etiqueta');

select lives_ok(format($$select public.inventory_set_unit_condition(%L, 'regular', 'esteio torto')$$, :'u1'), 'condição da peça');
select lives_ok(format($$select public.inventory_transfer_unit(%L, %L, null)$$, :'u1', :'coz'), 'transfere peça');
select lives_ok(format($$select public.inventory_write_off_unit(%L, 'extravio', null)$$, :'u2'), 'baixa da peça');
select throws_like(format($$select public.inventory_transfer_unit(%L, %L, null)$$, :'u2', :'coz'), 'Esta peça já foi baixada', 'peça baixada não se move');

-- Estoque por material ------------------------------------------------------------------------
select is((select quantity from public.inventory_material_rows where id = :'can'), 10, 'quantidade do material = soma dos lotes');
select is((select estimated_value_cents from public.inventory_material_rows where id = :'can'), 5000::bigint, 'valor estimado = quantidade × valor do lote');
select is((select below_minimum from public.inventory_material_rows where id = :'can'), false, 'no mínimo não alerta');
select lives_ok(format($$select public.inventory_save_material(%L, %L, null, 'Caneca', 'lot', false, 11, null)$$, :'gid_a', :'can'), 'sobe o estoque mínimo');
select is((select below_minimum from public.inventory_material_rows where id = :'can'), true, 'abaixo do mínimo alerta');
select is((select quantity || '/' || estimated_value_cents from public.inventory_material_rows where id = :'bar'), '1/15000', 'peça baixada não conta');

-- Revisão: chefe pendente, gestor e admin já revisados ------------------------------------------
select is((select count(*)::int from public.inventory_movements where created_by = '00000000-0000-0000-0000-00000000f0a4' and review_status <> 'pendente'), 0, 'todos os movimentos do chefe pendentes');

select tests.login('00000000-0000-0000-0000-00000000f0a5') \gset
select public.inventory_add_lot(:'can', :'coz', 3, null, null, '2027-05-31', null, 'doacao', null, null, null) as lot_g \gset
select is((select review_status::text || (reviewed_by = created_by) from public.inventory_movements where lot_id = :'lot_g'), 'revisadotrue', 'movimento do gestor nasce revisado');
select throws_like(format($$select public.inventory_save_family(%L, %L, 'Barracas', '002')$$, :'gid_a', :'fam'), 'Há peças etiquetadas%', 'código da família preso às etiquetas');
select throws_like(format($$select public.inventory_save_location(%L, %L, null, 'Cozinha', null, false)$$, :'gid_a', :'coz'), 'Esvazie a divisão%', 'divisão com estoque não inativa');
select is((select next_expiry from public.inventory_material_rows where id = :'can'), '2027-05-31'::date, 'próxima validade do material');

-- Estoque por divisão (033): lotes com saldo e peças não baixadas ------------------------------------
select is((select quantity || '/' || value_cents from public.inventory_stock_by_location where material_id = :'bar' and location_id = :'coz'), '1/15000', 'peça transferida conta na divisão; baixada não');
select is((select sum(quantity)::int from public.inventory_stock_by_location where material_id = :'can'), (select quantity from public.inventory_material_rows where id = :'can'), 'soma por divisão = total do material (lote zerado fora)');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.inventory_add_lot(:'can', :'coz', 1, null, null, null, null, null, null, null, null) as lot_adm \gset
select is((select review_status::text from public.inventory_movements where lot_id = :'lot_adm'), 'revisado', 'movimento do admin nasce revisado');

-- Sem escrita direta (só as funções) ------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a4') \gset
select throws_ok(format($$insert into public.inventory_locations(group_id, name) values (%L, 'Direta')$$, :'gid_a'), '42501', null, 'sem INSERT direto em divisões');
select throws_ok(format($$insert into public.inventory_families(group_id, name) values (%L, 'Direta')$$, :'gid_a'), '42501', null, 'sem INSERT direto em famílias');
select throws_ok(format($$insert into public.inventory_materials(group_id, name, tracking) values (%L, 'Direto', 'lot')$$, :'gid_a'), '42501', null, 'sem INSERT direto em materiais');
select throws_ok(format($$insert into public.inventory_lots(group_id, material_id, location_id, quantity) values (%L, %L, %L, 1)$$, :'gid_a', :'can', :'coz'), '42501', null, 'sem INSERT direto em lotes');
select throws_ok(format($$insert into public.inventory_units(group_id, material_id, location_id) values (%L, %L, %L)$$, :'gid_a', :'bar', :'coz'), '42501', null, 'sem INSERT direto em peças');
select throws_ok(format($$insert into public.inventory_movements(group_id, kind, material_id, review_status) values (%L, 'ajuste', %L, 'revisado')$$, :'gid_a', :'can'), '42501', null, 'sem INSERT direto em movimentos');
select is(tests.affected(format($$update public.inventory_lots set quantity = 999 where group_id = %L$$, :'gid_a')), 0, 'sem UPDATE direto em lotes');
select is(tests.affected(format($$update public.inventory_movements set review_status = 'revisado' where group_id = %L$$, :'gid_a')), 0, 'chefe não se autorrevisa');
select is(tests.affected(format($$delete from public.inventory_movements where group_id = %L$$, :'gid_a')), 0, 'sem DELETE direto em movimentos');

-- Contagens anuais (035): gestor registra/corrige; chefe não; sem escrita direta -------------------
select tests.login('00000000-0000-0000-0000-00000000f0a5') \gset
select public.inventory_record_count(:'can', :'coz', 2025, 7, null) as cnt \gset
select lives_ok(format($$select public.inventory_record_count(%L, %L, 2025, 9, 'recontado')$$, :'can', :'coz'), 'corrige a contagem do ano');
select is((select quantity || '/' || count(*) over () from public.inventory_counts where group_id = :'gid_a'), '9/1', 'uma contagem por ano, material e divisão');
select throws_like(format($$select public.inventory_record_count(%L, %L, 1990, 1, null)$$, :'can', :'coz'), 'Ano inválido', 'ano fora do intervalo');
select tests.login('00000000-0000-0000-0000-00000000f0a4') \gset
select throws_like(format($$select public.inventory_record_count(%L, %L, 2025, 1, null)$$, :'can', :'coz'), 'Material não encontrado ou sem permissão', 'chefe não registra contagem');
select throws_ok(format($$insert into public.inventory_counts(group_id, year, material_id, location_id, quantity) values (%L, 2024, %L, %L, 1)$$, :'gid_a', :'can', :'coz'), '42501', null, 'sem INSERT direto em contagens');

-- Consulta lê, mas não altera -------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select is((select count(*)::int from public.inventory_materials where group_id = :'gid_a'), 3, 'consulta lê os materiais');
select throws_like(format($$select public.inventory_add_lot(%L, %L, 1, null, null, null, null, null, null, null, null)$$, :'can', :'coz'), 'Material não encontrado ou sem permissão', 'consulta não dá entrada');

-- Grupo B não vê nem altera nada de A -----------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is((select count(*)::int from public.inventory_locations where group_id = :'gid_a') + (select count(*)::int from public.inventory_materials where group_id = :'gid_a')
  + (select count(*)::int from public.inventory_lots where group_id = :'gid_a') + (select count(*)::int from public.inventory_units where group_id = :'gid_a')
  + (select count(*)::int from public.inventory_movements where group_id = :'gid_a') + (select count(*)::int from public.inventory_families where group_id = :'gid_a'), 0, 'B não lê o inventário de A');
select is((select count(*)::int from public.inventory_material_rows where group_id = :'gid_a') + (select count(*)::int from public.inventory_location_paths where group_id = :'gid_a')
  + (select count(*)::int from public.inventory_stock_by_location where group_id = :'gid_a') + (select count(*)::int from public.inventory_counts where group_id = :'gid_a'), 0, 'B não lê as visões de A');
select throws_like(format($$select public.inventory_add_lot(%L, %L, 1, null, null, null, null, null, null, null, null)$$, :'can', :'coz'), 'Material não encontrado ou sem permissão', 'B não dá entrada em A');
select throws_like(format($$select public.inventory_transfer_lot(%L, %L, null, null)$$, :'lot', :'coz'), 'Lote não encontrado ou sem permissão', 'B não move lote de A');
select throws_like(format($$select public.inventory_save_location(%L, null, null, 'Invasora', null)$$, :'gid_a'), 'Sem permissão%', 'B não cria divisão em A');
select throws_like(format($$select public.inventory_next_tag(%L)$$, :'fam'), 'Família não encontrada', 'B não consulta etiquetas de A');
select tests.logout() \gset

select is((select count(*)::int from public.audit_events where group_id = :'gid_a' and action like 'inventory.%' and details ? 'movement_id'),
  (select count(*)::int from public.inventory_movements where group_id = :'gid_a'), 'cada movimento tem seu evento de auditoria');
select is((select count(*)::int from public.audit_events where group_id = :'gid_a' and action ~ '^inventory\.(location|family)_'), 11, 'divisões e famílias auditadas');

select * from finish();
rollback;
