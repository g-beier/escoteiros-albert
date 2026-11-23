-- pgTAP: módulo Associados (db/migrations/001_schema.sql). Papel por módulo, cadastro, passagens,
-- desligamento e reingresso, seções pela secretaria e isolamento entre grupos. Rode com `npm run test:db`.
begin;
select plan(77);
\ir _fixture.psql

-- Editor do Associados (…f0a6): no Financeiro é só consulta.
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000f0a6', 'rls.secretaria.a@escoteirosalbert.com.br');
insert into public.memberships(group_id, user_id, finance_role) values (:'gid_a', '00000000-0000-0000-0000-00000000f0a6', 'viewer');

-- Papéis -------------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select is(public.associates_role_of(:'gid_a')::text, 'admin', 'quem criou o grupo administra o Associados');
select ok(public.can_manage_associates(:'gid_a'), 'administrador gerencia associados');
select lives_ok(format($$select public.admin_set_module_role(%L, '00000000-0000-0000-0000-00000000f0a6', 'associates', 'editor')$$, :'gid_a'), 'admin define editor');
select is((select associates_role::text from public.memberships where user_id = '00000000-0000-0000-0000-00000000f0a6'), 'editor', 'papel gravado');
select is((select finance_role::text from public.memberships where user_id = '00000000-0000-0000-0000-00000000f0a6'), 'viewer', 'papel no Financeiro não muda');
select throws_like(format($$select public.admin_set_module_role(%L, gen_random_uuid(), 'associates', 'editor')$$, :'gid_a'), 'Usuário não encontrado%', 'usuário fora do grupo');

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select is(public.associates_role_of(:'gid_a')::text, 'editor', 'tesouraria é editora no Associados');
select ok(public.can_manage_associates(:'gid_a'), 'tesouraria gerencia associados');
select throws_like(format($$select public.admin_set_module_role(%L, '00000000-0000-0000-0000-00000000f0a3', 'associates', 'editor')$$, :'gid_a'), 'Apenas o administrador do módulo%', 'tesouraria não altera papéis');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select ok(not public.can_manage_associates(:'gid_a'), 'consulta não gerencia');

select tests.login('00000000-0000-0000-0000-00000000f0a6') \gset
select ok(public.can_manage_associates(:'gid_a'), 'editor gerencia');
select throws_like(format($$select public.admin_set_module_role(%L, '00000000-0000-0000-0000-00000000f0a3', 'associates', 'editor')$$, :'gid_a'), 'Apenas o administrador do módulo%', 'editor não altera papéis');

-- Seções e equipes pela secretaria ------------------------------------------------------------
select public.create_section(:'gid_a', 'lobinho', 'Alcateia Assoc') as alcateia \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Assoc') as tropa \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Assoc 2') as tropa2 \gset
select public.create_section(:'gid_a', 'pioneiro', 'Clã Assoc') as cla \gset
select public.create_patrol(:'tropa', 'Patrulha Lobo') as lobo \gset
select public.create_patrol(:'tropa', 'Patrulha Águia') as aguia \gset
select public.create_patrol(:'tropa2', 'Patrulha Touro') as touro \gset
select lives_ok(format($$select public.update_section(%L, 'Alcateia Assoc', true)$$, :'alcateia'), 'secretaria altera seção');
select lives_ok(format($$select public.update_patrol(%L, 'Patrulha Águia', true)$$, :'aguia'), 'secretaria altera equipe');
select is((select count(*)::int from public.sections where group_id = :'gid_a'), 4, 'secretaria cria seções');

-- Cadastro -------------------------------------------------------------------------------------
select public.associates_create(:'gid_a', '  Ana   Lobinha ', 'lobinho', :'alcateia', null, '2017-04-10', '2024-05-01', '2024-03-01', ' Alergia a amendoim ') as ana \gset
select is((select name from public.associates where id = :'ana'), 'Ana Lobinha', 'nome limpo');
select is((select notes from public.associates where id = :'ana'), 'Alergia a amendoim', 'observação limpa');
select is((select section || '|' || birth_date || '|' || promise_date || '|' || joined_on from public.associate_profile_rows where id = :'ana'),
  'Alcateia Assoc|2017-04-10|2024-05-01|2024-03-01', 'associate_profile_rows traz seção e datas');
select is((select movement_date::text || ' ' || kind from public.associate_movements where associate_id = :'ana'), '2024-03-01 entrada', 'entrada na data de entrada');

select public.associates_create(:'gid_a', 'Bruno Escoteiro', 'escoteiro', :'tropa', :'lobo', null, null, null, null) as bruno \gset
select is((select movement_date from public.associate_movements where associate_id = :'bruno'), current_date, 'sem data de entrada: entrada hoje');
select is((select joined_on from public.associates where id = :'bruno'), null, 'data de entrada fica desconhecida');
select public.associates_create(:'gid_a', 'Carla Pioneira', 'pioneiro', :'cla', null, '2004-01-01', null, '2015-02-01', null) as carla \gset
select public.associates_create(:'gid_a', 'Diretor Adulto', 'adulto', null, null, null, null, null, null) as diretor \gset
select is((select count(*)::int from public.associates where group_id = :'gid_a' and id in (:'ana', :'bruno', :'carla', :'diretor')), 4, 'quatro cadastros');

select throws_like(format($$select public.associates_create(%L, 'X', 'lobinho', null, null, null, null, null, null)$$, :'gid_a'), 'Informe um nome%', 'nome curto');
select throws_like(format($$select public.associates_create(%L, 'Adulto Seção', 'adulto', %L, null, null, null, null, null)$$, :'gid_a', :'tropa'), 'Adultos não têm seção%', 'adulto sem seção');
select throws_like(format($$select public.associates_create(%L, 'Lobo Tropa', 'lobinho', %L, null, null, null, null, null)$$, :'gid_a', :'tropa'), 'A seção não é deste ramo%', 'seção de outro ramo');
select throws_like(format($$select public.associates_create(%L, 'Equipe Errada', 'escoteiro', %L, %L, null, null, null, null)$$, :'gid_a', :'tropa2', :'lobo'), 'A equipe não é desta seção%', 'equipe de outra seção');
select throws_like(format($$select public.associates_create(%L, 'Equipe Solta', 'escoteiro', null, %L, null, null, null, null)$$, :'gid_a', :'lobo'), 'Escolha a seção da equipe%', 'equipe sem seção');
select throws_like(format($$select public.associates_create(%L, 'Sem Ramo', null, null, null, null, null, null, null)$$, :'gid_a'), 'Escolha o ramo%', 'ramo obrigatório');
select throws_like(format($$select public.associates_create(%L, 'Futuro', 'adulto', null, null, current_date + 1, null, null, null)$$, :'gid_a'), 'A data de nascimento não pode ser futura%', 'nascimento futuro');
select throws_like(format($$select public.associates_create(%L, 'Promessa Cedo', 'adulto', null, null, '2010-01-01', '2009-01-01', null, null)$$, :'gid_a'), 'A promessa não pode ser antes do nascimento%', 'promessa antes do nascimento');
select throws_like(format($$select public.associates_create(%L, 'Notas', 'adulto', null, null, null, null, null, repeat('x', 501))$$, :'gid_a'), 'Observações%', 'observação longa');

-- Edição: dados pessoais, sem mexer em ramo/seção.
select lives_ok(format($$select public.associates_update(%L, 'Ana Lobinha Silva', '2017-04-10', null, '2024-03-01', null, 'definitivo', null)$$, :'ana'), 'secretaria edita');
select is((select name || '|' || branch || '|' || section_id::text || '|' || coalesce(notes, '-') || '|' || coalesce(promise_date::text, '-') from public.associates where id = :'ana'),
  'Ana Lobinha Silva|lobinho|' || :'alcateia' || '|-|-', 'edita dados pessoais e mantém ramo e seção');
select throws_like(format($$select public.associates_update(%L, 'Ana', '2017-04-10', null, '2016-01-01', null, 'definitivo', null)$$, :'ana'), 'A entrada não pode ser antes do nascimento%', 'entrada antes do nascimento');

-- Passagens ------------------------------------------------------------------------------------
select public.associates_move(:'ana', '2026-03-01', 'escoteiro', :'tropa', :'aguia') as move_ana \gset
select is((select branch || '|' || section || '|' || patrol from public.associate_rows where id = :'ana'), 'escoteiro|Tropa Assoc|Patrulha Águia', 'passagem de ramo');
select is((select from_branch || '>' || to_branch || '|' || (from_section_id = :'alcateia')::text || '|' || (to_patrol_id = :'aguia')::text from public.associate_moves where id = :'move_ana'),
  'lobinho>escoteiro|true|true', 'passagem registrada com origem e destino');
select throws_like(format($$select public.associates_move(%L, '2026-04-01', 'escoteiro', %L, %L)$$, :'bruno', :'tropa', :'aguia'), 'A passagem é para o ramo seguinte (senior)%', 'passagem não troca equipe no mesmo ramo');
select throws_like(format($$select public.associates_move(%L, '2026-04-01', 'pioneiro', %L, null)$$, :'bruno', :'cla'), 'A passagem é para o ramo seguinte%', 'passagem não pula ramo');
select lives_ok(format($$select public.associates_move(%L, '2026-06-01', 'adulto', null, null)$$, :'carla'), 'pioneiro → adulto');
select is((select branch || '|' || coalesce(section_id::text, '-') || '|' || coalesce(patrol_id::text, '-') from public.associates where id = :'carla'), 'adulto|-|-', 'adulto sem seção nem equipe');
select is((select count(*)::int from public.associate_moves where associate_id in (:'ana', :'bruno', :'carla')), 2, 'duas passagens');
select throws_like(format($$select public.associates_move(%L, '2026-06-01', 'senior', %L, null)$$, :'bruno', :'tropa'), 'A seção não é deste ramo%', 'passagem: seção do novo ramo');

-- Correção da divisão pela edição (055): sem passagem no histórico
select lives_ok(format($$select public.associates_update(%L, 'Bruno Escoteiro', null, null, null, null, 'provisorio', null, 'escoteiro', %L, %L)$$, :'bruno', :'tropa2', :'touro'), 'edição corrige seção e equipe');
select is((select section_id::text || '|' || patrol_id::text from public.associates where id = :'bruno'), :'tropa2' || '|' || :'touro', 'seção e equipe corrigidas');
select is((select count(*)::int from public.associate_moves where associate_id = :'bruno'), 0, 'correção não vira passagem');
select lives_ok(format($$select public.associates_update(%L, 'Bruno Escoteiro', null, null, null, null, 'provisorio', null)$$, :'bruno'), 'sem divisão mantém a atual');
select is((select patrol_id::text from public.associates where id = :'bruno'), :'touro', 'divisão mantida');
select throws_like(format($$select public.associates_update(%L, 'Bruno Escoteiro', null, null, null, null, 'provisorio', null, 'escoteiro', %L, %L)$$, :'bruno', :'tropa', :'touro'), 'A equipe não é desta seção%', 'correção valida a divisão');
select lives_ok(format($$select public.associates_update(%L, 'Carla Pioneira', '2004-01-01', null, '2015-02-01', null, 'provisorio', null, 'pioneiro', %L, null)$$, :'carla', :'cla'), 'edição corrige o ramo');
select is((select branch::text from public.associates where id = :'carla'), 'pioneiro', 'ramo corrigido sem passagem');
select throws_like(format($$select public.associates_move(%L, null, 'escoteiro', %L, null)$$, :'bruno', :'tropa'), 'Informe a data%', 'passagem sem data');

-- Desligamento e reingresso --------------------------------------------------------------------
select throws_like(format($$select public.associates_leave(%L, '2024-01-01', 'Mudou')$$, :'ana'), 'O desligamento não pode ser antes da última entrada%', 'saída antes da entrada');
select lives_ok(format($$select public.associates_leave(%L, '2026-07-01', ' Mudou de cidade ')$$, :'ana'), 'secretaria desliga');
select is((select active from public.associates where id = :'ana'), false, 'desligado fica inativo');
select is((select left_on from public.associate_profile_rows where id = :'ana'), '2026-07-01'::date, 'left_on é a última saída');
select is((select reason from public.associate_movements where associate_id = :'ana' and kind = 'saida'), 'Mudou de cidade', 'motivo gravado');
select throws_like(format($$select public.associates_leave(%L, '2026-07-02', null)$$, :'ana'), 'O associado já está desligado%', 'não desliga duas vezes');
select throws_like(format($$select public.associates_move(%L, '2026-07-02', 'senior', null, null)$$, :'ana'), 'Associado desligado%', 'desligado não faz passagem');
select throws_like(format($$select public.associates_rejoin(%L, '2026-06-30', null)$$, :'ana'), 'O reingresso não pode ser antes do último desligamento%', 'reingresso antes da saída');
select lives_ok(format($$select public.associates_rejoin(%L, '2026-08-01', 'Voltou')$$, :'ana'), 'secretaria reintegra');
select is((select active::text || '|' || coalesce(left_on::text, '-') from public.associate_profile_rows where id = :'ana'), 'true|-', 'ativo de novo, sem left_on');
select throws_like(format($$select public.associates_rejoin(%L, '2026-08-02', null)$$, :'ana'), 'O associado já está ativo%', 'não reingressa ativo');
select is((select string_agg(movement_date || ' ' || kind, ',' order by movement_date) from public.associate_movements where associate_id = :'ana'),
  '2024-03-01 entrada,2026-07-01 saida,2026-08-01 entrada', 'períodos em associate_movements');

-- Tesouraria (transição) cadastra; consulta não ----------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select lives_ok(format($$select public.associates_create(%L, 'Pela Tesouraria', 'adulto', null, null, null, null, null, null)$$, :'gid_a'), 'tesouraria cadastra');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select is((select count(*)::int from public.associate_moves where group_id = :'gid_a'), 2, 'consulta lê as passagens');
select ok(exists(select 1 from public.associate_profile_rows where id = :'ana'), 'consulta lê associate_profile_rows');
select throws_like(format($$select public.associates_create(%L, 'Consulta', 'adulto', null, null, null, null, null, null)$$, :'gid_a'), 'Sem permissão%', 'consulta não cadastra');
select throws_like(format($$select public.associates_update(%L, 'Consulta', null, null, null, null, 'definitivo', null)$$, :'ana'), 'Associado não encontrado ou sem permissão%', 'consulta não edita');
select throws_like(format($$select public.associates_move(%L, '2026-09-01', 'senior', null, null)$$, :'ana'), 'Associado não encontrado ou sem permissão%', 'consulta não faz passagem');
select throws_like(format($$select public.associates_leave(%L, '2026-09-01', null)$$, :'ana'), 'Associado não encontrado ou sem permissão%', 'consulta não desliga');
select throws_like(format($$select public.associates_rejoin(%L, '2026-09-01', null)$$, :'carla'), 'Associado não encontrado ou sem permissão%', 'consulta não reintegra');
select throws_like(format($$select public.create_section(%L, 'senior', 'Tropa Sênior')$$, :'gid_a'), 'Sem permissão%', 'consulta não cria seção');
select throws_ok(format($$insert into public.associate_moves(group_id, associate_id, move_date, from_branch, to_branch) values (%L, %L, current_date, 'lobinho', 'escoteiro')$$, :'gid_a', :'ana'),
  '42501', null, 'sem INSERT direto em associate_moves');

-- Grupo B não vê nem altera nada de A.
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is((select count(*)::int from public.associate_moves where group_id = :'gid_a') + (select count(*)::int from public.associate_profile_rows where group_id = :'gid_a'), 0,
  'B não lê passagens nem cadastros de A');
select throws_like(format($$select public.associates_create(%L, 'Invasor', 'adulto', null, null, null, null, null, null)$$, :'gid_a'), 'Sem permissão%', 'B não cadastra em A');
select throws_like(format($$select public.associates_leave(%L, '2026-09-01', null)$$, :'ana'), 'Associado não encontrado%', 'B não desliga associado de A');
select tests.logout() \gset

select is((select count(*)::int from public.audit_events where group_id = :'gid_a'
  and action in ('associate.created', 'associate.updated', 'associate.moved', 'associate.left', 'associate.rejoined', 'user.role_changed')), 14,
  'cadastros, passagens, saídas e papéis auditados');

select * from finish();
rollback;
