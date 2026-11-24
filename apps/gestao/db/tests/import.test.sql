-- pgTAP: importação por CSV (db/migrations/006_importacao.sql; contrato em docs/importacao.md). Rode com `npm run test:db`.
begin;
select plan(40);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Imp') as tropa \gset

-- secoes.csv + pessoas.csv num envio só ------------------------------------------------------
select public.import_batch(:'gid_a', $$[
  {"kind":"secoes","rows":[
    {"line":2,"branch":"lobinho","section":"Alcateia Imp"},
    {"line":3,"branch":"escoteiro","section":"tropa  imp","patrol":"Patrulha Lobo"}
  ]},
  {"kind":"pessoas","rows":[
    {"line":2,"name":"Ana  Importada","birth":"2015-05-14","branch":"lobinho","section":"Alcateia Imp","patrol":null,"registration":"definitivo","nickname":"Aninha","joined":"2022-03-10","promise":"2022-06-18"},
    {"line":3,"name":"Bruno Importado","branch":"escoteiro","section":"TROPA IMP","patrol":"patrulha lobo"},
    {"line":4,"name":"Daniel Importado","birth":"2011-01-30","branch":"escoteiro","section":"Tropa Imp","joined":"2021-03-03","situation":"desligado","left":"2025-12-20","leftReason":"Mudou de cidade"}
  ]}
]$$::jsonb) as result \gset
select is((:'result'::jsonb)->'pessoas', '{"created":3,"updated":0}'::jsonb, 'três pessoas criadas');
select is((select count(*)::int from public.sections where group_id = :'gid_a' and name in ('Alcateia Imp', 'Tropa Imp')), 2, 'seção nova criada; a existente achada sem acento nem maiúsculas');
select is((select count(*)::int from public.patrols where section_id = :'tropa'), 1, 'patrulha criada uma vez');
select is((select name || '|' || nickname || '|' || registration || '|' || birth_date || '|' || promise_date from public.associates where name = 'Ana Importada'),
  'Ana Importada|Aninha|definitivo|2015-05-14|2022-06-18', 'dados da pessoa');
select is((select movement_date::text from public.associate_movements m join public.associates a on a.id = m.associate_id where a.name = 'Ana Importada'), '2022-03-10', 'entrada com a data do arquivo');
select is((select s.name || '/' || p.name from public.associates a join public.sections s on s.id = a.section_id join public.patrols p on p.id = a.patrol_id where a.name = 'Bruno Importado'),
  'Tropa Imp/Patrulha Lobo', 'seção e patrulha pelo nome');
select is((select active from public.associates where name = 'Daniel Importado'), false, 'importado desligado');
select is((select string_agg(movement_date::text || ' ' || kind, ', ' order by movement_date) from public.associate_movements m join public.associates a on a.id = m.associate_id where a.name = 'Daniel Importado'),
  '2021-03-03 entrada, 2025-12-20 saida', 'entrada e saída com as datas do arquivo');
select ok((select count(*) from public.control_statuses c join public.associates a on a.id = c.associate_id where a.name = 'Ana Importada') > 0, 'situações iniciais do controle');
select is((select review_status from public.associates where name = 'Ana Importada'), 'revisado', 'importado pelo editor não fica para revisar');
reset role;
select is((select details->'pessoas' from public.audit_events where action = 'import.batch' and group_id = :'gid_a'), '{"created":3,"updated":0}'::jsonb, 'envio auditado com as contagens');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset

-- Reimportar: acha pela chave e atualiza só o que veio -----------------------------------------
select id as ana from public.associates where name = 'Ana Importada' \gset
select public.import_batch(:'gid_a', $$[{"kind":"pessoas","rows":[
  {"line":2,"name":"ANA IMPORTADA","birth":"2015-05-14","branch":"escoteiro","section":"Tropa Imp","patrol":null,"joined":"2022-02-01"},
  {"line":3,"name":"Bruno Importado","birth":"2012-09-02","patrol":null,"section":"Tropa Imp"}
]}]$$::jsonb) as result \gset
select is((:'result'::jsonb)->'pessoas', '{"created":0,"updated":2}'::jsonb, 'duas atualizadas, nenhuma duplicada');
select is((select name || '|' || branch || '|' || nickname || '|' || promise_date from public.associates where id = :'ana'),
  'ANA IMPORTADA|escoteiro|Aninha|2022-06-18', 'atualiza o que veio, mantém o resto');
select is((select movement_date::text from public.associate_movements where associate_id = :'ana'), '2022-02-01', 'entrada única acompanha a data corrigida');
select is((select birth_date::text || '|' || coalesce(patrol_id::text, '-') from public.associates where name = 'Bruno Importado'), '2012-09-02|-', 'nascimento preenchido pela primeira vez; patrulha removida');
select is((select count(*)::int from public.associates where group_id = :'gid_a' and public.import_name_key(name) = 'ana importada'), 1, 'sem duplicata');

-- Identificação ---------------------------------------------------------------------------------
select public.associates_create(:'gid_a', 'Homônimo', 'adulto', null, null, null, null, null, null) as h1 \gset
select public.associates_create(:'gid_a', 'Homonimo', 'adulto', null, null, null, null, null, null) as h2 \gset
select throws_like(format($$select public.import_batch(%L, '[{"kind":"pessoas","rows":[{"line":7,"name":"homônimo","notes":"x"}]}]')$$, :'gid_a'),
  'pessoas.csv, linha 7: há 2 pessoas "homônimo"%', 'homônimos sem nascimento: ambíguo, com arquivo e linha');
select lives_ok(format($$select public.import_batch(%L, '[{"kind":"pessoas","rows":[{"line":2,"id":"%s","name":"Homônimo","notes":"pelo id"}]}]')$$, :'gid_a', :'h1'), 'pelo id resolve');
select is((select notes from public.associates where id = :'h1'), 'pelo id', 'atualizou a certa');
select throws_like(format($$select public.import_batch(%L, '[{"kind":"pessoas","rows":[{"line":2,"id":"%s","name":"X Y"}]}]')$$, :'gid_b', :'h1'),
  '%', 'id de outro grupo recusado');

-- Tudo ou nada ----------------------------------------------------------------------------------
select throws_like(format($$select public.import_batch(%L, '[{"kind":"secoes","rows":[{"line":2,"branch":"senior","section":"Tropa Sênior Imp"}]},{"kind":"pessoas","rows":[{"line":9,"name":"Futuro","branch":"senior","birth":"2090-01-01"}]}]')$$, :'gid_a'),
  'pessoas.csv, linha 9: A data de nascimento não pode ser futura', 'erro numa linha desfaz o envio');
select is((select count(*)::int from public.sections where name = 'Tropa Sênior Imp'), 0, 'seção do envio desfeito não ficou');
select throws_like(format($$select public.import_batch(%L, '[{"kind":"controle","rows":[{"line":2}]}]')$$, :'gid_a'), '%não está disponível', 'tipo ainda não disponível');

-- funcoes.csv -------------------------------------------------------------------------------------
select public.import_batch(:'gid_a', $$[
  {"kind":"pessoas","rows":[{"line":2,"name":"Chefe Importada","birth":"1985-11-21","branch":"adulto"}]},
  {"kind":"funcoes","rows":[
    {"line":2,"person":"Chefe Importada","personBirth":"1985-11-21","kind":"escotista","title":"Assistente","section":"tropa imp","started":"2019-03-01"},
    {"line":3,"person":"Chefe Importada","personBirth":"1985-11-21","kind":"dirigente","title":"Diretora","started":"2020-01-01","ended":"2024-12-31","elected":true}
  ]}
]$$::jsonb) as result \gset
select is((:'result'::jsonb)->'funcoes', '{"created":2,"updated":0}'::jsonb, 'duas funções criadas para a pessoa nova do mesmo envio');
select id as chefe from public.associates where name = 'Chefe Importada' \gset
select is((select s.name || '|' || f.title || '|' || f.started_on from public.associate_functions f join public.sections s on s.id = f.section_id where f.associate_id = :'chefe' and f.kind = 'escotista'),
  'Tropa Imp|Assistente|2019-03-01', 'escotista com a seção pelo nome');
select is((select ended_on::text || '|' || elected from public.associate_functions where associate_id = :'chefe' and kind = 'dirigente'), '2024-12-31|true', 'dirigente encerrada e eleita');
select id as funcao from public.associate_functions where associate_id = :'chefe' and kind = 'escotista' \gset
select lives_ok(format($$select public.import_batch(%L, '[{"kind":"funcoes","rows":[{"line":2,"personId":"%s","kind":"escotista","functionId":"%s","title":"Chefe de seção"}]}]')$$, :'gid_a', :'chefe', :'funcao'), 'atualiza pela chave');
select is((select title || '|' || started_on from public.associate_functions where id = :'funcao'), 'Chefe de seção|2019-03-01', 'muda o cargo e mantém o início');
select throws_like(format($$select public.import_batch(%L, '[{"kind":"funcoes","rows":[{"line":4,"person":"Ana Importada","kind":"dirigente"}]}]')$$, :'gid_a'),
  'funcoes.csv, linha 4: %', 'jovem não recebe função');
select throws_like(format($$select public.import_batch(%L, '[{"kind":"funcoes","rows":[{"line":5,"personId":"%s","kind":"escotista","section":"Inexistente"}]}]')$$, :'gid_a', :'chefe'),
  'funcoes.csv, linha 5: seção "Inexistente" não cadastrada', 'seção desconhecida');

-- responsaveis.csv --------------------------------------------------------------------------------
select public.import_batch(:'gid_a', $$[{"kind":"responsaveis","rows":[
  {"line":2,"person":"Bruno Importado","relative":"Marta Importada","kinship":"mae","legal":true},
  {"line":3,"person":"Ana Importada","personBirth":"2015-05-14","relative":"marta  importada","kinship":"mae","financial":true},
  {"line":4,"person":"Ana Importada","personBirth":"2015-05-14","relative":"Chefe Importada","kinship":"outro","kinshipNote":"tia","relativeAssociate":"Chefe Importada","notes":"Busca às vezes"}
]}]$$::jsonb) as result \gset
select is((:'result'::jsonb)->'responsaveis', '{"created":3,"updated":0}'::jsonb, 'três vínculos');
select is((select count(*)::int from public.relatives where group_id = :'gid_a' and public.import_name_key(name) = 'marta importada'), 1, 'mesmo nome = mesmo responsável, compartilhado');
select is((select count(*)::int from public.relative_links l join public.relatives r on r.id = l.relative_id where r.name = 'Marta Importada'), 2, 'ligado aos dois jovens');
select is((select r.associate_id::text || '|' || r.notes || '|' || l.kinship_note from public.relatives r join public.relative_links l on l.relative_id = r.id where r.name = 'Chefe Importada'),
  :'chefe' || '|Busca às vezes|tia', 'responsável que é associado, com observação');
select public.import_batch(:'gid_a', $$[{"kind":"responsaveis","rows":[
  {"line":2,"person":"Bruno Importado","relative":"Marta Importada","kinship":"mae","financial":true}
]}]$$::jsonb) as result \gset
select is((:'result'::jsonb)->'responsaveis', '{"created":0,"updated":1}'::jsonb, 'reimportar atualiza o vínculo');
select is((select legal::text || '|' || financial from public.relative_links l join public.relatives r on r.id = l.relative_id
  join public.associates a on a.id = l.associate_id where r.name = 'Marta Importada' and a.name = 'Bruno Importado'), 'true|true', 'vazio mantém legal; financeiro muda');
select throws_like(format($$select public.import_batch(%L, '[{"kind":"responsaveis","rows":[{"line":6,"personId":"%s","relative":"Alguém","kinship":"mae"}]}]')$$, :'gid_a', :'chefe'),
  'responsaveis.csv, linha 6: Só jovens têm responsáveis', 'adulto não tem responsável');

-- Permissão ---------------------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.import_batch(%L, '[{"kind":"pessoas","rows":[{"line":2,"name":"Consulta Tenta","branch":"adulto"}]}]')$$, :'gid_a'),
  '%Sem permissão%', 'consulta não importa');
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select throws_like(format($$select public.import_batch(%L, '[{"kind":"secoes","rows":[{"line":2,"branch":"lobinho","section":"Intrusa"}]}]')$$, :'gid_a'),
  '%Sem permissão%', 'outro grupo não importa');
select is((select count(*)::int from public.sections where name = 'Intrusa'), 0, 'nada gravado pelo intruso');

select * from finish();
rollback;
