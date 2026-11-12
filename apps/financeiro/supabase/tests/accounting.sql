-- Teste das funções de contabilidade (014) sem alterar o banco local: rode, a partir de apps/financeiro,
--   (echo 'begin;'; cat supabase/tests/accounting.sql; echo 'rollback;') \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- com 014 já aplicada. Termina com "TUDO OK"; qualquer falha interrompe o psql e a transação é desfeita.
\set ON_ERROR_STOP 1
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'tes.contabil@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000b2', 'consulta.contabil@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.contabil@escoteirosalbert.com.br', 'Grupo Teste Contabilidade') as gid \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000b1';
insert into public.memberships(group_id, user_id, role) values (:'gid', '00000000-0000-0000-0000-0000000000b2', 'viewer');
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

\echo '--- contas com conta contábil e chave OFX'
select public.create_account(:'gid', 'Nubank', 'corrente', 'Nubank', null, null, 0, null, '1.1.1.2.0001') as acc \gset
select public.create_account(:'gid', 'Itaú', 'corrente', null, null, null, 0, null, null) as acc2 \gset
do $$ begin
  perform public.create_account((select group_id from public.accounts where name = 'Nubank' and ledger_code is not null limit 1),
    'Errada', 'corrente', null, null, null, 0, null, '1.1');
  raise exception 'máscara deveria recusar 1.1';
exception when check_violation then null;
end $$;
select public.set_account_ofx_key(:'acc', '260:1');
do $$ begin
  perform public.set_account_ofx_key((select id from public.accounts where name = 'Itaú'), '260:1');
  raise exception 'a mesma chave OFX não pode ir para duas contas';
exception when raise_exception then
  if sqlerrm not like '%outra conta%' then raise; end if;
end $$;

\echo '--- rubricas e formas de pagamento só por funções'
select public.create_category(:'gid', '2.99', 'Contabilidade teste', null) as cat_parent \gset
select public.create_category(:'gid', '2.99.1', 'Honorários', '4.1.2.1.0010') as cat_d \gset
select public.create_category(:'gid', '1.99', 'Doações teste', '3.1.1.1.0005') as cat_r \gset
select public.update_category(:'cat_parent', 'Contabilidade', '4.1.2.1.0000');
select public.set_category_active(:'cat_parent', true);
select public.create_payment_method(:'gid', 'Cheque') as pm \gset
select public.update_payment_method(:'pm', 'Cheque nominal');
select public.set_payment_method_active(:'pm', false);
do $$ begin
  insert into public.categories(group_id, code, name) values ((select group_id from public.categories where name = 'Honorários'), '2.99.2', 'Direto');
  raise exception 'escrita direta em categories deveria ser recusada';
exception when insufficient_privilege then null;
end $$;

\echo '--- importação com campos OFX, conciliação e ID OFX nas visões'
select (public.import_statement_lines(:'acc', null, null, 'nubank.ofx', '2026-05-01', '2026-05-31', null, null,
  '[{"date":"2026-05-18","amountCents":4000,"description":"Pix recebido Ana","externalId":"FIT-A","trnType":"credit","payee":"Ana","reference":"R1"},
    {"date":"2026-05-19","amountCents":-1500,"description":"Pagamento honorários","externalId":"FIT-B","trnType":"PAYMENT","checkNumber":"77"}]'::jsonb)) ->> 'inserted' as inserted;
select id as l_a from public.statement_lines where external_id = 'FIT-A' \gset
do $$ begin
  if (select trn_type from public.statement_lines where external_id = 'FIT-A') <> 'CREDIT' then raise exception 'TRNTYPE não normalizado'; end if;
  if (select check_number from public.statement_lines where external_id = 'FIT-B') <> '77' then raise exception 'CHECKNUM não gravado'; end if;
end $$;

-- uma linha de R$ 40 que paga dois lançamentos (1:N): os dois carregam o mesmo ID OFX
select public.create_ledger_entry(:'gid', '2026-05-18', 'Ana', :'pix', null, false, 2500,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 2500, 'description', 'doação')), :'acc') as e1 \gset
select public.create_ledger_entry(:'gid', '2026-05-18', 'Ana (mista)', :'pix', null, false, 1500,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 2000, 'description', 'doação'),
                    jsonb_build_object('category_id', :'cat_d', 'amount_cents', -500, 'description', 'ressarcimento')), :'acc') as e2 \gset
select public.link_reconciliation(array[:'l_a']::uuid[], array[:'e1', :'e2']::uuid[]);
do $$ begin
  if (select count(*) from public.ledger_entry_rows where external_ids @> array['FIT-A']) <> 2 then raise exception 'ID OFX deveria agrupar os 2 lançamentos'; end if;
  if (select count(*) from public.entry_split_rows where external_ids @> array['FIT-A']) <> 3 then raise exception 'ID OFX deveria chegar aos 3 rateios'; end if;
  if not exists (select 1 from public.ledger_entry_rows where search_text like '%FIT-A%') then raise exception 'busca deveria achar o ID OFX'; end if;
  if (select count(*) from public.entry_split_rows where category_ledger_code is not null and account_ledger_code = '1.1.1.2.0001'
      and external_ids @> array['FIT-A']) <> 3 then raise exception 'contas contábeis ausentes na visão'; end if;
end $$;

\echo '--- consulta: sem permissão de escrita'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ begin
  perform public.update_category((select id from public.categories where name = 'Honorários'), 'X', null);
  raise exception 'consulta não pode alterar rubricas';
exception when raise_exception then
  if sqlerrm not like '%sem permissão%' then raise; end if;
end $$;
do $$ begin
  if (select count(*) from public.ledger_entry_rows where external_ids @> array['FIT-A']) <> 2 then raise exception 'consulta deveria ler as visões'; end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.audit_events where action in ('category.created', 'category.updated', 'payment_method.created',
    'payment_method.updated', 'payment_method.deactivated', 'account.ofx_key_set')) < 8 then
    raise exception 'auditoria incompleta';
  end if;
end $$;
\echo 'TUDO OK'
