-- pgTAP: vida escoteira (004). Períodos sem sobreposição, só pelo Editor do Associados; acompanhamento automático
-- do período vigente (cadastro, passagem, desligamento, reingresso, funções de escotista e dirigente) sem mexer no
-- passado; estrelas (entrega e ramo corrigido), eventos e anotações. Rode com `npm run test:db`.
begin;
select plan(40);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.create_section(:'gid_a', 'lobinho', 'Alcateia Vida') as alcateia \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Vida') as tropa \gset

-- Cadastro abre o período vigente na data de entrada ------------------------------------------------------------------
select public.associates_create(:'gid_a', 'Lobo Vida', 'lobinho', :'alcateia', null, '2016-01-10', '2023-05-01', '2023-03-01', null) as lobo \gset
select is((select branch::text || '|' || started_on || '|' || coalesce(ended_on::text, '-') || '|' || source
  from public.associate_life_periods where associate_id = :'lobo'), 'lobinho|2023-03-01|-|automatico', 'cadastro abre o período na entrada');

-- Passagem: fecha e abre no ramo novo ---------------------------------------------------------------------------------
select public.associates_move(:'lobo', '2025-02-15', 'escoteiro', :'tropa', null) \gset
select results_eq(format($$select branch::text, started_on, ended_on from public.associate_life_periods where associate_id = %L order by started_on$$, :'lobo'),
  $$values ('lobinho', '2023-03-01'::date, '2025-02-15'::date), ('escoteiro', '2025-02-15'::date, null::date)$$, 'passagem troca o vigente');

-- Desligamento e reingresso -------------------------------------------------------------------------------------------
select public.associates_leave(:'lobo', '2025-08-01', 'Mudou') \gset
select is((select count(*)::int from public.associate_life_periods where associate_id = :'lobo' and ended_on is null), 0, 'desligamento fecha o vigente');
select is((select ended_on::text from public.associate_life_periods where associate_id = :'lobo' and branch = 'escoteiro'), '2025-08-01', 'na data do desligamento');
select public.associates_rejoin(:'lobo', '2025-10-01', 'Voltou') \gset
select is((select branch::text || '|' || started_on from public.associate_life_periods where associate_id = :'lobo' and ended_on is null),
  'escoteiro|2025-10-01', 'reingresso abre outro (lacuna no meio)');

-- Evento antes do vigente não mexe no passado ------------------------------------------------------------------------
select public.associates_leave(:'lobo', current_date, null) \gset
select public.associates_rejoin(:'lobo', current_date, null) \gset
select is((select count(*)::int from public.associate_life_periods where associate_id = :'lobo'), 3, 'sair e voltar no mesmo dia: período de hoje continua');

-- Adulto: só escotista e dirigente contam ------------------------------------------------------------------------------
select public.associates_create(:'gid_a', 'Adulto Vida', 'adulto', null, null, null, '2010-04-01', '2020-01-01', null) as adulto \gset
select is((select count(*)::int from public.associate_life_periods where associate_id = :'adulto'), 0, 'adulto sem função não tem período');
select public.associates_add_function(:'adulto', 'honorifico', null, '2020-02-01') \gset
select is((select count(*)::int from public.associate_life_periods where associate_id = :'adulto'), 0, 'honorífico não conta');
select public.associates_add_function(:'adulto', 'escotista', null, '2021-03-01', :'tropa') as funcao \gset
select is((select branch::text || '|' || started_on from public.associate_life_periods where associate_id = :'adulto' and ended_on is null),
  'adulto|2021-03-01', 'escotista abre período de adulto');
select public.associates_add_function(:'adulto', 'dirigente', null, '2022-01-01') as dirigente \gset
select is((select count(*)::int from public.associate_life_periods where associate_id = :'adulto'), 1, 'segunda função não abre outro');
select public.associates_end_function(:'funcao', '2023-06-01') \gset
select is((select count(*)::int from public.associate_life_periods where associate_id = :'adulto' and ended_on is null), 1, 'ainda dirigente: segue vigente');
select public.associates_end_function(:'dirigente', '2024-01-01') \gset
select is((select ended_on::text from public.associate_life_periods where associate_id = :'adulto'), '2024-01-01', 'última função encerrada fecha o período');

-- Períodos à mão ------------------------------------------------------------------------------------------------------
select lives_ok(format($$select public.life_period_save(%L, null, 'lobinho', '1990-03-01', '1993-02-01', null)$$, :'adulto'), 'inclui período antigo');
select lives_ok(format($$select public.life_period_save(%L, null, 'escoteiro', '1993-02-01', '1996-07-01', 'Grupo Outro')$$, :'adulto'), 'emenda no fim do anterior, em outro grupo');
select throws_like(format($$select public.life_period_save(%L, null, 'senior', '1995-01-01', '1997-01-01', null)$$, :'adulto'),
  'O período se sobrepõe a outro (01/02/1993 a 01/07/1996)%', 'sem sobreposição');
select throws_like(format($$select public.life_period_save(%L, null, 'senior', '1997-01-01', '1997-01-01', null)$$, :'adulto'),
  'O fim do período deve ser depois do início%', 'fim depois do início');
select throws_like(format($$select public.life_period_save(%L, null, 'senior', current_date + 1, null, null)$$, :'adulto'),
  'O início do período não pode ser futuro%', 'início não futuro');
select throws_like(format($$select public.life_period_save(%L, null, 'senior', '1997-01-01', current_date + 1, null)$$, :'adulto'),
  'O fim do período não pode ser futuro%', 'fim não futuro');
select id as antigo from public.associate_life_periods where associate_id = :'adulto' and branch = 'lobinho' \gset
select lives_ok(format($$select public.life_period_save(%L, %L, 'lobinho', '1990-04-01', '1993-02-01', null)$$, :'adulto', :'antigo'), 'corrige período');
select is((select source || '|' || started_on from public.associate_life_periods where id = :'antigo'), 'manual|1990-04-01', 'correção grava');
select lives_ok(format($$select public.life_periods_add(%L, '[{"branch":"senior","started_on":"1996-07-01","ended_on":"1998-01-01"},{"branch":"pioneiro","started_on":"1998-01-01","ended_on":"1999-01-01"}]', 'cadastro')$$, :'adulto'),
  'inclui vários de uma vez');
select throws_like(format($$select public.life_periods_add(%L, '[{"branch":"pioneiro","started_on":"1999-01-01","ended_on":"2000-01-01"},{"branch":"pioneiro","started_on":"1999-06-01"}]', 'cadastro')$$, :'adulto'),
  'O período se sobrepõe%', 'vários: tudo ou nada');
select is((select count(*)::int from public.associate_life_periods where associate_id = :'adulto' and started_on >= '1999-01-01' and started_on < '2000-01-01'), 0, 'nada entrou');

-- Troca do vigente ------------------------------------------------------------------------------------------------------
select lives_ok(format($$select public.life_period_switch(%L, current_date - 10, 'adulto')$$, :'adulto'), 'abre vigente à mão');
select throws_like(format($$select public.life_period_switch(%L, current_date - 20, null)$$, :'adulto'), 'O período vigente começou em%', 'encerrar antes do início');
select lives_ok(format($$select public.life_period_switch(%L, current_date - 5, null)$$, :'adulto'), 'encerra o vigente');
select is((select count(*)::int from public.associate_life_periods where associate_id = :'adulto' and ended_on is null), 0, 'sem vigente');

-- Estrelas ------------------------------------------------------------------------------------------------------------
select lives_ok(format($$select public.life_star_deliver(%L, 3, '2024-05-01')$$, :'lobo'), 'entrega a 3ª estrela');
select lives_ok(format($$select public.life_star_set_branch(%L, 2, 'lobinho')$$, :'lobo'), 'corrige o ramo da 2ª');
select results_eq(format($$select star::int, branch::text, delivered_on from public.associate_stars where associate_id = %L order by star$$, :'lobo'),
  $$values (2, 'lobinho', null::date), (3, null, '2024-05-01'::date)$$, 'estrelas gravadas');
select lives_ok(format($$select public.life_star_set_branch(%L, 2, null)$$, :'lobo'), 'volta ao ramo calculado');
select is((select count(*)::int from public.associate_stars where associate_id = :'lobo' and star = 2), 0, 'linha vazia some');

-- Eventos e anotações ---------------------------------------------------------------------------------------------------
select public.life_event_save(:'lobo', null, '2024-10-16', 'Cruzeiro do Sul', null) as evento \gset
select is((select title from public.associate_life_events where id = :'evento'), 'Cruzeiro do Sul', 'evento incluído');
select throws_like(format($$select public.life_event_save(%L, null, current_date + 1, 'Futuro', null)$$, :'lobo'), 'A data do evento não pode ser futura%', 'evento não futuro');
select lives_ok(format($$select public.life_notes_set(%L, '11 anos em 2021')$$, :'lobo'), 'anotações');

-- Permissões ----------------------------------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select is((select count(*)::int from public.associate_life_periods where associate_id = :'lobo'), 3, 'consulta lê os períodos');
select throws_like(format($$select public.life_period_save(%L, null, 'lobinho', '2000-01-01', '2001-01-01', null)$$, :'lobo'),
  'Associado não encontrado ou sem permissão%', 'consulta não lança período');
select throws_like(format($$select public.life_event_delete(%L)$$, :'evento'), 'Associado não encontrado ou sem permissão%', 'consulta não apaga evento');
select throws_like(format($$insert into public.associate_life_periods(group_id, associate_id, branch, started_on) values (%L, %L, 'lobinho', '2000-01-01')$$, :'gid_a', :'lobo'),
  '%row-level security%', 'sem escrita direta');

select tests.logout() \gset
select ok(exists (select 1 from public.audit_events where entity_id = :'lobo' and action = 'associate.star_delivered'), 'entrega auditada');

select * from finish();
rollback;
