-- Lançamentos: histórico de alterações (023) sem alterar o banco local: rode, a partir de apps/financeiro,
--   (echo 'begin;'; cat supabase/tests/entries.sql; echo 'rollback;') \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- com 023 já aplicada. Termina com "TUDO OK"; qualquer falha interrompe o psql e a transação é desfeita.
\set ON_ERROR_STOP 1
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'tes.lanc@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000c2', 'consulta.lanc@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000c3', 'outro.lanc@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.lanc@escoteirosalbert.com.br', 'Grupo Teste Lançamentos') as gid \gset
select public.admin_bootstrap_group('outro.lanc@escoteirosalbert.com.br', 'Outro Grupo Lançamentos') as gid2 \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000c1';
insert into public.memberships(group_id, user_id, role) values (:'gid', '00000000-0000-0000-0000-0000000000c2', 'viewer');
insert into public.accounts(group_id, name, kind) values (:'gid', 'Cora', 'corrente') returning id as acc \gset
select id as undefined_acc from public.accounts where group_id = :'gid' and name = 'A definir' \gset
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select id as cat_d from public.categories where group_id = :'gid' and kind = 'despesa' and active order by code limit 1 \gset

-- como tesoureiro
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

select public.create_ledger_entry(:'gid', '2026-05-18', 'Papelaria', :'pix', null, false, -3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -3000, 'description', 'cartolina')), :'undefined_acc') as e1 \gset
select public.update_ledger_entry(:'e1', '2026-05-18', 'Papelaria Central', :'pix', 'NF 12', true, -3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -2000, 'description', 'cartolina'),
                    jsonb_build_object('category_id', :'cat_d', 'amount_cents', -1000, 'description', 'cola')), :'undefined_acc');
select public.set_ledger_entry_outside_statement(:'e1', true);
select set_config('test.e1', :'e1', true);

\echo '--- histórico (tesoureiro)'
select action, actor_email from public.ledger_entry_history(:'e1') order by id;
do $$ begin
  if (select count(*) from public.ledger_entry_history(current_setting('test.e1')::uuid)) <> 3 then
    raise exception 'FALHOU: histórico deveria ter 3 eventos';
  end if;
  if (select details->'after'->'splits' from public.ledger_entry_history(current_setting('test.e1')::uuid) where action = 'ledger_entry.updated')::text
     not like '%cola%' then
    raise exception 'FALHOU: edição sem os rateios novos';
  end if;
  if exists (select 1 from public.ledger_entry_history(current_setting('test.e1')::uuid) where actor_email is distinct from 'tes.lanc@escoteirosalbert.com.br') then
    raise exception 'FALHOU: autor errado';
  end if;
end $$;

\echo '--- consulta (viewer) lê o histórico, mas não a tabela de auditoria'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.ledger_entry_history(current_setting('test.e1')::uuid)) <> 3 then
    raise exception 'FALHOU: consulta não vê o histórico';
  end if;
  if exists (select 1 from public.audit_events) then raise exception 'FALHOU: consulta leu audit_events'; end if;
end $$;

\echo '--- outro grupo não vê nada'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.ledger_entry_history(current_setting('test.e1')::uuid)) then raise exception 'FALHOU: outro grupo viu o histórico'; end if;
end $$;
reset role;

\echo 'TUDO OK'
