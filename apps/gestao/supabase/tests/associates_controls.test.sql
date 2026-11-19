-- pgTAP: Associados, segunda etapa (041_associates_controls.sql). Funções do adulto, itens de controle,
-- situações, "a remover" no desligamento, active derivado das movimentações e isolamento entre grupos.
-- Responsáveis e valor inicial no cadastro: associates_relatives.test.sql.
-- Rode com `npm run test:db`.
begin;
select plan(104);
\ir _fixture.psql

-- Itens iniciais ------------------------------------------------------------------------------
select is((select count(*)::int from public.control_items where group_id = :'gid_a'), 28, 'grupo novo nasce com os 28 itens iniciais (colunas do Doc 22)');
select is((select string_agg(directorate || ':' || n, ',' order by directorate) from (
    select directorate, count(*) as n from public.control_items where group_id = :'gid_a' group by 1) d),
  'metodos_educativos:14,administrativa:7,comunicacao:7', 'itens por diretoria (Financeira começa vazia)');
select is((select i.validity_months || '|' || string_agg(a.audience || ':' || a.initial_status, ',' order by a.audience)
    from public.control_items i join public.control_item_audiences a on a.item_id = i.id where i.group_id = :'gid_a' and i.name = 'Ficha médica impressa' group by i.id),
  '12|jovem:pendente,adulto:pendente', 'ficha médica vale 12 meses, se aplica a jovens e adultos e começa pendente');
select is((select string_agg(i.name, ',' order by i.directorate, i.position) from public.control_items i
    join public.control_item_audiences a on a.item_id = i.id and a.audience = 'responsavel' where i.group_id = :'gid_a'),
  'Ficha de aptidão,Dados individuais no Paxtu,Contatos no e-mail do GEAS,Instagram do GEAS,Twitter do GEAS,WhatsApp Só Avisos',
  'itens iniciais dos responsáveis');
select is((select string_agg(a.audience::text, ',' order by a.audience) from public.control_items i
    join public.control_item_audiences a on a.item_id = i.id where i.group_id = :'gid_a' and i.name = 'Ficha de aptidão'),
  'adulto,responsavel', 'ficha de aptidão: adultos e responsáveis, não jovens');
select is((select string_agg(distinct i.name, ',') from public.control_item_audiences a join public.control_items i on i.id = a.item_id
    where a.group_id = :'gid_a' and a.initial_status is distinct from 'pendente'),
  'Ano-base do registro,Validade do registro', 'valor inicial pendente em todo público, exceto nos itens que mostram um valor (sem registro)');
select is((select string_agg(name || ':' || value_kind, ',' order by name) from public.control_items where group_id = :'gid_a' and value_kind <> 'situacao'),
  'Ano-base do registro:ano,Validade do registro:data', 'ano-base mostra o ano; validade do registro, a data');
select is((select string_agg(name, ',' order by position) from public.control_items where group_id = :'gid_a' and directorate = 'administrativa'),
  'Dados individuais no Paxtu,Ficha médica impressa,Autorização de viagem (cartório),Termo de consentimento,Login no Paxtu,Ano-base do registro,Validade do registro',
  'ordem do Doc 22');
select is((select count(*)::int from public.control_items where group_id = :'gid_a' and remove_on_leave), 10, 'dez itens removidos no desligamento');
select is((select string_agg(position::text, ',' order by position) from public.control_items where group_id = :'gid_a' and directorate = 'comunicacao'),
  '1,2,3,4,5,6,7', 'posições por diretoria');

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select is(public.associates_seed_control_items(:'gid_a'), 0, 'carga inicial é idempotente');

-- Aqui as pessoas começam "sem registro" (o valor inicial é testado em associates_relatives.test.sql).
select tests.logout() \gset
update public.control_item_audiences set initial_status = null where group_id = :'gid_a';
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset

-- Funções do adulto ---------------------------------------------------------------------------
select public.associates_create(:'gid_a', 'Edu Escotista', 'adulto', null, null, null, null, null, null) as edu \gset
select public.associates_create(:'gid_a', 'Lia Lobinha', 'lobinho', null, null, null, null, null, null) as lia \gset
select is((select string_agg(audience::text, ',') from public.associate_audiences where associate_id = :'edu'), 'adulto', 'adulto sem função é público adulto');
select throws_like(format($$select public.associates_add_function(%L, 'escotista', null, null)$$, :'lia'), 'Só adultos têm função%', 'jovem não tem função');
select public.associates_add_function(:'edu', 'escotista', '  Chefe   de seção ', '2025-02-01') as f_esc \gset
select is((select title || '|' || started_on from public.associate_functions where id = :'f_esc'), 'Chefe de seção|2025-02-01', 'cargo limpo');
select throws_like(format($$select public.associates_add_function(%L, 'escotista', 'chefe de seção', null)$$, :'edu'), 'O associado já tem esta função ativa%', 'função ativa repetida');
select throws_like(format($$select public.associates_add_function(%L, 'dirigente', null, current_date + 1)$$, :'edu'), 'O início da função não pode ser futuro%', 'início futuro');
select throws_like(format($$select public.associates_add_function(%L, 'dirigente', %L, null)$$, :'edu', repeat('x', 81)), 'Cargo%', 'cargo longo');
select public.associates_add_function(:'edu', 'dirigente', 'Presidente', null) as f_dir \gset
select is((select string_agg(audience::text, ',' order by audience) from public.associate_audiences where associate_id = :'edu'), 'adulto', 'funções não mudam o público do adulto');
select is((select string_agg(audience::text, ',') from public.associate_audiences where associate_id = :'lia'), 'jovem', 'jovem é público jovem');
select is((select count(*)::int from public.associate_function_rows where associate_id = :'edu' and active), 2, 'associate_function_rows: duas ativas');

select throws_like(format($$select public.associates_end_function(%L, '2025-01-01')$$, :'f_esc'), 'O término não pode ser antes do início%', 'término antes do início');
select throws_like(format($$select public.associates_end_function(%L, current_date + 1)$$, :'f_esc'), 'O término da função não pode ser futuro%', 'término futuro');
select lives_ok(format($$select public.associates_end_function(%L, current_date)$$, :'f_dir'), 'encerra função');
select throws_like(format($$select public.associates_end_function(%L, current_date)$$, :'f_dir'), 'A função já está encerrada%', 'não encerra duas vezes');
select is((select active from public.associate_function_rows where id = :'f_dir'), false, 'associate_function_rows: encerrada não é ativa');
select public.associates_add_function(:'edu', 'dirigente', 'Errado', null) as f_tmp \gset
select lives_ok(format($$select public.associates_delete_function(%L)$$, :'f_tmp'), 'apaga função');
select is((select count(*)::int from public.associate_functions where associate_id = :'edu'), 2, 'sobram duas funções');

-- Itens de controle ---------------------------------------------------------------------------
select public.control_item_create(:'gid_a', ' Site  do grupo ', 'canal', 'comunicacao',
  '[{"audience":"adulto","initial_status":"pendente"},{"audience":"jovem","initial_status":null}]', null, true) as site \gset
select is((select name || '|' || position from public.control_items where id = :'site'), 'Site do grupo|8', 'item criado no fim da diretoria');
select is((select string_agg(audience || ':' || coalesce(initial_status::text, '-'), ',' order by audience) from public.control_item_audiences where item_id = :'site'),
  'jovem:-,adulto:pendente', 'públicos e valor inicial gravados');
select throws_like(format($$select public.control_item_create(%L, 'SITE DO GRUPO', 'canal', 'comunicacao', '[{"audience":"jovem"}]', null, false)$$, :'gid_a'), 'Já existe o item%', 'nome único sem diferenciar maiúsculas');
select throws_like(format($$select public.control_item_create(%L, 'Sem público', 'canal', 'comunicacao', '[]', null, false)$$, :'gid_a'), 'Escolha a quem o item se aplica%', 'público obrigatório');
select throws_like(format($$select public.control_item_create(%L, 'Repetido', 'canal', 'comunicacao', '[{"audience":"jovem"},{"audience":"jovem"}]', null, false)$$, :'gid_a'), 'Público repetido%', 'público repetido');
select throws_like(format($$select public.control_item_create(%L, 'Público errado', 'canal', 'comunicacao', '[{"audience":"chefe"}]', null, false)$$, :'gid_a'), 'Público inválido%', 'público inválido');
select throws_like(format($$select public.control_item_create(%L, 'Inicial errado', 'canal', 'comunicacao', '[{"audience":"jovem","initial_status":"talvez"}]', null, false)$$, :'gid_a'), 'Valor inicial inválido%', 'valor inicial inválido');
select throws_like(format($$select public.control_item_create(%L, 'X', 'canal', 'comunicacao', '[{"audience":"jovem"}]', null, false)$$, :'gid_a'), 'Informe um nome%', 'nome curto');
select throws_like(format($$select public.control_item_create(%L, 'Validade', 'documento', 'administrativa', '[{"audience":"jovem"}]', 0, false)$$, :'gid_a'), 'Validade%', 'validade fora da faixa');

select lives_ok(format($$select public.control_item_place(%L, 1)$$, :'site'), 'reordena');
select is((select string_agg(name, ',' order by position) from public.control_items where group_id = :'gid_a' and directorate = 'comunicacao'),
  'Site do grupo,Contatos no e-mail do GEAS,Lista de e-mails Adultos GEAS,Instagram do GEAS,Twitter do GEAS,WhatsApp GEAS Brothers,WhatsApp Só Avisos,Site',
  'item vai para o começo');
select lives_ok(format($$select public.control_item_place(%L, 99)$$, :'site'), 'posição além do fim');
select is((select position from public.control_items where id = :'site'), 8, 'vai para o fim');

select lives_ok(format($$select public.control_item_update(%L, 'Site do grupo', 'canal', 'metodos_educativos', '[{"audience":"jovem"},{"audience":"adulto"}]', null, true, null)$$, :'site'), 'muda de diretoria');
select is((select count(*)::int from public.control_item_audiences where item_id = :'site' and initial_status is null), 2, 'edição troca os públicos');
select is((select directorate || '|' || position || '|' || active from public.control_items where id = :'site'), 'metodos_educativos|15|true', 'vai para o fim da nova diretoria e continua ativo');
select is((select string_agg(position::text, ',' order by position) from public.control_items where group_id = :'gid_a' and directorate = 'comunicacao'),
  '1,2,3,4,5,6,7', 'diretoria antiga renumerada');

-- Situações -----------------------------------------------------------------------------------
select id as ficha from public.control_items where group_id = :'gid_a' and name = 'Ficha médica impressa' \gset
select id as equipes from public.control_items where group_id = :'gid_a' and name = 'Equipes no Paxtu' \gset
select id as email from public.control_items where group_id = :'gid_a' and name = 'Contatos no e-mail do GEAS' \gset
select id as whats from public.control_items where group_id = :'gid_a' and name = 'WhatsApp Só Avisos' \gset
select id as insta from public.control_items where group_id = :'gid_a' and name = 'Instagram do GEAS' \gset
select id as ppf from public.control_items where group_id = :'gid_a' and name = 'PPF' \gset

select lives_ok(format($$select public.control_status_set(%L, %L, 'ok', '2026-01-10', null, '  sem foto ')$$, :'edu', :'ficha'), 'marca ok');
select is((select status || '|' || effective_status || '|' || valid_until || '|' || note from public.control_status_rows where associate_id = :'edu' and item_id = :'ficha'),
  'ok|ok|2027-01-10|sem foto', 'validade calculada pelos meses do item');
select lives_ok(format($$select public.control_status_set(%L, %L, 'ok', '2024-01-10', null, null)$$, :'edu', :'ppf'), 'ok antigo');
select is((select effective_status::text from public.control_status_rows where associate_id = :'edu' and item_id = :'ppf'), 'desatualizado', 'ok vencido conta como desatualizado');
select lives_ok(format($$select public.control_status_set(%L, %L, 'ok', '2024-01-10', '2030-01-01', null)$$, :'edu', :'ppf'), 'validade informada');
select is((select valid_until from public.control_statuses where associate_id = :'edu' and item_id = :'ppf'), '2030-01-01'::date, 'validade informada prevalece');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', null, null, null)$$, :'edu', :'equipes'), 'O item Equipes no Paxtu não se aplica%', 'item de jovem não se aplica a adulto');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', current_date + 1, null, null)$$, :'edu', :'email'), 'A data da situação não pode ser futura%', 'data futura');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', null, null, %L)$$, :'edu', :'email', repeat('x', 201)), 'Observação%', 'observação longa');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', '2026-01-10', '2025-01-01', null)$$, :'edu', :'email'), 'A validade não pode ser antes da data%', 'validade antes da data');
select lives_ok(format($$select public.control_status_set(%L, %L, 'ok', null, null, null)$$, :'edu', :'email'), 'e-mail ok');
select lives_ok(format($$select public.control_status_set(%L, %L, 'pendente', null, null, null)$$, :'edu', :'whats'), 'WhatsApp pendente');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', null, null, null)$$, :'lia', :'whats'), 'O item WhatsApp Só Avisos não se aplica%', 'WhatsApp Só Avisos não se aplica a jovem');
select lives_ok(format($$select public.control_status_set(%L, %L, 'convidado', null, null, null)$$, :'lia', :'insta'), 'jovem convidado');
select lives_ok(format($$select public.control_status_clear(%L, %L)$$, :'lia', :'insta'), 'volta para sem registro');
select is((select count(*)::int from public.control_statuses where associate_id = :'lia'), 0, 'sem registro');

-- Itens que mostram um valor: ano (value_year) e data (valid_until) --------------------------------
select id as ano from public.control_items where group_id = :'gid_a' and name = 'Ano-base do registro' \gset
select id as validade from public.control_items where group_id = :'gid_a' and name = 'Validade do registro' \gset
select public.associates_create(:'gid_a', 'Gil Valor', 'adulto', null, null, null, null, null, null) as gil \gset
select lives_ok(format($$select public.control_status_set(%L, %L, null, current_date, null, null, extract(year from current_date)::int)$$, :'gil', :'ano'), 'ano sem situação');
select is((select status || '|' || effective_status || '|' || value_year from public.control_status_rows where associate_id = :'gil' and item_id = :'ano'),
  'ok|ok|' || extract(year from current_date)::int, 'informar o ano sem situação marca ok');
select lives_ok(format($$select public.control_status_set(%L, %L, null, current_date, null, null, extract(year from current_date)::int - 1)$$, :'gil', :'ano'), 'ano anterior');
select is((select effective_status::text from public.control_status_rows where associate_id = :'gil' and item_id = :'ano'), 'desatualizado', 'ano antes do atual conta como desatualizado');
select lives_ok(format($$select public.control_status_set(%L, %L, 'a_verificar', current_date, null, null, 2020)$$, :'gil', :'ano'), 'ano com outra situação');
select is((select status || '|' || effective_status || '|' || value_year from public.control_status_rows where associate_id = :'gil' and item_id = :'ano'),
  'a_verificar|a_verificar|2020', 'situação escolhida prevalece');
select throws_like(format($$select public.control_status_set(%L, %L, null, current_date, null, null, null)$$, :'gil', :'ano'), 'Informe o ano ou escolha a situação%', 'sem ano nem situação');
select throws_like(format($$select public.control_status_set(%L, %L, null, current_date, null, null, 1800)$$, :'gil', :'ano'), 'Ano: de 1900 a 2100%', 'ano fora da faixa');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', null, null, null, 2026)$$, :'gil', :'ficha'), 'O item Ficha médica impressa não guarda ano%', 'ano só em item que mostra ano');
select throws_like(format($$select public.control_status_set(%L, %L, null, null, null, null)$$, :'gil', :'ficha'), 'Escolha a situação%', 'item de situação exige a situação');
select lives_ok(format($$select public.control_status_set(%L, %L, null, current_date, '2025-03-31', null)$$, :'gil', :'validade'), 'data passada sem situação');
select is((select status || '|' || effective_status || '|' || valid_until from public.control_status_rows where associate_id = :'gil' and item_id = :'validade'),
  'ok|desatualizado|2025-03-31', 'informar a data marca ok; data vencida conta como desatualizado');
select lives_ok(format($$select public.control_status_set(%L, %L, null, current_date, current_date + 400, null)$$, :'gil', :'validade'), 'data futura');
select is((select effective_status || '|' || (valid_until = current_date + 400) from public.control_status_rows where associate_id = :'gil' and item_id = :'validade'),
  'ok|true', 'data no futuro: ok');
select throws_like(format($$select public.control_status_set(%L, %L, null, current_date, null, null)$$, :'gil', :'validade'), 'Informe a data ou escolha a situação%', 'sem data nem situação');
select is((select count(*)::int from public.control_statuses where associate_id = :'gil'), 2, 'novo associado: ano-base e validade começam sem registro, só as gravadas');
select public.control_item_create(:'gid_a', 'Ano do curso', 'documento', 'administrativa', '[{"audience":"adulto"}]', null, false, 'ano') as curso \gset
select is((select value_kind::text from public.control_items where id = :'curso'), 'ano', 'item novo mostra ano');
select lives_ok(format($$select public.control_item_update(%L, 'Ano do curso', 'documento', 'administrativa', '[{"audience":"adulto"}]', null, false, null)$$, :'curso'), 'edita sem informar o que mostra');
select is((select value_kind::text from public.control_items where id = :'curso'), 'ano', 'valor nulo mantém o que a célula mostra');
select lives_ok(format($$select public.control_item_update(%L, 'Ano do curso', 'documento', 'administrativa', '[{"audience":"adulto"}]', null, false, null, 'data')$$, :'curso'), 'passa a mostrar a data');
select is((select value_kind::text from public.control_items where id = :'curso'), 'data', 'célula mostra a data');

select lives_ok(format($$select public.control_item_update(%L, 'Site do grupo', 'canal', 'metodos_educativos', '[{"audience":"jovem"},{"audience":"adulto"}]', null, true, false)$$, :'site'), 'desativa item');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', null, null, null)$$, :'edu', :'site'), 'O item Site do grupo está desativado%', 'item desativado não recebe situação');

-- Desligamento abre "a remover" ---------------------------------------------------------------
select lives_ok(format($$select public.associates_leave(%L, current_date, 'Saiu')$$, :'edu'), 'desliga adulto');
select is((select string_agg(i.name || ':' || s.status, ',' order by i.name) from public.control_statuses s join public.control_items i on i.id = s.item_id where s.associate_id = :'edu'),
  'Contatos no e-mail do GEAS:a_remover,Ficha médica impressa:ok,PPF:ok,WhatsApp Só Avisos:pendente', 'só itens removíveis com acesso viram a remover');
select lives_ok(format($$select public.control_status_set(%L, %L, 'removido', current_date, null, null)$$, :'edu', :'email'), 'desligado: marca removido');
select lives_ok(format($$select public.associates_rejoin(%L, current_date, null)$$, :'edu'), 'reingressa');
select is((select status::text from public.control_statuses where associate_id = :'edu' and item_id = :'email'), 'removido', 'reingresso não mexe nas situações');

-- active segue a última movimentação ----------------------------------------------------------
select lives_ok(format($$select public.control_status_set(%L, %L, 'ok', null, null, null)$$, :'lia', :'insta'), 'jovem no Instagram');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.add_associate_movement(:'lia', current_date, 'saida', 'Evasão') as mov \gset
select is((select active from public.associates where id = :'lia'), false, 'saída pelo Financeiro desativa');
select is((select status || '|' || status_date from public.control_statuses where associate_id = :'lia' and item_id = :'insta'),
  'a_remover|' || current_date, 'saída pelo Financeiro abre "a remover"');
select lives_ok(format($$select public.delete_associate_movement(%L)$$, :'mov'), 'apaga a saída');
select is((select active from public.associates where id = :'lia'), true, 'volta a ativo pela entrada anterior');
select public.add_associate_movement(:'lia', '2020-01-01', 'saida', 'Antiga') \gset
select is((select active from public.associates where id = :'lia'), true, 'saída antiga não muda o estado');
select public.import_associates(:'gid_a', jsonb_build_array(jsonb_build_object('id', :'lia', 'name', 'Lia Lobinha', 'branch', 'lobinho', 'active', false))) \gset
select is((select active::text || '|' || (select kind || ':' || reason from public.associate_movements where associate_id = :'lia' and movement_date = current_date and kind = 'saida')
  from public.associates where id = :'lia'), 'false|saida:Importação', 'importação grava a saída');

-- Consulta lê e não escreve -------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select ok((select count(*) from public.control_status_rows where associate_id = :'edu') = 4 and exists (select 1 from public.associate_function_rows where associate_id = :'edu'),
  'consulta lê situações e funções');
select throws_like(format($$select public.control_status_set(%L, %L, 'ok', null, null, null)$$, :'edu', :'ficha'), 'Associado não encontrado ou sem permissão%', 'consulta não marca situação');
select throws_like(format($$select public.control_item_create(%L, 'Consulta', 'canal', 'comunicacao', '[{"audience":"jovem"}]', null, false)$$, :'gid_a'), 'Sem permissão%', 'consulta não cria item');
select throws_like(format($$select public.associates_add_function(%L, 'escotista', null, null)$$, :'edu'), 'Associado não encontrado ou sem permissão%', 'consulta não adiciona função');
select throws_ok(format($$insert into public.control_statuses(group_id, associate_id, item_id, status) values (%L, %L, %L, 'ok')$$, :'gid_a', :'lia', :'insta'),
  '42501', null, 'sem INSERT direto em control_statuses');

-- Grupo B não vê nem altera nada de A -----------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select is((select count(*)::int from public.control_items where group_id = :'gid_a') + (select count(*)::int from public.control_status_rows where group_id = :'gid_a')
  + (select count(*)::int from public.associate_function_rows where group_id = :'gid_a'), 0, 'B não lê itens, situações nem funções de A');
select throws_like(format($$select public.control_item_update(%L, 'Invasor', 'canal', 'comunicacao', '[{"audience":"jovem"}]', null, false, null)$$, :'site'), 'Item não encontrado ou sem permissão%', 'B não edita item de A');
select is((select count(*)::int from public.control_item_audiences where group_id = :'gid_a'), 0, 'B não lê os públicos dos itens de A');
select tests.logout() \gset

select is((select count(*)::int from public.audit_events where group_id = :'gid_a'
  and action in ('associate.function_added', 'associate.function_ended', 'associate.function_deleted', 'control_item.created', 'control_item.updated',
    'control_item.placed', 'control_items.seeded', 'control_status.set', 'control_status.cleared')), 28, 'funções, itens e situações auditados');

select * from finish();
rollback;
