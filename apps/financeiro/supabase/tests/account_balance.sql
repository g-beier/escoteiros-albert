-- Saldo da conta numa data (025) sem alterar o banco local: rode, a partir de apps/financeiro,
--   (echo 'begin;'; cat supabase/tests/account_balance.sql; echo 'rollback;') \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- Termina com "TUDO OK"; qualquer falha interrompe o psql e a transação é desfeita.
\set ON_ERROR_STOP 1
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000d1', 'tes.saldo@escoteirosalbert.com.br');
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000d2', 'tes.intruso@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.saldo@escoteirosalbert.com.br', 'Grupo Teste Saldo') as gid \gset
select public.admin_bootstrap_group('tes.intruso@escoteirosalbert.com.br', 'Grupo Teste Intruso') as gid2 \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000d1';
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select id as cat_r from public.categories where group_id = :'gid' and code = '1.1' \gset
select id as cat_d from public.categories where group_id = :'gid' and code like '2.%' order by code limit 1 \gset

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select public.create_account(:'gid', 'Banco Saldo', 'corrente', null, null, null, 100000, '2026-01-01', null) as acc \gset
select set_config('test.acc', :'acc', false) is not null as ok;
select public.create_account(:'gid', 'Banco Sem Data', 'corrente', null, null, null, 5000, null, null) as acc_nodate \gset
select public.create_account(:'gid', 'Outra', 'corrente', null, null, null, 0, null, null) as other \gset

-- Antes da data do saldo inicial (não conta), dentro, no próprio dia (não conta) e em outra conta (não conta).
select public.create_ledger_entry(:'gid', '2025-12-31', 'Antes do saldo', :'pix', null, false, 999,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 999, 'description', 'teste')), :'acc') is not null as ok;
select public.create_ledger_entry(:'gid', '2026-02-10', 'Receita', :'pix', null, false, 3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 3000, 'description', 'teste')), :'acc') is not null as ok;
select public.create_ledger_entry(:'gid', '2026-02-20', 'Despesa', :'pix', null, false, -1200,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -1200, 'description', 'teste')), :'acc') is not null as ok;
select public.create_ledger_entry(:'gid', '2026-03-01', 'No dia', :'pix', null, false, 700,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 700, 'description', 'teste')), :'acc') is not null as ok;
select public.create_ledger_entry(:'gid', '2026-02-15', 'Outra conta', :'pix', null, false, 50000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 50000, 'description', 'teste')), :'other') is not null as ok;
select public.create_ledger_entry(:'gid', '2025-06-01', 'Sem data', :'pix', null, false, 250,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 250, 'description', 'teste')), :'acc_nodate') is not null as ok;

\echo '--- 1. saldo inicial + lançamentos da conta entre a data do saldo inicial e a véspera'
select set_config('test.b', public.account_balance_before(:'acc', '2026-03-01')::text, true) is not null as ok;
do $$
declare b jsonb := current_setting('test.b')::jsonb;
begin
  if (b->>'balance_cents')::bigint <> 101800 or (b->>'movements_cents')::bigint <> 1800 or (b->>'entry_count')::int <> 2
    or (b->>'before_opening')::boolean then
    raise exception 'FALHOU: saldo %', b;
  end if;
end $$;

\echo '--- 2. no dia do saldo inicial: só o saldo inicial'
do $$ begin
  if (public.account_balance_before((select id from public.accounts where name = 'Banco Saldo'), '2026-01-01')->>'balance_cents')::bigint <> 100000 then
    raise exception 'FALHOU: saldo no dia do saldo inicial';
  end if;
end $$;

\echo '--- 3. antes da data do saldo inicial: sem saldo calculado'
do $$
declare b jsonb := public.account_balance_before((select id from public.accounts where name = 'Banco Saldo'), '2025-12-01');
begin
  if not (b->>'before_opening')::boolean or b->'balance_cents' <> 'null'::jsonb then raise exception 'FALHOU: antes do saldo inicial %', b; end if;
end $$;

\echo '--- 4. conta sem data de saldo inicial: todos os lançamentos anteriores'
do $$ begin
  if (public.account_balance_before((select id from public.accounts where name = 'Banco Sem Data'), '2026-01-01')->>'balance_cents')::bigint <> 5250 then
    raise exception 'FALHOU: conta sem data';
  end if;
end $$;

\echo '--- 5. quem não é do grupo não vê a conta'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
do $$ begin
  perform public.account_balance_before(current_setting('test.acc')::uuid, '2026-03-01');
  raise exception 'FALHOU: intruso leu o saldo';
exception when others then
  if sqlerrm not like '%Conta não encontrada%' then raise; end if;
end $$;

\echo 'TUDO OK'
