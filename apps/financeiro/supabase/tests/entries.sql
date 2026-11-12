-- Lançamentos: histórico de alterações (023) e troca de conta em lote (024) sem alterar o banco local: rode, a partir de apps/financeiro,
--   (echo 'begin;'; cat supabase/tests/entries.sql; echo 'rollback;') \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- com 023 e 024 já aplicadas. Termina com "TUDO OK"; qualquer falha interrompe o psql e a transação é desfeita.
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
select id as cat_r from public.categories where group_id = :'gid' and kind = 'receita' and active order by code limit 1 \gset

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

\echo '--- mover em lote de "A definir" para Cora'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.create_ledger_entry(:'gid', '2026-05-20', 'Mensalidade Ana', :'pix', null, false, 2000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 2000, 'description', 'mensalidade')), :'undefined_acc') as e2 \gset
select public.create_ledger_entry(:'gid', '2026-05-21', 'Já na Cora', :'pix', null, false, -500,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -500, 'description', 'tarifa')), :'acc') as e3 \gset
-- e2 conciliado com uma linha na conta "A definir": mover desfaz o vínculo, como set_ledger_entry_account
select (public.import_statement_lines(:'undefined_acc', null, null, 'x.ofx', '2026-05-01', '2026-05-31', null, null,
  '[{"date":"2026-05-20","amountCents":2000,"description":"Pix recebido Ana","externalId":"F1"}]'::jsonb)) ->> 'inserted' as inserted;
select id as l1 from statement_lines where account_id = :'undefined_acc' and external_id = 'F1' \gset
select public.link_reconciliation(array[:'l1']::uuid[], array[:'e2']::uuid[]) is not null as linked;

select public.move_ledger_entries_account(array[:'e1', :'e2', :'e3', :'e1']::uuid[], :'acc') as result \gset
\echo :result
select set_config('test.result', :'result', true);
select set_config('test.e2', :'e2', true);
select set_config('test.l1', :'l1', true);
select set_config('test.acc', :'acc', true);
do $$
declare r jsonb := current_setting('test.result')::jsonb;
begin
  if r <> '{"moved": 2, "unchanged": 1, "unlinked": 1}'::jsonb then raise exception 'FALHOU: resultado %', r; end if;
  if exists (select 1 from public.ledger_entries where id in (current_setting('test.e1')::uuid, current_setting('test.e2')::uuid) and account_id <> current_setting('test.acc')::uuid) then
    raise exception 'FALHOU: lançamento não mudou de conta';
  end if;
  if exists (select 1 from public.reconciliation_links where ledger_entry_id = current_setting('test.e2')::uuid) then raise exception 'FALHOU: vínculo ficou'; end if;
  if (select status from public.statement_lines where id = current_setting('test.l1')::uuid) <> 'aberta' then raise exception 'FALHOU: linha não reabriu'; end if;
  if not exists (select 1 from public.ledger_entry_history(current_setting('test.e2')::uuid) where action = 'ledger_entry.account_changed' and details->>'reason' = 'em lote') then
    raise exception 'FALHOU: troca sem auditoria';
  end if;
  if not exists (select 1 from public.ledger_entry_history(current_setting('test.e2')::uuid) where action = 'reconciliation.unlinked') then
    raise exception 'FALHOU: desfazer sem auditoria';
  end if;
end $$;

\echo '--- erros esperados no lote'
do $$ begin
  perform public.move_ledger_entries_account('{}'::uuid[], current_setting('test.acc')::uuid);
  raise exception 'FALHOU: lista vazia aceita';
exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (vazia): %', sqlerrm; end $$;
do $$ begin
  perform public.move_ledger_entries_account(array[current_setting('test.e2')::uuid], (select id from public.accounts where name = 'A definir' and group_id <> (select group_id from public.accounts where id = current_setting('test.acc')::uuid) limit 1));
  raise exception 'FALHOU: conta de outro grupo aceita';
exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (outro grupo): %', sqlerrm; end $$;

\echo '--- consulta (viewer) lê o histórico, mas não a tabela de auditoria'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.ledger_entry_history(current_setting('test.e1')::uuid)) <> 4 then
    raise exception 'FALHOU: consulta não vê o histórico';
  end if;
  if exists (select 1 from public.audit_events) then raise exception 'FALHOU: consulta leu audit_events'; end if;
end $$;
do $$ begin
  perform public.move_ledger_entries_account(array[current_setting('test.e1')::uuid], current_setting('test.acc')::uuid);
  raise exception 'FALHOU: consulta moveu';
exception when raise_exception then if sqlerrm not like '%sem permissão%' then raise; end if; end $$;

\echo '--- outro grupo não vê nada'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.ledger_entry_history(current_setting('test.e1')::uuid)) then raise exception 'FALHOU: outro grupo viu o histórico'; end if;
end $$;
reset role;

\echo 'TUDO OK'
