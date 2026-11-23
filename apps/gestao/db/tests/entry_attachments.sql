-- Anexos de comprovantes (027) sem alterar o banco local: rode, a partir de apps/gestao,
--   cat db/tests/entry_attachments.sql \
--     | docker compose -f db/compose.yaml exec -T db psql -U postgres -d geas -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no pg_prove.
-- O arquivo vai ao Blob Storage por URL assinada que o servidor só emite se can_write/read/delete_attachment_object
-- aprovar; aqui ficam essas permissões e o registro (tamanho e tipo chegam do servidor, lidos no blob).
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'tes.anexo@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000a2', 'consulta.anexo@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000a3', 'outro.anexo@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.anexo@escoteirosalbert.com.br', 'Grupo Teste Anexos') as gid \gset
select public.admin_bootstrap_group('outro.anexo@escoteirosalbert.com.br', 'Outro Grupo Anexos') as gid2 \gset
update public.memberships set finance_role = 'editor' where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.memberships(group_id, user_id, finance_role) values (:'gid', '00000000-0000-0000-0000-0000000000a2', 'viewer');
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select id as cat from public.categories where group_id = :'gid' and code = '1.1' \gset
select public.fallback_account(:'gid') as acc \gset

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.create_ledger_entry(:'gid', '2026-03-08', 'Papelaria', :'pix', null, false, 5000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat', 'amount_cents', 5000, 'description', 'material')), :'acc') as e1 \gset
select :'gid' || '/' || :'e1' || '/' || gen_random_uuid() || '.pdf' as p1 \gset
select :'gid' || '/' || :'e1' || '/' || gen_random_uuid() || '.png' as p2 \gset
select set_config('test.gid', :'gid', true), set_config('test.gid2', :'gid2', true), set_config('test.e1', :'e1', true),
  set_config('test.p1', :'p1', true), set_config('test.p2', :'p2', true);

\echo '--- tesouraria pode enviar para o seu grupo, não para outro nem com caminho livre'
do $$ begin
  if not public.can_write_attachment_object(current_setting('test.p1')) then raise exception 'FALHOU: tesouraria deveria enviar'; end if;
  if public.can_write_attachment_object(current_setting('test.gid2') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf')
    then raise exception 'FALHOU: envio para outro grupo'; end if;
  if public.can_write_attachment_object(current_setting('test.gid') || '/qualquer.pdf') then raise exception 'FALHOU: caminho fora do padrão'; end if;
end $$;

\echo '--- registrar: tamanho e tipo conferidos'
select public.add_entry_attachment(:'e1', :'p1', '  nota fiscal.pdf ', 'application/pdf', 12345) as a1 \gset
do $$ begin
  if (select file_name || ':' || content_type || ':' || size_bytes from public.entry_attachments) <> 'nota fiscal.pdf:application/pdf:12345'
    then raise exception 'FALHOU: metadados do anexo'; end if;
  if (select uploaded_by from public.entry_attachments) <> '00000000-0000-0000-0000-0000000000a1' then raise exception 'FALHOU: quem enviou'; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid, current_setting('test.p2'), 'pagina.html', 'text/html', 10);
  raise exception 'FALHOU: tipo não aceito registrado';
exception when raise_exception then if sqlerrm not like 'Tipo de arquivo não aceito%' then raise; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid,
    current_setting('test.gid') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf', 'grande.pdf', 'application/pdf', 10485761);
  raise exception 'FALHOU: arquivo grande demais registrado';
exception when raise_exception then if sqlerrm not like 'O arquivo deve ter até 10 MB%' then raise; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid,
    current_setting('test.gid2') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf', 'x.pdf', 'application/pdf', 10);
  raise exception 'FALHOU: caminho de outro grupo registrado';
exception when raise_exception then if sqlerrm not like 'Caminho do anexo inválido%' then raise; end if;
end $$;

\echo '--- consulta lê o anexo e abre o arquivo, mas não envia nem exclui'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.entry_attachments) <> 1 then raise exception 'FALHOU: consulta deveria ver o anexo'; end if;
  if not public.can_read_attachment_object(current_setting('test.p1')) then raise exception 'FALHOU: consulta deveria abrir o arquivo'; end if;
  if public.can_write_attachment_object(current_setting('test.gid') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf')
    then raise exception 'FALHOU: consulta enviaria arquivo'; end if;
  if public.can_delete_attachment_object(current_setting('test.p1')) then raise exception 'FALHOU: consulta apagaria arquivo'; end if;
  perform public.delete_entry_attachment((select id from public.entry_attachments));
  raise exception 'FALHOU: consulta excluiu anexo';
exception when raise_exception then if sqlerrm not like '%sem permissão%' then raise; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid, current_setting('test.p1'), 'x.pdf', 'application/pdf', 10);
  raise exception 'FALHOU: consulta registrou anexo';
exception when raise_exception then if sqlerrm not like '%sem permissão%' then raise; end if;
end $$;

\echo '--- outro grupo não vê nada'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.entry_attachments) then raise exception 'FALHOU: outro grupo vê o anexo'; end if;
  if public.can_read_attachment_object(current_setting('test.p1')) then raise exception 'FALHOU: outro grupo abre o arquivo'; end if;
end $$;

\echo '--- excluir devolve o caminho e audita'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  if public.delete_entry_attachment((select id from public.entry_attachments)) <> current_setting('test.p1') then raise exception 'FALHOU: caminho devolvido'; end if;
  if exists (select 1 from public.entry_attachments) then raise exception 'FALHOU: anexo ficou'; end if;
end $$;

\echo '--- excluir o lançamento remove os registros de anexo'
select public.add_entry_attachment(:'e1', :'p1', 'nota fiscal.pdf', 'application/pdf', 12345);
select public.delete_ledger_entry(:'e1');
do $$ begin
  if exists (select 1 from public.entry_attachments) then raise exception 'FALHOU: anexo do lançamento excluído ficou'; end if;
end $$;
reset role;

\echo '--- auditoria (lida como postgres)'
do $$ begin
  if (select string_agg(action || ' ' || (details->>'file_name'), ',' order by action) from public.audit_events
      where entity_id = current_setting('test.e1') and action like 'ledger_entry.attachment%')
    <> 'ledger_entry.attachment_added nota fiscal.pdf,ledger_entry.attachment_added nota fiscal.pdf,ledger_entry.attachment_removed nota fiscal.pdf'
    then raise exception 'FALHOU: auditoria dos anexos'; end if;
end $$;
\echo ok 1 - TUDO OK
rollback;
