-- Importação de associados (016) sem alterar o banco local: rode, a partir de apps/financeiro,
--   cat supabase/tests/associates_import.sql \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no `supabase test db` (pg_prove).
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000d1', 'tes.associados@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.associados@escoteirosalbert.com.br', 'Grupo Teste Associados') as gid \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

select public.import_associates(:'gid', '[{"name":"Ana  Souza","branch":"lobinho","section":"Alcateia","active":true},{"name":"Bruno","branch":"adulto","active":false}]');
select id as ana from public.associates where name = 'Ana Souza' \gset
select public.import_associates(:'gid', jsonb_build_array(jsonb_build_object('id', :'ana', 'name', 'Ana Souza', 'branch', 'escoteiro', 'active', false)));
do $$ begin
  if (select branch::text || ':' || active from public.associates where name = 'Ana Souza') <> 'escoteiro:false' then raise exception 'FALHOU: atualização'; end if;
  if (select count(*) from public.associates where name in ('Ana Souza', 'Bruno')) <> 2 then raise exception 'FALHOU: cadastro'; end if;
end $$;
do $$ begin
  perform public.import_associates((select group_id from public.associates where name = 'Bruno'), '[{"name":"Ok Nome","branch":"adulto"},{"name":"X","branch":"lobinho"}]');
  raise exception 'FALHOU: linha inválida aceita';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;
do $$ begin
  if exists (select 1 from public.associates where name = 'Ok Nome') then raise exception 'FALHOU: não é tudo ou nada'; end if;
end $$;
reset role;
\echo ok 1 - TUDO OK
rollback;
