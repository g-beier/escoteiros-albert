-- Perfis de leitura (026) sem alterar o banco local: rode, a partir de apps/financeiro,
--   cat supabase/tests/import_profiles.sql \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no `supabase test db` (pg_prove).
-- Termina com "TUDO OK"; qualquer falha interrompe o psql e a transação é desfeita.
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000e1', 'tes.perfis@escoteirosalbert.com.br');
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000e2', 'tes.consulta.perfis@escoteirosalbert.com.br');
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000e3', 'tes.outro.perfis@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.perfis@escoteirosalbert.com.br', 'Grupo Teste Perfis') as gid \gset
select public.admin_bootstrap_group('tes.outro.perfis@escoteirosalbert.com.br', 'Grupo Teste Outro') as gid2 \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000e1';
insert into public.memberships(group_id, user_id, role) values (:'gid', '00000000-0000-0000-0000-0000000000e2', 'viewer');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select public.create_account(:'gid', 'Nubank', 'corrente', null, null, null, 0, null, null) as acc \gset
select public.save_import_profile(:'gid', null, 'Nubank OFX', 'ofx', 'ofx:nu', '{"memoSplit":true}'::jsonb) as p1 \gset
select public.save_import_profile(:'gid', null, 'Itaú OFX', 'ofx', 'ofx:itau', '{}'::jsonb) as p2 \gset
select set_config('test.p1', :'p1', false) is not null as ok;
select (public.import_statement_lines(:'acc', :'p1', '{"memoSplit":true}'::jsonb, 'out.ofx', '2026-10-01', '2026-10-31', null, null,
  '[{"date":"2026-10-02","amountCents":1000,"description":"Pix recebido - Ana","externalId":"N-1"}]'::jsonb)) ->> 'inserted' as inserted;

\echo '--- 1. renomear: valida nome e repetição, audita'
select public.rename_import_profile(:'p1', '  Nubank (conta do grupo)  ');
do $$ begin
  if (select name from public.import_profiles where id = current_setting('test.p1')::uuid) <> 'Nubank (conta do grupo)' then raise exception 'FALHOU: nome'; end if;
  begin perform public.rename_import_profile(current_setting('test.p1')::uuid, 'itaú ofx'); raise exception 'FALHOU: nome repetido aceito';
  exception when others then if sqlerrm not like '%Já existe%' then raise; end if; end;
  begin perform public.rename_import_profile(current_setting('test.p1')::uuid, 'x'); raise exception 'FALHOU: nome curto aceito';
  exception when others then if sqlerrm not like '%2 a 80%' then raise; end if; end;
end $$;

\echo '--- 2. consulta e outro grupo não alteram'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
do $$ begin
  begin perform public.delete_import_profile(current_setting('test.p1')::uuid); raise exception 'FALHOU: consulta excluiu';
  exception when others then if sqlerrm not like '%Perfil não encontrado%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
do $$ begin
  begin perform public.rename_import_profile(current_setting('test.p1')::uuid, 'Invadido'); raise exception 'FALHOU: outro grupo renomeou';
  exception when others then if sqlerrm not like '%Perfil não encontrado%' then raise; end if; end;
end $$;

\echo '--- 3. excluir: a importação fica, sem perfil e com a cópia das configurações'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
do $$
declare r jsonb := public.delete_import_profile(current_setting('test.p1')::uuid);
begin
  if (r->>'imports')::int <> 1 then raise exception 'FALHOU: contagem %', r; end if;
  if exists (select 1 from public.import_profiles where id = current_setting('test.p1')::uuid) then raise exception 'FALHOU: perfil ficou'; end if;
  if not exists (select 1 from public.statement_imports where file_name = 'out.ofx' and profile_id is null and profile_settings ? 'memoSplit') then
    raise exception 'FALHOU: importação';
  end if;
end $$;

\echo '--- 4. auditoria (lida sem RLS)'
reset role;
do $$ begin
  if (select count(*) from public.audit_events where entity_id = current_setting('test.p1')
      and action in ('import_profile.renamed', 'import_profile.deleted')) <> 2 then raise exception 'FALHOU: auditoria'; end if;
end $$;

\echo ok 1 - TUDO OK
rollback;
