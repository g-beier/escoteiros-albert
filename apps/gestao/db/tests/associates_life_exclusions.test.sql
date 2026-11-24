-- pgTAP: períodos não contabilizados da vida escoteira (005, POR Regra 173): motivos, licença só acima de 60 dias,
-- "outro" com observação, sem sobreposição, só pelo Editor do Associados, auditados. Rode com `npm run test:db`.
begin;
select plan(12);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.associates_create(:'gid_a', 'Escoteiro Licença', 'escoteiro', null, null, '2012-01-10', '2020-03-01', '2020-03-01', null) as pessoa \gset

select lives_ok(format($$select public.life_exclusion_save(%L, null, '2021-03-01', '2022-03-01', 'frequencia', null)$$, :'pessoa'), 'frequência: um ano');
select throws_like(format($$select public.life_exclusion_save(%L, null, '2023-01-01', '2023-02-15', 'licenca', null)$$, :'pessoa'),
  'Licença de até 60 dias conta como atividade%', 'licença curta não se lança');
select lives_ok(format($$select public.life_exclusion_save(%L, null, '2023-01-01', '2023-04-01', 'licenca', 'Intercâmbio')$$, :'pessoa'), 'licença acima de 60 dias');
select throws_like(format($$select public.life_exclusion_save(%L, null, '2023-03-01', '2023-05-01', 'suspensao', null)$$, :'pessoa'),
  'Sobrepõe outro período não contabilizado (01/01/2023 a 01/04/2023)%', 'sem sobreposição');
select throws_like(format($$select public.life_exclusion_save(%L, null, '2024-01-01', '2024-02-01', 'outro', '  ')$$, :'pessoa'),
  'Descreva o motivo na observação%', 'outro pede observação');
select throws_like(format($$select public.life_exclusion_save(%L, null, '2024-01-01', '2024-01-01', 'suspensao', null)$$, :'pessoa'),
  'O fim deve ser depois do início%', 'fim depois do início');
select throws_like(format($$select public.life_exclusion_save(%L, null, '2024-01-01', '2024-03-01', 'ferias', null)$$, :'pessoa'),
  'Escolha o motivo%', 'motivo válido');
select id as licenca from public.associate_life_exclusions where associate_id = :'pessoa' and reason = 'licenca' \gset
select lives_ok(format($$select public.life_exclusion_save(%L, %L, '2023-01-01', '2023-05-01', 'licenca', 'Intercâmbio')$$, :'pessoa', :'licenca'), 'corrige');
select is((select ended_on::text from public.associate_life_exclusions where id = :'licenca'), '2023-05-01', 'correção grava');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select is((select count(*)::int from public.associate_life_exclusions where associate_id = :'pessoa'), 2, 'consulta lê');
select throws_like(format($$select public.life_exclusion_delete(%L)$$, :'licenca'), 'Associado não encontrado ou sem permissão%', 'consulta não apaga');

select tests.logout() \gset
select ok(exists (select 1 from public.audit_events where entity_id = :'pessoa' and action = 'associate.life_exclusion_updated'), 'auditado');

select * from finish();
rollback;
