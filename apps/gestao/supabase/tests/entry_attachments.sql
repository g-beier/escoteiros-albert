-- Anexos de comprovantes (027) sem alterar o banco local: rode, a partir de apps/financeiro,
--   cat supabase/tests/entry_attachments.sql \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no `supabase test db` (pg_prove).
-- O envio real passa pela API do Storage; aqui o objeto é inserido direto em storage.objects
-- (como o usuário, para exercitar as políticas) com os metadados que a API gravaria.
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'tes.anexo@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000a2', 'consulta.anexo@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000a3', 'outro.anexo@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.anexo@escoteirosalbert.com.br', 'Grupo Teste Anexos') as gid \gset
select public.admin_bootstrap_group('outro.anexo@escoteirosalbert.com.br', 'Outro Grupo Anexos') as gid2 \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.memberships(group_id, user_id, role) values (:'gid', '00000000-0000-0000-0000-0000000000a2', 'viewer');
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

\echo '--- tesouraria envia ao bucket do seu grupo, não ao de outro nem com caminho livre'
insert into storage.objects(bucket_id, name, owner_id, metadata) values
  ('comprovantes', :'p1', '00000000-0000-0000-0000-0000000000a1', '{"mimetype":"application/pdf","size":12345}'),
  ('comprovantes', :'p2', '00000000-0000-0000-0000-0000000000a1', '{"mimetype":"text/html","size":10}');
do $$ begin
  insert into storage.objects(bucket_id, name, metadata) values
    ('comprovantes', current_setting('test.gid2') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf', '{}');
  raise exception 'FALHOU: envio para outro grupo';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into storage.objects(bucket_id, name, metadata) values ('comprovantes', current_setting('test.gid') || '/qualquer.pdf', '{}');
  raise exception 'FALHOU: caminho fora do padrão';
exception when insufficient_privilege then null;
end $$;

\echo '--- registrar: tamanho e tipo vêm do Storage'
select public.add_entry_attachment(:'e1', :'p1', '  nota fiscal.pdf ') as a1 \gset
do $$ begin
  if (select file_name || ':' || content_type || ':' || size_bytes from public.entry_attachments) <> 'nota fiscal.pdf:application/pdf:12345'
    then raise exception 'FALHOU: metadados do anexo'; end if;
  if (select uploaded_by from public.entry_attachments) <> '00000000-0000-0000-0000-0000000000a1' then raise exception 'FALHOU: quem enviou'; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid, current_setting('test.p2'), 'pagina.html');
  raise exception 'FALHOU: tipo não aceito registrado';
exception when raise_exception then if sqlerrm not like 'Tipo de arquivo não aceito%' then raise; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid,
    current_setting('test.gid') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf', 'sumiu.pdf');
  raise exception 'FALHOU: arquivo inexistente registrado';
exception when raise_exception then if sqlerrm not like 'Arquivo não encontrado%' then raise; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid,
    current_setting('test.gid2') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf', 'x.pdf');
  raise exception 'FALHOU: caminho de outro grupo registrado';
exception when raise_exception then if sqlerrm not like 'Caminho do anexo inválido%' then raise; end if;
end $$;

\echo '--- consulta lê o anexo e o arquivo, mas não envia nem exclui'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.entry_attachments) <> 1 then raise exception 'FALHOU: consulta deveria ver o anexo'; end if;
  if not exists (select 1 from storage.objects where name = current_setting('test.p1')) then raise exception 'FALHOU: consulta deveria ler o arquivo'; end if;
  begin
    insert into storage.objects(bucket_id, name, metadata) values
      ('comprovantes', current_setting('test.gid') || '/' || current_setting('test.e1') || '/' || gen_random_uuid() || '.pdf', '{}');
    raise exception 'FALHOU: consulta enviou arquivo';
  exception when insufficient_privilege then null;
  end;
  perform public.delete_entry_attachment((select id from public.entry_attachments));
  raise exception 'FALHOU: consulta excluiu anexo';
exception when raise_exception then if sqlerrm not like '%sem permissão%' then raise; end if;
end $$;
do $$ begin
  perform public.add_entry_attachment(current_setting('test.e1')::uuid, current_setting('test.p1'), 'x.pdf');
  raise exception 'FALHOU: consulta registrou anexo';
exception when raise_exception then if sqlerrm not like '%sem permissão%' then raise; end if;
end $$;

\echo '--- outro grupo não vê nada'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.entry_attachments) then raise exception 'FALHOU: outro grupo vê o anexo'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'comprovantes') then raise exception 'FALHOU: outro grupo lê o arquivo'; end if;
end $$;

\echo '--- excluir devolve o caminho e audita'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  if public.delete_entry_attachment((select id from public.entry_attachments)) <> current_setting('test.p1') then raise exception 'FALHOU: caminho devolvido'; end if;
  if exists (select 1 from public.entry_attachments) then raise exception 'FALHOU: anexo ficou'; end if;
end $$;

\echo '--- excluir o lançamento remove os registros de anexo'
select public.add_entry_attachment(:'e1', :'p1', 'nota fiscal.pdf');
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
