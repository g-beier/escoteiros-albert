-- pgTAP: transição de ramo iniciada (050) e ramo Filhote (051). Só jovens ativos, por quem gerencia associados; a passagem (troca de ramo)
-- e o desligamento apagam a marca. Rode com `npm run test:db`.
begin;
select plan(14);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.create_section(:'gid_a', 'lobinho', 'Alcateia Transição') as alcateia \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Transição') as tropa \gset
select public.associates_create(:'gid_a', 'Lobo Transição', 'lobinho', :'alcateia', null, '2016-01-10', null, '2023-03-01', null) as lobo \gset
select public.associates_create(:'gid_a', 'Adulto Transição', 'adulto', null, null, null, null, null, null) as adulto \gset

select lives_ok(format($$select public.associates_set_transition(%L, '2026-10-01')$$, :'lobo'), 'admin marca a transição');
select is((select transition_started_on::text from public.associate_profile_rows where id = :'lobo'), '2026-10-01', 'associate_profile_rows traz a data');
select throws_like(format($$select public.associates_set_transition(%L, current_date + 1)$$, :'lobo'), 'A data de início não pode ser no futuro%', 'sem data futura');
select throws_like(format($$select public.associates_set_transition(%L, current_date)$$, :'adulto'), 'Adultos não têm transição%', 'adulto não tem transição');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.associates_set_transition(%L, null)$$, :'lobo'), 'Associado não encontrado ou sem permissão%', 'consulta não marca');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select lives_ok(format($$select public.associates_set_transition(%L, null)$$, :'lobo'), 'desmarca');
select is((select transition_started_on from public.associates where id = :'lobo'), null, 'marca removida');
select public.associates_set_transition(:'lobo', current_date) \gset
select public.associates_move(:'lobo', current_date, 'escoteiro', :'tropa', null) \gset
select is((select transition_started_on from public.associates where id = :'lobo'), null, 'a passagem apaga a marca');
select public.associates_set_transition(:'lobo', current_date) \gset
select public.associates_leave(:'lobo', current_date, 'Mudou de cidade') \gset
select is((select transition_started_on from public.associates where id = :'lobo'), null, 'o desligamento apaga a marca');
select throws_like(format($$select public.associates_set_transition(%L, current_date)$$, :'lobo'), 'O associado está desligado%', 'desligado não tem transição');

-- Filhote (051): ramo de jovens com seção, sem equipes, com transição.
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.create_section(:'gid_a', 'filhote', 'Ninho Transição') as ninho \gset
select public.associates_create(:'gid_a', 'Filhote Transição', 'filhote', :'ninho', null, '2020-03-01', null, null, null) as filhote \gset
select is((select branch::text || '|' || section from public.associate_profile_rows where id = :'filhote'), 'filhote|Ninho Transição', 'filhote na seção do ramo');
select throws_like(format($$select public.create_patrol(%L, 'Equipe')$$, :'ninho'), 'Esta seção não se divide em equipes%', 'seção de filhotes sem equipes');
select lives_ok(format($$select public.associates_set_transition(%L, current_date)$$, :'filhote'), 'filhote tem transição');

select tests.logout() \gset
select ok(exists (select 1 from public.audit_events where entity_id = :'lobo' and action = 'associate.transition_started'), 'marca auditada');

select * from finish();
rollback;
