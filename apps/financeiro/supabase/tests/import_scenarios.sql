-- Cenários de importação (015) sem alterar o banco local: rode, a partir de apps/financeiro,
--   (echo 'begin;'; cat supabase/tests/import_scenarios.sql; echo 'rollback;') \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- Termina com "TUDO OK"; qualquer falha interrompe o psql e a transação é desfeita.
\set ON_ERROR_STOP 1
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000c1', 'tes.cenarios@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.cenarios@escoteirosalbert.com.br', 'Grupo Teste Cenários') as gid \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000c1';
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select id as cat_r from public.categories where group_id = :'gid' and code = '1.1' \gset
select id as root_r from public.categories where group_id = :'gid' and code = '1' \gset
select id as root_d from public.categories where group_id = :'gid' and code = '2' \gset
select public.fallback_account(:'gid') as indef \gset

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.create_account(:'gid', 'Cora', 'corrente', null, null, null, 0, null, null) as acc \gset

\echo '--- 1. lançamento digitado antes, sem conta ("A definir")'
select public.create_ledger_entry(:'gid', '2026-06-02', 'Mensalidade Ana', :'pix', null, false, 2000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 2000, 'description', 'junho')), :'indef') as e_ana \gset

\echo '--- 2. extrato parcial (convertido): 3 linhas, uma pendente'
select (public.import_statement_lines(:'acc', null, null, 'parcial.ofx', '2026-06-01', '2026-06-10', null, null,
  '[{"date":"2026-06-02","amountCents":2000,"description":"PIX RECEBIDO ANA","externalId":"CONV-1"},
    {"date":"2026-06-03","amountCents":-1500,"description":"TARIFA PACOTE","externalId":"CONV-2"},
    {"date":"2026-06-05","amountCents":-9000,"description":"PIX ENVIADO PAPELARIA (PENDENTE)","externalId":"CONV-3"}]'::jsonb)) ->> 'inserted' as parcial_inserted;
select id as imp_parcial from public.statement_imports where file_name = 'parcial.ofx' \gset
select id as l_ana from public.statement_lines where external_id = 'CONV-1' \gset

\echo '--- 3. vincular: o lançamento sai de "A definir" para a conta do extrato'
select public.link_reconciliation(array[:'l_ana']::uuid[], array[:'e_ana']::uuid[]);
do $$ begin
  if (select a.name from public.ledger_entries e join public.accounts a on a.id = e.account_id where e.name = 'Mensalidade Ana') <> 'Cora' then
    raise exception 'FALHOU: lançamento deveria ir para Cora';
  end if;
end $$;

\echo '--- 4. pré-conferência do extrato completo, reconvertido (IDs novos)'
select set_config('test.preview', public.preview_statement_lines(:'acc', '2026-06-01', '2026-06-30',
  '[{"date":"2026-06-02","amountCents":2000,"description":"PIX RECEBIDO ANA","externalId":"NEW-1"},
    {"date":"2026-06-03","amountCents":-1500,"description":"TARIFA PACOTE MENSAL","externalId":"NEW-2"},
    {"date":"2026-06-06","amountCents":-9000,"description":"PIX ENVIADO PAPELARIA","externalId":"NEW-3"},
    {"date":"2026-06-20","amountCents":5000,"description":"PIX RECEBIDO BIA","externalId":"NEW-4"}]'::jsonb)::text, true) is not null as ok;
do $$
declare p jsonb := current_setting('test.preview')::jsonb;
begin
  if (select string_agg(x->>'status', ',' order by (x->>'index')::int) from jsonb_array_elements(p->'lines') x)
    <> 'importada,suspeita,nova,nova' then raise exception 'FALHOU: status %', p->'lines'; end if;
  if jsonb_array_length(p->'orphans') <> 1 or p->'orphans'->0->>'description' not like '%PENDENTE%' then
    raise exception 'FALHOU: órfã %', p->'orphans';
  end if;
end $$;

\echo '--- 5. importação completa com a suspeita desmarcada (skip): só as novas entram'
select set_config('test.completo', (public.import_statement_lines(:'acc', null, null, 'completo.ofx', '2026-06-01', '2026-06-30', null, null,
  '[{"date":"2026-06-02","amountCents":2000,"description":"PIX RECEBIDO ANA","externalId":"NEW-1"},
    {"date":"2026-06-03","amountCents":-1500,"description":"TARIFA PACOTE MENSAL","externalId":"NEW-2","skip":true},
    {"date":"2026-06-06","amountCents":-9000,"description":"PIX ENVIADO PAPELARIA","externalId":"NEW-3"},
    {"date":"2026-06-20","amountCents":5000,"description":"PIX RECEBIDO BIA","externalId":"NEW-4"}]'::jsonb))::text, true) is not null as ok;
do $$ begin
  if current_setting('test.completo')::jsonb @> '{"inserted":2,"skipped_duplicates":1,"skipped_by_user":1}' is not true then
    raise exception 'FALHOU: contagem %', current_setting('test.completo');
  end if;
  if (select count(*) from public.statement_lines l join public.accounts a on a.id = l.account_id where a.name = 'Cora') <> 5 then
    raise exception 'FALHOU: esperado 3 do parcial + 2 novas';
  end if;
end $$;

\echo '--- 6. ignorar em massa a órfã'
select public.ignore_statement_lines(array(select id from public.statement_lines where description like '%(PENDENTE)%'), 'Não consta no extrato completo');

\echo '--- 7. criação em massa: tarifa, papelaria e Bia viram lançamentos conciliados'
select public.create_entries_from_statement_lines(jsonb_agg(jsonb_build_object('lineId', id, 'paymentMethodId', :'pix') order by line_date))
from public.statement_lines where account_id = :'acc' and status = 'aberta' \gset
do $$ begin
  if (select count(*) from public.statement_lines l join public.accounts a on a.id = l.account_id where a.name = 'Cora' and l.status = 'aberta') <> 0 then
    raise exception 'FALHOU: sobrou linha aberta';
  end if;
  if (select string_agg(c.code || ':' || s.amount_cents, ',' order by e.entry_date) from public.ledger_entries e
      join public.entry_splits s on s.entry_id = e.id join public.categories c on c.id = s.category_id
      join public.accounts a on a.id = e.account_id where a.name = 'Cora' and e.name <> 'Mensalidade Ana') <> '2:-1500,2:-9000,1:5000' then
    raise exception 'FALHOU: rubricas raiz por sinal';
  end if;
end $$;
do $$ begin
  perform public.create_entries_from_statement_lines('[{"lineId":"00000000-0000-0000-0000-000000000000"}]');
  raise exception 'FALHOU: linha inexistente aceita';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

\echo '--- 8. desfazer a importação completa: vínculos desfeitos, lançamentos mantidos'
select id as imp_completo from public.statement_imports where file_name = 'completo.ofx' \gset
select public.delete_statement_import(:'imp_completo') as undone \gset
do $$ begin
  if (select count(*) from public.statement_imports where file_name = 'completo.ofx') <> 0 then raise exception 'FALHOU: importação ficou'; end if;
  if (select count(*) from public.ledger_entries e join public.accounts a on a.id = e.account_id where a.name = 'Cora') <> 4 then
    raise exception 'FALHOU: lançamentos deveriam continuar';
  end if;
  if (select count(*) from public.ledger_entry_rows r join public.accounts a on a.id = r.account_id where a.name = 'Cora' and r.reconciled) <> 2 then
    raise exception 'FALHOU: só Ana e a tarifa (do parcial) seguem conciliadas';
  end if;
end $$;

\echo '--- 9. observações: gravadas, na busca e apagadas na edição'
select public.create_ledger_entry(:'gid', '2026-06-30', 'Com observação', :'pix', null, false, 100,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 100, 'description', 'teste')), :'acc', '  Pago em espécie na reunião  ') as e_obs \gset
do $$ begin
  if (select notes from public.ledger_entries where name = 'Com observação') <> 'Pago em espécie na reunião' then raise exception 'FALHOU: observações'; end if;
  if not exists (select 1 from public.ledger_entry_rows where search_text like '%espécie%') then raise exception 'FALHOU: busca nas observações'; end if;
end $$;
select public.update_ledger_entry(:'e_obs', '2026-06-30', 'Com observação', :'pix', null, false, 100,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 100, 'description', 'teste')), null, '');
do $$ begin
  if (select notes from public.ledger_entries where name = 'Com observação') is not null then raise exception 'FALHOU: observação vazia deveria apagar'; end if;
end $$;

reset role;
\echo 'TUDO OK'
