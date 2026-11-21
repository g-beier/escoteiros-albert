-- pgTAP: seção do escotista, edição de funções e passagem só de jovens (052). Rode com `npm run test:db`.
begin;
select plan(23);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.create_section(:'gid_a', 'escoteiro', 'Tropa Escotistas') as tropa \gset
select public.create_section(:'gid_a', 'lobinho', 'Alcateia Escotistas') as alcateia \gset
select public.create_section(:'gid_a', 'senior', 'Tropa Sênior Inativa') as inativa \gset
select public.update_section(:'inativa', 'Tropa Sênior Inativa', false);
select public.associates_create(:'gid_a', 'Ana Escotista', 'adulto', null, null, null, null, null, null) as ana \gset
select public.associates_create(:'gid_a', 'Leo Lobinho', 'lobinho', :'alcateia', null, null, null, null, null) as leo \gset
select tests.login('00000000-0000-0000-0000-00000000f0b1') \gset
select public.create_section(:'gid_b', 'escoteiro', 'Tropa B') as tropa_b \gset
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset

-- Seção do escotista
select throws_like(format($$select public.associates_add_function(%L, 'escotista', null, current_date)$$, :'ana'), 'Escolha a seção do escotista%', 'escotista sem seção');
select throws_like(format($$select public.associates_add_function(%L, 'escotista', null, current_date, %L)$$, :'ana', :'tropa_b'), 'Seção não encontrada%', 'seção de outro grupo');
select throws_like(format($$select public.associates_add_function(%L, 'escotista', null, current_date, %L)$$, :'ana', :'inativa'), 'Seção não encontrada ou inativa%', 'seção inativa');
select throws_like(format($$select public.associates_add_function(%L, 'dirigente', null, current_date, %L)$$, :'ana', :'tropa'), 'Só a função de escotista tem seção%', 'dirigente sem seção');
select public.associates_add_function(:'ana', 'escotista', 'Assistente', '2025-03-01', :'tropa') as f1 \gset
select is((select section from public.associate_function_rows where id = :'f1'), 'Tropa Escotistas', 'associate_function_rows traz o nome da seção');
select lives_ok(format($$select public.associates_add_function(%L, 'escotista', 'Assistente', '2025-03-01', %L)$$, :'ana', :'alcateia'), 'mesma função em outra seção');
select throws_like(format($$select public.associates_add_function(%L, 'escotista', 'assistente', null, %L)$$, :'ana', :'tropa'), 'O associado já tem esta função ativa%', 'repetida na mesma seção');
select throws_like(format($$insert into public.associate_functions(group_id, associate_id, kind, section_id) values (%L, %L, 'dirigente', %L)$$, :'gid_a', :'ana', :'tropa'),
  '%', 'sem escrita direta');

-- Edição
select public.associates_add_function(:'ana', 'dirigente', 'Presidente', '2024-01-01') as f2 \gset
select lives_ok(format($$select public.associates_update_function(%L, 'escotista', %L, ' Chefe ', '2024-02-01', null)$$, :'f2', :'tropa'), 'dirigente vira escotista com seção');
select is((select kind || '|' || section || '|' || title || '|' || started_on from public.associate_function_rows where id = :'f2'), 'escotista|Tropa Escotistas|Chefe|2024-02-01', 'edição gravada');
select throws_like(format($$select public.associates_update_function(%L, 'escotista', null, null, '2024-02-01', null)$$, :'f2'), 'Escolha a seção do escotista%', 'edição exige seção');
select throws_like(format($$select public.associates_update_function(%L, 'escotista', %L, 'Assistente', '2025-03-01', null)$$, :'f2', :'tropa'), 'O associado já tem esta função ativa%', 'edição não duplica função ativa');
select throws_like(format($$select public.associates_update_function(%L, 'escotista', %L, 'Chefe', '2024-02-01', '2024-01-01')$$, :'f2', :'tropa'), 'O término não pode ser antes do início%', 'fim antes do início');
select throws_like(format($$select public.associates_update_function(%L, 'escotista', %L, 'Chefe', '2024-02-01', current_date + 1)$$, :'f2', :'tropa'), 'O término da função não pode ser futuro%', 'fim futuro');
select lives_ok(format($$select public.associates_update_function(%L, 'escotista', %L, 'Chefe', '2024-02-01', '2025-01-01')$$, :'f2', :'tropa'), 'encerra pela edição');
select update_section(:'tropa', 'Tropa Escotistas', false);
select lives_ok(format($$select public.associates_update_function(%L, 'escotista', %L, 'Chefe', '2024-02-01', null)$$, :'f2', :'tropa'), 'mantém a seção atual, mesmo inativa');
select is((select count(*)::int from public.audit_events where action = 'associate.function_updated' and entity_id = :'ana'), 3, 'edições auditadas');

select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.associates_update_function(%L, 'dirigente', null, null, '2024-02-01', null)$$, :'f2'), 'Função não encontrada ou sem permissão%', 'consulta não edita função');
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset

-- Honorífico e comissão fiscal (053): sem seção
select lives_ok(format($$select public.associates_add_function(%L, 'honorifico', null, current_date)$$, :'ana'), 'honorífico sem seção');
select throws_like(format($$select public.associates_add_function(%L, 'comissao_fiscal', null, current_date, %L)$$, :'ana', :'alcateia'), 'Só a função de escotista tem seção%', 'comissão fiscal não tem seção');

-- Passagem só de jovens
select throws_like(format($$select public.associates_move(%L, current_date, 'escoteiro', %L, null)$$, :'ana', :'alcateia'), 'Passagem é só de jovens%', 'adulto não tem passagem');
select lives_ok(format($$select public.associates_move(%L, current_date, 'escoteiro', null, null)$$, :'leo'), 'jovem passa ao ramo seguinte');
select throws_like(format($$select public.associates_update(%L, a.name, null, null, null, null, 'definitivo', null, 'lobinho', null, null) from public.associates a where a.id = %L$$, :'ana', :'ana'), 'Adulto com função ativa%', 'correção não tira do Adulto quem tem função');

select * from finish();
rollback;
