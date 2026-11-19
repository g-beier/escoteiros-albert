-- pgTAP: responsáveis dos jovens e valor inicial dos itens de controle (041_associates_controls.sql).
-- Valor inicial no cadastro, responsável compartilhado por irmãos, situações do responsável, "a remover"
-- no desligamento, desvincular, permissões e isolamento entre grupos. Rode com `npm run test:db`.
begin;
select plan(78);
\ir _fixture.psql

select id as email from public.control_items where group_id = :'gid_a' and name = 'Contatos no e-mail do GEAS' \gset
select id as insta from public.control_items where group_id = :'gid_a' and name = 'Instagram do GEAS' \gset
select id as aptidao from public.control_items where group_id = :'gid_a' and name = 'Ficha de aptidão' \gset
select id as equipes from public.control_items where group_id = :'gid_a' and name = 'Equipes no Paxtu' \gset
select id as medica from public.control_items where group_id = :'gid_a' and name = 'Ficha médica impressa' \gset
select id as paxtu from public.control_items where group_id = :'gid_a' and name = 'Dados individuais no Paxtu' \gset

-- Valor inicial no cadastro do associado ------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
-- Ficha médica começa ok (vale 12 meses); Equipes no Paxtu começa sem registro; Palestra desativada.
select lives_ok(format($$select public.control_item_update(%L, 'Ficha médica impressa', 'documento', 'administrativa',
  '[{"audience":"jovem","initial_status":"ok"},{"audience":"adulto","initial_status":"pendente"}]', 12, false, null)$$, :'medica'), 'valor inicial ok na ficha médica');
select lives_ok(format($$select public.control_item_update(%L, 'Equipes no Paxtu', 'sistema', 'metodos_educativos', '[{"audience":"jovem","initial_status":null}]', null, false, null)$$, :'equipes'),
  'Equipes no Paxtu sem valor inicial');
select id as palestra from public.control_items where group_id = :'gid_a' and name = 'Palestra Vamos Falar de Escotismo' \gset
select lives_ok(format($$select public.control_item_update(%L, 'Palestra Vamos Falar de Escotismo', 'etapa', 'metodos_educativos', '[{"audience":"jovem","initial_status":"pendente"},{"audience":"adulto","initial_status":"pendente"}]', null, false, false)$$, :'palestra'),
  'desativa a palestra');

select public.associates_create(:'gid_a', 'Ana Teste', 'escoteiro', null, null, null, null, null, null) as ana \gset
select is((select count(*)::int from public.control_statuses where associate_id = :'ana'),
  (select count(*)::int from public.control_items i join public.control_item_audiences a on a.item_id = i.id
   where i.group_id = :'gid_a' and i.active and a.audience = 'jovem' and a.initial_status is not null),
  'jovem nasce com uma situação por item ativo de jovem com valor inicial');
select is((select count(*)::int from public.control_statuses where associate_id = :'ana' and status = 'pendente' and status_date = current_date), 8,
  'oito pendências com a data de hoje (ano-base e validade do registro começam sem registro)');
select is((select status || '|' || valid_until from public.control_statuses where associate_id = :'ana' and item_id = :'medica'),
  'ok|' || (current_date + interval '12 months')::date, 'valor inicial ok calcula a validade');
select is((select count(*)::int from public.control_statuses where associate_id = :'ana' and item_id in (:'equipes', :'palestra', :'aptidao')), 0,
  'sem valor inicial, desativado ou de outro público: sem registro');
select is((select count(*)::int from public.audit_events where entity_id = :'ana' and action like 'control_status.%'), 0, 'valor inicial faz parte do cadastro (sem auditoria própria)');

select public.associates_create(:'gid_a', 'Edu Teste', 'adulto', null, null, null, null, null, null) as edu \gset
select is((select count(*)::int from public.control_statuses where associate_id = :'edu' and item_id = :'aptidao' and status = 'pendente'), 1, 'adulto ganha a ficha de aptidão');
select is((select count(*)::int from public.control_statuses where associate_id = :'edu' and item_id = :'equipes'), 0, 'item só de jovem não entra para adulto');

select public.import_associates(:'gid_a', '[{"name":"Ivo Importado","branch":"senior"}]') \gset
select is((select count(*)::int from public.control_statuses s join public.associates a on a.id = s.associate_id
    where a.group_id = :'gid_a' and a.name = 'Ivo Importado' and s.status = 'pendente' and s.status_date = current_date), 8,
  'importação: associado novo também ganha o valor inicial');
select public.associates_create(:'gid_a', 'Pio Teste', 'pioneiro', null, null, null, null, null, null) as pio \gset
select count(*)::int as pio_before from public.control_statuses where associate_id = :'pio' \gset
select lives_ok(format($$select public.associates_move(%L, current_date, 'adulto', null, null)$$, :'pio'), 'pioneiro passa a adulto');
select is((select count(*)::int from public.control_statuses where associate_id = :'pio'), :pio_before, 'passagem não mexe nas situações');

-- Mudar públicos e valor inicial não mexe em situações gravadas.
select lives_ok(format($$select public.control_item_update(%L, 'Instagram do GEAS', 'canal', 'comunicacao', '[{"audience":"adulto","initial_status":"ok"}]', null, true, null)$$, :'insta'),
  'Instagram só para adultos');
select is((select status::text from public.control_statuses where associate_id = :'ana' and item_id = :'insta'), 'pendente', 'situação do jovem continua');
select lives_ok(format($$select public.control_item_update(%L, 'Instagram do GEAS', 'canal', 'comunicacao',
  '[{"audience":"jovem","initial_status":"pendente"},{"audience":"adulto","initial_status":"pendente"},{"audience":"responsavel","initial_status":"pendente"}]', null, true, null)$$, :'insta'),
  'volta aos três públicos');

-- Responsáveis ---------------------------------------------------------------------------------
select public.associates_create(:'gid_a', 'Bia Teste', 'lobinho', null, null, null, null, null, null) as bia \gset
select public.relatives_create(:'ana', '  Mara   Teste ', 'mae', null, true, true, null) as mae \gset
select is((select name || '|' || coalesce(associate_id::text, '-') from public.relatives where id = :'mae'), 'Mara Teste|-', 'responsável criado, nome limpo');
select is((select relative_name || '|' || kinship || '|' || legal || '|' || financial || '|' || position || '|' || sibling_count from public.relative_link_rows where associate_id = :'ana'),
  'Mara Teste|mae|true|true|1|0', 'relative_link_rows: vínculo com o jovem');
select is((select string_agg(i.name || ':' || s.status, ',' order by i.directorate, i.position) from public.control_status_rows s join public.control_items i on i.id = s.item_id where s.relative_id = :'mae'),
  'Ficha de aptidão:pendente,Dados individuais no Paxtu:pendente,Contatos no e-mail do GEAS:pendente,Instagram do GEAS:pendente,Twitter do GEAS:pendente,WhatsApp Só Avisos:pendente',
  'responsável nasce com o valor inicial dos itens de responsável');
select is((select count(*)::int from public.control_status_rows where relative_id = :'mae' and associate_id is null), 6, 'control_status_rows expõe relative_id');

select throws_like(format($$select public.relatives_create(%L, 'Rui Teste', 'pai', null, false, false, null)$$, :'edu'), 'Só jovens têm responsáveis%', 'adulto não tem responsável');
select throws_like(format($$select public.relatives_create(%L, 'Rui Teste', 'outro', '  ', false, false, null)$$, :'ana'), 'Descreva o parentesco%', 'outro exige descrição');
select throws_like(format($$select public.relatives_create(%L, 'Rui Teste', 'outro', %L, false, false, null)$$, :'ana', repeat('x', 41)), 'Parentesco: no máximo 40%', 'descrição longa');
select throws_like(format($$select public.relatives_create(%L, 'R', 'pai', null, false, false, null)$$, :'ana'), 'Informe um nome%', 'nome curto');
select throws_like(format($$select public.relatives_create(%L, 'Rui Teste', 'pai', null, false, false, %L)$$, :'ana', :'ana'), 'O jovem não pode ser responsável por si mesmo%', 'jovem não é o próprio responsável');
select throws_like(format($$select public.relatives_create(%L, 'Rui Teste', 'pai', null, false, false, %L)$$, :'ana', gen_random_uuid()), 'Associado do responsável não encontrado%', 'associado inexistente ou de outro grupo');

select public.relatives_create(:'ana', 'Lu Teste', 'outro', ' irmã ', false, false, null) as irma \gset
select is((select kinship || '|' || kinship_note || '|' || position from public.relative_link_rows where relative_id = :'irma'), 'outro|irmã|2', 'outro com descrição, posição seguinte');

-- Irmãos compartilham o responsável.
select public.relatives_link(:'bia', :'mae', 'mae', null, true, false) as link_bia_mae \gset
select is((select string_agg(associate_id || ':' || sibling_count, ',') from public.relative_link_rows where relative_id = :'mae' and associate_id = :'bia'),
  :'bia' || ':1', 'mesma mãe na irmã: um irmão');
select is((select sibling_count from public.relative_link_rows where relative_id = :'mae' and associate_id = :'ana'), 1, 'e na outra também');
select is((select count(*)::int from public.relatives where id = :'mae'), 1, 'um só cadastro de responsável');
select is((select count(*)::int from public.control_statuses where relative_id = :'mae'), 6, 'vincular não duplica situações');
select throws_like(format($$select public.relatives_link(%L, %L, 'mae', null, false, false)$$, :'bia', :'mae'), 'Este responsável já está vinculado%', 'vínculo repetido');
select throws_like(format($$select public.relatives_link(%L, %L, 'pai', null, false, false)$$, :'edu', :'mae'), 'Só jovens têm responsáveis%', 'adulto não recebe vínculo');
select throws_like(format($$select public.relatives_link(%L, gen_random_uuid(), 'pai', null, false, false)$$, :'bia'), 'Responsável não encontrado%', 'responsável inexistente');

select lives_ok(format($$select public.relatives_update_link(%L, 'outro', 'madrasta', false, true)$$, :'link_bia_mae'), 'edita vínculo');
select is((select kinship || '|' || kinship_note || '|' || legal || '|' || financial from public.relative_links where id = :'link_bia_mae'), 'outro|madrasta|false|true', 'vínculo editado');
select lives_ok(format($$select public.relatives_update_link(%L, 'mae', 'ignorado?', true, false)$$, :'link_bia_mae'), 'volta para mãe');
select throws_like(format($$select public.relatives_update_link(%L, 'outro', null, false, false)$$, :'link_bia_mae'), 'Descreva o parentesco%', 'outro sem descrição na edição');

select lives_ok(format($$select public.relatives_rename(%L, 'Mara Teste', %L, null)$$, :'mae', :'edu'), 'vincula a mãe a um associado depois');
select is((select count(*)::int from public.control_statuses where relative_id = :'mae'), 6, 'situações já gravadas ficam como estão');
select lives_ok(format($$select public.relatives_rename(%L, 'Mara Teste Silva', null, ' mora perto ')$$, :'mae'), 'renomeia');
select is((select name || '|' || coalesce(associate_id::text, '-') || '|' || notes from public.relatives where id = :'mae'), 'Mara Teste Silva|-|mora perto', 'nome, associado e observações');
select is((select string_agg(relative_name, ',') from public.relative_link_rows where relative_id = :'mae'), 'Mara Teste Silva,Mara Teste Silva', 'novo nome nos dois irmãos');
select throws_like(format($$select public.relatives_rename(%L, 'Mara', %L, null)$$, :'mae', :'bia'), 'O jovem não pode ser responsável por si mesmo%', 'responsável não vira o próprio jovem');
select throws_like(format($$select public.relatives_rename(%L, 'Mara', null, %L)$$, :'mae', repeat('x', 201)), 'Observações%', 'observações longas');

-- Situações do responsável ---------------------------------------------------------------------
select lives_ok(format($$select public.control_status_set_relative(%L, %L, 'ok', '2026-01-10', null, ' grupo ')$$, :'mae', :'email'), 'marca situação da mãe');
select is((select status || '|' || note from public.control_status_rows where relative_id = :'mae' and item_id = :'email'), 'ok|grupo', 'situação gravada (vale para os dois irmãos)');
select throws_like(format($$select public.control_status_set_relative(%L, %L, 'ok', null, null, null)$$, :'mae', :'equipes'), 'O item Equipes no Paxtu não se aplica a este responsável%', 'item sem público responsavel');
select throws_like(format($$select public.control_status_set_relative(%L, %L, 'ok', null, null, null)$$, :'mae', :'palestra'), 'O item Palestra Vamos Falar de Escotismo está desativado%', 'item desativado');
select throws_like(format($$select public.control_status_set_relative(%L, %L, 'ok', current_date + 1, null, null)$$, :'mae', :'email'), 'A data da situação não pode ser futura%', 'data futura');
select lives_ok(format($$select public.control_status_clear_relative(%L, %L)$$, :'mae', :'paxtu'), 'volta para sem registro');
select is((select count(*)::int from public.control_statuses where relative_id = :'mae' and item_id = :'paxtu'), 0, 'sem registro');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', null, null, null)$$, :'ana', :'aptidao'), 'O item Ficha de aptidão não se aplica a este associado%', 'ficha de aptidão não se aplica a jovem');

-- Desligamento: "a remover" nos responsáveis que não acompanham outro jovem ativo ---------------
select public.relatives_create(:'ana', 'Rui Teste', 'pai', null, false, false, null) as pai \gset
select lives_ok(format($$select public.control_status_set_relative(%L, %L, 'ok', null, null, null)$$, :'pai', :'insta'), 'pai no Instagram');
-- Responsável que é associado ativo é controlado como adulto: sem valor inicial e sem "a remover".
select public.relatives_create(:'ana', 'Edu Teste', 'pai', null, false, false, :'edu') as pai_assoc \gset
select is((select count(*)::int from public.control_statuses where relative_id = :'pai_assoc'), 0, 'responsável que é associado ativo: sem valor inicial');
select lives_ok(format($$select public.control_status_set_relative(%L, %L, 'ok', null, null, null)$$, :'pai_assoc', :'insta'), 'marca situação do responsável associado');
select lives_ok(format($$select public.associates_leave(%L, current_date, 'Mudou')$$, :'ana'), 'desliga a jovem');
select is((select status::text from public.control_statuses where relative_id = :'pai_assoc' and item_id = :'insta'), 'ok', 'responsável que é associado ativo continua no grupo');
select is((select status::text from public.control_statuses where relative_id = :'pai' and item_id = :'insta'), 'a_remover', 'pai só da jovem desligada: a remover');
select is((select status::text from public.control_statuses where relative_id = :'mae' and item_id = :'email'), 'ok', 'mãe que acompanha a irmã ativa: continua');
select is((select (details->>'to_remove')::int from public.audit_events where entity_id = :'ana' and action = 'associate.left'), 1, 'auditoria conta os itens do pai');
select lives_ok(format($$select public.associates_leave(%L, current_date, 'Mudou')$$, :'bia'), 'desliga a irmã');
select is((select status::text from public.control_statuses where relative_id = :'mae' and item_id = :'email'), 'a_remover', 'agora a mãe também: a remover');

-- Desvincular ----------------------------------------------------------------------------------
select id as link_irma from public.relative_links where relative_id = :'irma' \gset
select lives_ok(format($$select public.relatives_unlink(%L)$$, :'link_irma'), 'desvincula a irmã');
select is((select count(*)::int from public.relatives where id = :'irma'), 0, 'sem vínculo e só com o valor inicial: apagada');
select id as link_pai from public.relative_links where relative_id = :'pai' \gset
select lives_ok(format($$select public.relatives_unlink(%L)$$, :'link_pai'), 'desvincula o pai');
select is((select count(*)::int from public.relatives where id = :'pai'), 1, 'com situação registrada: o pai fica no grupo');
select id as link_ana_mae from public.relative_links where relative_id = :'mae' and associate_id = :'ana' \gset
select lives_ok(format($$select public.relatives_unlink(%L)$$, :'link_ana_mae'), 'desvincula a mãe de um irmão');
select is((select count(*)::int from public.relative_link_rows where relative_id = :'mae' and sibling_count = 0), 1, 'mãe continua com a outra filha');

-- Permissões -----------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select ok((select count(*) from public.relative_link_rows where relative_id = :'mae') = 1 and (select count(*) from public.control_status_rows where relative_id = :'mae') > 0,
  'consulta lê responsáveis e situações');
select throws_like(format($$select public.relatives_create(%L, 'Teo Teste', 'pai', null, false, false, null)$$, :'bia'), 'Associado não encontrado ou sem permissão%', 'consulta não cria responsável');
select throws_like(format($$select public.control_status_set_relative(%L, %L, 'ok', null, null, null)$$, :'mae', :'email'), 'Responsável não encontrado ou sem permissão%', 'consulta não marca situação');
select throws_like(format($$select public.relatives_unlink(%L)$$, :'link_bia_mae'), 'Vínculo não encontrado ou sem permissão%', 'consulta não desvincula');
select throws_ok(format($$insert into public.relatives(group_id, name) values (%L, 'Direto')$$, :'gid_a'), '42501', null, 'sem INSERT direto em relatives');

-- Grupo B não vê nem altera nada de A -----------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is((select count(*)::int from public.relatives where group_id = :'gid_a') + (select count(*)::int from public.relative_link_rows where group_id = :'gid_a'), 0,
  'B não lê responsáveis de A');
select throws_like(format($$select public.relatives_rename(%L, 'Invasor', null, null)$$, :'mae'), 'Responsável não encontrado ou sem permissão%', 'B não renomeia responsável de A');
select throws_like(format($$select public.control_status_clear_relative(%L, %L)$$, :'mae', :'email'), 'Responsável não encontrado ou sem permissão%', 'B não limpa situação de A');
select tests.logout() \gset

select is((select count(*)::int from public.audit_events where group_id = :'gid_a'
  and action in ('relative.created', 'relative.linked', 'relative.link_updated', 'relative.unlinked', 'relative.updated')), 12, 'responsáveis auditados');

select * from finish();
rollback;
