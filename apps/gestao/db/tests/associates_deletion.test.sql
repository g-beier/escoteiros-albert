-- pgTAP: excluir associado com quarentena (db/migrations/018_associados_exclusao.sql). Rode com `npm run test:db`.
begin;
select plan(26);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select public.associates_create(:'gid_a', 'Dupla Lobinha', 'lobinho', null, null, null, null, null, null) as dupla \gset
select public.relatives_create(:'dupla', 'Mãe da Dupla', 'mae', null, true, false, null) as mae \gset
select public.associates_create(:'gid_a', 'Irmã da Dupla', 'lobinho', null, null, null, null, null, null) as irma \gset
select public.relatives_link(:'irma', :'mae', 'mae', null, true, false) is null as linked \gset
select public.associates_create(:'gid_a', 'Só Mãe Própria', 'lobinho', null, null, null, null, null, null) as outro \gset
select public.relatives_create(:'outro', 'Pai Só Dele', 'pai', null, true, false, null) as pai \gset
select count(*)::int as mov_before from public.associate_movements where associate_id = :'dupla' \gset

-- Pedido: permissão, motivo, bloqueios.
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.associates_request_deletion(%L, 'erro')$$, :'dupla'), '%sem permissão%', 'consulta não exclui');
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select throws_like(format($$select public.associates_request_deletion(%L, '  ')$$, :'dupla'), 'Informe o motivo%', 'motivo obrigatório');
select throws_like(format($$select public.associates_request_deletion(%L, 'erro')$$, :'assoc_a'), 'Tem lançamentos ou dívidas%', 'com lançamento no Financeiro não exclui');

select is(public.associates_request_deletion(:'dupla', 'Cadastro em duplicidade'), current_date + 60, 'pedido: exclusão em 60 dias');
select throws_like(format($$select public.associates_request_deletion(%L, 'de novo')$$, :'dupla'), 'A exclusão deste associado já foi pedida%', 'não pede duas vezes');
select is((select count(*)::int from public.audit_events where action = 'associate.deletion_requested' and entity_id = :'dupla'), 1, 'pedido auditado');

-- Some das telas (RLS) para quem lê, mesmo o Editor; o que é dele também.
select is((select count(*)::int from public.associates where id = :'dupla'), 0, 'associado some para o administrador');
select is((select count(*)::int from public.associate_profile_rows where id = :'dupla'), 0, 'some das visões');
select is((select count(*)::int from public.associate_movements where associate_id = :'dupla'), 0, 'movimentos somem');
select is((select count(*)::int from public.control_statuses where associate_id = :'dupla'), 0, 'situações do controle somem');
select is((select count(*)::int from public.relative_links where associate_id = :'dupla'), 0, 'vínculos com responsáveis somem');
select is((select count(*)::int from public.relative_links where associate_id = :'irma'), 1, 'o vínculo da irmã fica');
select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select is((select count(*)::int from public.associates where id = :'dupla'), 0, 'some para o editor do Financeiro (política de edição)');
select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset

-- Lista da quarentena e restaurar.
select is((select name || '|' || deletion_reason || '|' || deletion_due_on from public.associates_quarantine(:'gid_a')),
  'Dupla Lobinha|Cadastro em duplicidade|' || (current_date + 60), 'lista da quarentena');
select is((select array_agg(n) from public.associates_quarantined_names(:'gid_a') n), array['Dupla Lobinha'], 'nomes em quarentena (aviso da importação)');
select lives_ok(format($$select public.associates_cancel_deletion(%L)$$, :'dupla'), 'restaura');
select is((select count(*)::int from public.associates where id = :'dupla'), 1, 'volta a aparecer');
select is((select count(*)::int from public.associate_movements where associate_id = :'dupla'), :mov_before, 'com os movimentos');
select throws_like(format($$select public.associates_cancel_deletion(%L)$$, :'dupla'), 'Este associado não está na lista%', 'só restaura quem está em quarentena');

-- Exclusão definitiva: só depois do prazo; responsável sem outro jovem vai junto.
select public.associates_request_deletion(:'dupla', 'Cadastro em duplicidade') is not null as again \gset
select public.associates_request_deletion(:'outro', 'Teste') is not null as other \gset
select tests.logout() \gset
select is(public.associates_purge_due(), 0, 'antes do prazo não apaga');
update public.associates set deletion_due_on = current_date where id in (:'dupla', :'outro');
select is(public.associates_purge_due(), 2, 'no prazo apaga');
select is((select count(*)::int from public.associates where id in (:'dupla', :'outro')), 0, 'associados apagados');
select is((select count(*)::int from public.relatives where id = :'mae'), 1, 'responsável de outro jovem fica');
select is((select count(*)::int from public.relatives where id = :'pai'), 0, 'responsável só dele vai junto');
select is((select count(*)::int from public.audit_events where action = 'associate.deleted' and entity_id in (:'dupla', :'outro')), 2, 'exclusão auditada');
select is((select count(*)::int from public.associate_movements where associate_id = :'dupla'), 0, 'movimentos apagados');

select * from finish();
rollback;
