-- pgTAP: seções e patrulhas (028_sections.sql). Escrita só pelas funções auditadas; leitura só no grupo;
-- o associado só aceita seção do seu ramo e patrulha da sua seção. Rode com `npm run test:db`.
begin;
select plan(26);
\ir _fixture.psql

-- Tesouraria do grupo A cadastra pelas funções.
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.create_section(:'gid_a', 'lobinho', 'Alcateia Teste') as sec_a \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Teste') as tropa_a \gset
select public.create_patrol(:'tropa_a', 'Patrulha Lobo') as pat_a \gset
select public.create_patrol(:'tropa_a', 'Patrulha Águia') as pat_a2 \gset

select throws_like(format($$select public.create_section(%L, 'senior', 'alcateia teste')$$, :'gid_a'), 'Já existe a seção%', 'nome de seção repetido (sem diferenciar maiúsculas)');
select throws_like(format($$select public.create_patrol(%L, 'patrulha lobo')$$, :'tropa_a'), 'Já existe a equipe%', 'patrulha repetida na seção');
select throws_like(format($$select public.create_section(%L, 'lobinho', 'X')$$, :'gid_a'), 'Informe um nome de seção%', 'nome curto recusado');
-- 030: Adultos não têm seção; o Clã Pioneiro não se divide em equipes.
select throws_like(format($$select public.create_section(%L, 'adulto', 'Diretoria')$$, :'gid_a'), 'Adultos não têm seção%', 'sem seção de Adulto');
select public.create_section(:'gid_a', 'pioneiro', 'Clã Teste') as cla_a \gset
select throws_like(format($$select public.create_patrol(%L, 'Equipe Indevida')$$, :'cla_a'), 'Esta seção não se divide%', 'Clã Pioneiro sem equipes');
select lives_ok(format($$select public.update_section(%L, 'Alcateia Renomeada', null)$$, :'sec_a'), 'renomeia seção');
select lives_ok(format($$select public.update_patrol(%L, 'Patrulha Águia', false)$$, :'pat_a2'), 'inativa patrulha');
select is((select active from public.patrols where id = :'pat_a2'), false, 'patrulha inativa');
select is((select branch::text from public.sections where id = :'sec_a'), 'lobinho', 'renomear não muda o ramo');

-- Sem escrita direta (só as funções).
select throws_ok(format($$insert into public.sections(group_id, branch, name) values (%L, 'senior', 'Direta')$$, :'gid_a'), '42501', null, 'sem INSERT direto em sections');
select is(tests.affected(format($$update public.sections set name = name where group_id = %L$$, :'gid_a')), 0, 'sem UPDATE direto em sections');
select is(tests.affected(format($$delete from public.patrols where section_id = %L$$, :'tropa_a')), 0, 'sem DELETE direto em patrols');
select throws_ok(format($$insert into public.patrols(group_id, section_id, name) values (%L, %L, 'Direta')$$, :'gid_a', :'tropa_a'), '42501', null, 'sem INSERT direto em patrols');

-- Associado: seção do mesmo ramo e patrulha da mesma seção (chaves compostas).
select lives_ok(format($$update public.associates set section_id = %L where id = %L$$, :'sec_a', :'assoc_a'), 'lobinho na alcateia');
select throws_ok(format($$update public.associates set section_id = %L where id = %L$$, :'tropa_a', :'assoc_a'), '23503', null, 'lobinho não entra na tropa');
select throws_ok(format($$update public.associates set patrol_id = %L where id = %L$$, :'pat_a', :'assoc_a'), '23503', null, 'patrulha de outra seção recusada');
select throws_ok(format($$insert into public.associates(group_id, name, branch, patrol_id) values (%L, 'Sem Seção', 'escoteiro', %L)$$, :'gid_a', :'pat_a'), '23514', null, 'patrulha sem seção recusada');
select lives_ok(format($$insert into public.associates(group_id, name, branch, section_id, patrol_id) values (%L, 'Escoteiro Teste', 'escoteiro', %L, %L)$$, :'gid_a', :'tropa_a', :'pat_a'), 'escoteiro na tropa e patrulha');
select is((select section || ' › ' || patrol from public.associate_rows where name = 'Escoteiro Teste'), 'Tropa Teste › Patrulha Lobo', 'associate_rows traz os nomes');

-- Consulta lê, mas não cadastra.
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select is((select count(*)::int from public.sections where group_id = :'gid_a'), 3, 'consulta lê as seções do grupo');
select throws_like(format($$select public.create_section(%L, 'senior', 'Tropa Sênior')$$, :'gid_a'), 'Sem permissão%', 'consulta não cria seção');

-- Grupo B não vê nem altera nada de A.
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is((select count(*)::int from public.sections where group_id = :'gid_a') + (select count(*)::int from public.patrols where group_id = :'gid_a'), 0, 'B não lê seções nem patrulhas de A');
select is((select count(*)::int from public.associate_rows where group_id = :'gid_a'), 0, 'B não lê associate_rows de A');
select throws_like(format($$select public.update_section(%L, 'Invadida', false)$$, :'sec_a'), 'Seção não encontrada%', 'B não altera seção de A');
select throws_like(format($$select public.create_patrol(%L, 'Invasora')$$, :'tropa_a'), 'Seção não encontrada%', 'B não cria patrulha em A');
select tests.logout() \gset

select is((select count(*)::int from public.audit_events where group_id = :'gid_a' and action in ('section.created', 'section.updated', 'patrol.created', 'patrol.updated')), 7,
  'cadastros e alterações auditados');

select * from finish();
rollback;
