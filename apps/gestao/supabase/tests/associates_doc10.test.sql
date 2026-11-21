-- pgTAP: dados do Doc 10 (054): registro provisório/definitivo, apelido, eleito e os tipos Colaborador e Contribuinte.
-- Rode com `npm run test:db`.
begin;
select plan(12);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.create_section(:'gid_a', 'lobinho', 'Alcateia Doc 10') as alcateia \gset
select public.associates_create(:'gid_a', 'Lia Doc Dez', 'lobinho', :'alcateia', null, null, null, null, null) as lia \gset
select public.associates_create(:'gid_a', 'Davi Doc Dez', 'adulto', null, null, null, null, null, null) as davi \gset

select is((select registration::text from public.associates where id = :'lia'), 'provisorio', 'cadastro novo começa provisório');
select lives_ok(format($$select public.associates_update(%L, 'Lia Doc Dez', null, null, null, null, 'definitivo', ' Lia ')$$, :'lia'), 'edita registro e apelido');
select is((select registration || '|' || nickname from public.associate_profile_rows where id = :'lia'), 'definitivo|Lia', 'associate_profile_rows traz registro e apelido');
select throws_like(format($$select public.associates_update(%L, 'Lia Doc Dez', null, null, null, null, 'definitivo', 'Muito longo')$$, :'lia'), 'Apelido: no máximo 8%', 'apelido longo');
select throws_like(format($$select public.associates_update(%L, 'Lia Doc Dez', null, null, null, null, null, null)$$, :'lia'), 'Escolha o registro%', 'registro obrigatório');
select is((select details->'after'->>'nickname' from public.audit_events where entity_id = :'lia' and action = 'associate.updated' order by created_at desc limit 1), 'Lia', 'auditoria com o apelido');

select public.associates_add_function(:'davi', 'dirigente', 'Presidente', null, null, true) as f_dir \gset
select is((select elected from public.associate_function_rows where id = :'f_dir'), true, 'dirigente eleito');
select throws_like(format($$select public.associates_add_function(%L, 'honorifico', null, null, null, true)$$, :'davi'), 'Só a função de dirigente é eleita%', 'só dirigente é eleito');
select lives_ok(format($$select public.associates_add_function(%L, 'colaborador', null, null)$$, :'davi'), 'colaborador sem seção');
select lives_ok(format($$select public.associates_add_function(%L, 'contribuinte', null, null)$$, :'davi'), 'contribuinte sem seção');
select lives_ok(format($$select public.associates_update_function(%L, 'dirigente', null, 'Presidente', null, null, false)$$, :'f_dir'), 'desmarca eleito');
select is((select elected from public.associate_functions where id = :'f_dir'), false, 'eleito desmarcado');

select * from finish();
rollback;
