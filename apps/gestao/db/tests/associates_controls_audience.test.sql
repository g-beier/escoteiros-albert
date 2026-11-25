-- pgTAP: situações do controle seguem o público do item e o da pessoa (db/migrations/016_controle_publico.sql).
-- Rode com `npm run test:db`.
begin;
select plan(12);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.associates_create(:'gid_a', 'Lia Lobinha', 'lobinho', null, null, null, null, null, null) as lia \gset
select public.associates_create(:'gid_a', 'Edu Escotista', 'adulto', null, null, null, null, null, null) as edu \gset
select public.relatives_create(:'lia', 'Rosa Mãe', 'mae', null, true, false, null) as rosa \gset
select public.control_item_create(:'gid_a', 'Termo de teste', 'documento', 'administrativa',
  '[{"audience":"jovem","initial_status":"pendente"},{"audience":"adulto","initial_status":"pendente"},{"audience":"responsavel","initial_status":"pendente"}]',
  null, true) as termo \gset

-- Item criado não inicializa quem já existe; passar a valer para um público inicializa.
select is((select count(*)::int from public.control_statuses where item_id = :'termo'), 0, 'criar item não cria situações de quem já existe');
select public.control_item_update(:'termo', 'Termo de teste', 'documento', 'administrativa',
  '[{"audience":"adulto","initial_status":"pendente"}]', null, true, null);
select public.control_item_update(:'termo', 'Termo de teste', 'documento', 'administrativa',
  '[{"audience":"jovem","initial_status":"pendente"},{"audience":"adulto","initial_status":"pendente"},{"audience":"responsavel","initial_status":"pendente"}]',
  null, true, null);
select is((select status::text from public.control_statuses where item_id = :'termo' and associate_id = :'lia'), 'pendente', 'público jovem acrescentado: jovem ativo recebe a situação inicial');
select is((select status::text from public.control_statuses where item_id = :'termo' and relative_id = :'rosa'), 'pendente', 'público responsável acrescentado: responsável recebe a situação inicial');
select is((select status::text from public.control_statuses where item_id = :'termo' and associate_id = :'edu'), null, 'adulto já tinha o público: nada muda');

-- Tirar públicos apaga as situações deles; "a remover" fica.
select public.control_status_set(:'edu', :'termo', 'ok', current_date, null, null);
select tests.logout() \gset
update public.control_statuses set status = 'a_remover' where item_id = :'termo' and associate_id = :'lia';
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.control_item_update(:'termo', 'Termo de teste', 'documento', 'administrativa',
  '[{"audience":"adulto","initial_status":"pendente"},{"audience":"responsavel"}]', null, true, null);
select is((select status::text from public.control_statuses where item_id = :'termo' and associate_id = :'lia'), 'a_remover', 'jovem sai do público: "a remover" fica');
select is((select count(*)::int from public.control_statuses where item_id = :'termo' and relative_id = :'rosa'), 1, 'responsável continua no público');
select public.control_item_update(:'termo', 'Termo de teste', 'documento', 'administrativa',
  '[{"audience":"jovem"}]', null, true, null);
select is((select count(*)::int from public.control_statuses where item_id = :'termo' and associate_id = :'edu'), 0, 'adulto sai do público: situação apagada');
select is((select count(*)::int from public.control_statuses where item_id = :'termo' and relative_id = :'rosa'), 0, 'responsável sai do público: situação apagada');
select is((select (details->>'statuses_dropped')::int from public.audit_events where entity_id = :'termo' and action = 'control_item.updated'
    order by created_at desc, id desc limit 1), 2, 'auditoria conta as situações apagadas');

-- Pessoa que muda de público.
select public.control_item_update(:'termo', 'Termo de teste', 'documento', 'administrativa',
  '[{"audience":"adulto","initial_status":"ok"}]', null, true, null);
select public.control_item_create(:'gid_a', 'Só jovens', 'documento', 'administrativa', '[{"audience":"jovem","initial_status":"pendente"}]', null, false) as jovens \gset
select public.associates_create(:'gid_a', 'Ivo Lobinho', 'lobinho', null, null, null, null, null, null) as ivo \gset
select is((select status::text from public.control_statuses where item_id = :'jovens' and associate_id = :'ivo'), 'pendente', 'jovem novo recebe o item de jovens');
select public.associates_update(:'ivo', 'Ivo Lobinho', null, null, null, null, 'provisorio', null, 'adulto', null, null);
select is((select count(*)::int from public.control_statuses where item_id = :'jovens' and associate_id = :'ivo'), 0, 'vira adulto: situação do item de jovens apagada');
select is((select status::text from public.control_statuses where item_id = :'termo' and associate_id = :'ivo'), 'ok', 'vira adulto: recebe a situação inicial do item de adultos');

select * from finish();
rollback;
