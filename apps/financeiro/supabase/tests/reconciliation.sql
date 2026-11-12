-- Teste manual das funções de conciliação (013) sem alterar o banco local: rode, a partir de apps/financeiro,
--   cat supabase/tests/reconciliation.sql \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no `supabase test db` (pg_prove).
-- Termina com "TUDO OK"; qualquer falha interrompe o psql e a transação é desfeita.
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'tes.teste@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000a2', 'consulta.teste@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.teste@escoteirosalbert.com.br', 'Grupo Teste Conciliação') as gid \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.memberships(group_id, user_id, role) values (:'gid', '00000000-0000-0000-0000-0000000000a2', 'viewer');
insert into public.accounts(group_id, name, kind, opening_balance_cents, opening_date) values (:'gid', 'Cora', 'corrente', 100000, '2026-05-01') returning id as acc \gset
insert into public.accounts(group_id, name, kind) values (:'gid', 'Outra', 'corrente') returning id as acc2 \gset
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select id as cat_d from public.categories where group_id = :'gid' and kind = 'despesa' and active order by code limit 1 \gset
select id as cat_r from public.categories where group_id = :'gid' and kind = 'receita' and active order by code limit 1 \gset

-- como tesoureiro
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select (public.import_statement_lines(:'acc', null, null, 'cora.csv', '2026-05-01', '2026-05-31', 100000, 54010,
  '[{"date":"2026-05-18","amountCents":-23990,"description":"Pix enviado Lucas T F","kind":"Pix enviado","counterparty":"Lucas T F"},
    {"date":"2026-05-18","amountCents":-15000,"description":"Pix enviado Comunidade","kind":"Pix enviado","counterparty":"Comunidade"},
    {"date":"2026-05-19","amountCents":-60000,"description":"Pagamento de conta Atenante","kind":"Pagamento de conta","counterparty":"Atenante"},
    {"date":"2026-05-20","amountCents":2000,"description":"Pix recebido Ana","kind":"Pix recebido","counterparty":"Ana"},
    {"date":"2026-05-20","amountCents":2000,"description":"Pix recebido Bia","kind":"Pix recebido","counterparty":"Bia"},
    {"date":"2026-05-21","amountCents":-5000,"description":"Tarifa duplicada"},
    {"date":"2026-05-22","amountCents":-3000,"description":"Pix enviado Papelaria","kind":"Pix enviado","counterparty":"Papelaria"}]'::jsonb)) ->> 'inserted' as inserted;

select id as l_lucas from statement_lines where account_id = :'acc' and counterparty = 'Lucas T F' \gset
select id as l_com from statement_lines where account_id = :'acc' and counterparty = 'Comunidade' \gset
select id as l_aten from statement_lines where account_id = :'acc' and counterparty = 'Atenante' \gset
select id as l_ana from statement_lines where account_id = :'acc' and counterparty = 'Ana' \gset
select id as l_bia from statement_lines where account_id = :'acc' and counterparty = 'Bia' \gset
select id as l_tarifa from statement_lines where account_id = :'acc' and description = 'Tarifa duplicada' \gset
select id as l_pap from statement_lines where account_id = :'acc' and counterparty = 'Papelaria' \gset

-- lançamentos digitados à mão
select public.create_ledger_entry(:'gid', '2026-05-18', 'Lucas T. F. material', :'pix', null, false, -23990,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -23990, 'description', 'material')), :'acc') as e_lucas \gset
select public.create_ledger_entry(:'gid', '2026-05-18', 'Aluguel salão', :'pix', null, false, -15000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -15000, 'description', 'aluguel')), :'acc') as e_com \gset
select public.create_ledger_entry(:'gid', '2026-05-19', 'Atenante parte 1', :'pix', null, false, -40000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -40000, 'description', 'p1')), :'acc') as e_a1 \gset
select public.create_ledger_entry(:'gid', '2026-05-19', 'Atenante parte 2', :'pix', null, false, -20000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -20000, 'description', 'p2')), :'acc') as e_a2 \gset
select public.create_ledger_entry(:'gid', '2026-05-20', 'Mensalidade Ana', :'pix', null, false, 2000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 2000, 'description', 'mensalidade')), :'acc') as e_ana \gset
select public.create_ledger_entry(:'gid', '2026-05-20', 'Mensalidade Bia', :'pix', null, false, 2000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 2000, 'description', 'mensalidade')), :'acc') as e_bia \gset
select public.create_ledger_entry(:'gid', '2026-05-25', 'Caixa: lanche', :'pix', null, false, -1000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -1000, 'description', 'lanche')), :'acc') as e_caixa \gset

\echo '--- consulta de sugestões: linhas abertas × lançamentos sem vínculo, mesma data e valor'
select l.line_date, l.amount_cents, l.counterparty, count(e.entry_id) as candidatos, string_agg(e.name, ' | ' order by e.name) as nomes
from statement_lines l
left join ledger_entry_rows e on e.account_id = l.account_id and e.entry_date = l.line_date and e.total_cents = l.amount_cents
  and not e.reconciled and not e.outside_statement
  and not exists (select 1 from reconciliation_rejections r where r.statement_line_id = l.id and r.ledger_entry_id = e.entry_id)
where l.account_id = :'acc' and l.status = 'aberta' and l.line_date between '2026-05-01' and '2026-05-31'
group by l.id, l.line_date, l.amount_cents, l.counterparty order by l.line_date, l.amount_cents;

\echo '--- 1:1'
select public.link_reconciliation(array[:'l_lucas']::uuid[], array[:'e_lucas']::uuid[]) is not null as linked_1_1;
select status from statement_lines where id = :'l_lucas';
select reconciled from ledger_entry_rows where entry_id = :'e_lucas';
select bool_and(reconciled) from entry_split_rows where entry_id = :'e_lucas';

\echo '--- 1:N (uma linha = dois lançamentos)'
select public.link_reconciliation(array[:'l_aten']::uuid[], array[:'e_a1', :'e_a2']::uuid[]) as set_aten \gset
select statement_line_id = :'l_aten' as line_ok, amount_cents from reconciliation_links where link_set_id = :'set_aten' order by amount_cents;
select count(*) as link_rows from reconciliation_link_rows where account_id = :'acc';

\echo '--- erros esperados'
do $$ begin
  perform public.link_reconciliation(array[(select id from statement_lines where counterparty = 'Comunidade')], array[(select id from ledger_entries where name = 'Mensalidade Ana')]);
  raise exception 'FALHOU: somas diferentes aceitas';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (soma diferente): %', sqlerrm; end $$;
do $$ begin
  perform public.link_reconciliation(array[(select id from statement_lines where counterparty = 'Comunidade')], array[(select id from ledger_entries where name = 'Lucas T. F. material')]);
  raise exception 'FALHOU: lançamento já conciliado aceito';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (já conciliado): %', sqlerrm; end $$;
do $$ begin
  perform public.link_reconciliation(array[(select id from statement_lines where counterparty = 'Ana'), (select id from statement_lines where counterparty = 'Bia')],
    array[(select id from ledger_entries where name = 'Mensalidade Ana'), (select id from ledger_entries where name = 'Mensalidade Bia')]);
  raise exception 'FALHOU: N:M aceito';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (N:M): %', sqlerrm; end $$;

\echo '--- N:1 (duas linhas = um lançamento)'
select public.create_ledger_entry(:'gid', '2026-05-20', 'Mensalidades Ana e Bia', :'pix', null, false, 4000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_r', 'amount_cents', 4000, 'description', 'duas')), :'acc') as e_ab \gset
select public.link_reconciliation(array[:'l_ana', :'l_bia']::uuid[], array[:'e_ab']::uuid[]) as set_ab \gset
select count(*) as links_n1, sum(amount_cents) from reconciliation_links where link_set_id = :'set_ab';

\echo '--- desfazer (pela linha Bia desfaz o conjunto inteiro)'
select public.unlink_reconciliation(:'l_bia');
select counterparty, status from statement_lines where id in (:'l_ana', :'l_bia') order by 1;
select count(*) as links_restantes from reconciliation_links where link_set_id = :'set_ab';

\echo '--- recusar sugestão'
select public.reject_reconciliation_suggestion(:'l_ana', :'e_ana');
select public.reject_reconciliation_suggestion(:'l_ana', :'e_ana'); -- idempotente
select count(*) as recusas from reconciliation_rejections where statement_line_id = :'l_ana';

\echo '--- ignorar / reabrir'
select public.ignore_statement_line(:'l_tarifa', 'Linha duplicada');
select status, ignored_reason from statement_lines where id = :'l_tarifa';
do $$ begin
  perform public.link_reconciliation(array[(select id from statement_lines where description = 'Tarifa duplicada')], array[(select id from ledger_entries where name = 'Caixa: lanche')]);
  raise exception 'FALHOU: linha ignorada vinculada';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (ignorada): %', sqlerrm; end $$;
select public.reopen_statement_line(:'l_tarifa');
select status, ignored_reason from statement_lines where id = :'l_tarifa';
select public.ignore_statement_line(:'l_tarifa', 'Linha duplicada');

\echo '--- criar lançamento a partir da linha (atômico)'
do $$ begin
  perform public.create_entry_from_statement_line((select id from statement_lines where counterparty = 'Papelaria'), '2026-05-22', 'Papelaria', (select id from payment_methods where name = 'PIX' and group_id = (select group_id from statement_lines where counterparty = 'Papelaria')), null, false, -2999,
    jsonb_build_array(jsonb_build_object('category_id', (select id from categories where kind = 'despesa' and group_id = (select group_id from statement_lines where counterparty = 'Papelaria') order by code limit 1), 'amount_cents', -2999, 'description', 'x')));
  raise exception 'FALHOU: total diferente aceito';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (total ≠ linha): %', sqlerrm; end $$;
select public.create_entry_from_statement_line(:'l_pap', '2026-05-22', 'Papelaria', :'pix', null, false, -3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -3000, 'description', 'material escritório'))) as e_pap \gset
select e.account_id = :'acc' as conta_da_linha, l.status, r.reconciled from ledger_entries e
  join reconciliation_links k on k.ledger_entry_id = e.id join statement_lines l on l.id = k.statement_line_id
  join ledger_entry_rows r on r.entry_id = e.id where e.id = :'e_pap';

\echo '--- fora do extrato / trocar conta'
select public.set_ledger_entry_outside_statement(:'e_caixa', true);
select outside_statement from ledger_entry_rows where entry_id = :'e_caixa';
do $$ begin
  perform public.set_ledger_entry_outside_statement((select id from ledger_entries where name = 'Lucas T. F. material'), true);
  raise exception 'FALHOU: conciliado marcado fora do extrato';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (conciliado fora do extrato): %', sqlerrm; end $$;
select public.set_ledger_entry_account(:'e_caixa', :'acc2');
select account_id = :'acc2' as conta_trocada from ledger_entries where id = :'e_caixa';

\echo '--- trocar a conta de um lançamento conciliado desfaz o conjunto'
select public.set_ledger_entry_account(:'e_lucas', :'acc2');
select status from statement_lines where id = :'l_lucas';
select public.set_ledger_entry_account(:'e_lucas', :'acc');
select public.link_reconciliation(array[:'l_lucas']::uuid[], array[:'e_lucas']::uuid[]) is not null as relinked;

\echo '--- excluir um lançamento do conjunto 1:N reabre a linha e solta o outro lançamento'
select public.delete_ledger_entry(:'e_a2');
select status from statement_lines where id = :'l_aten';
select reconciled from ledger_entry_rows where entry_id = :'e_a1';

\echo '--- editar o total de um lançamento conciliado desfaz o vínculo; editar só o nome mantém'
select public.update_ledger_entry(:'e_lucas', '2026-05-18', 'Lucas T. F. — material', :'pix', null, false, -23990,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -23990, 'description', 'material')), null);
select status as apos_editar_nome from statement_lines where id = :'l_lucas';
select public.update_ledger_entry(:'e_lucas', '2026-05-18', 'Lucas T. F. — material', :'pix', null, false, -24000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_d', 'amount_cents', -24000, 'description', 'material')), null);
select status as apos_editar_total from statement_lines where id = :'l_lucas';


\echo '--- consulta (somente leitura)'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
select count(*) as linhas_visiveis from statement_lines where account_id = :'acc';
select count(*) as vinculos_visiveis from reconciliation_link_rows;
do $$ begin
  perform public.link_reconciliation(array[(select id from statement_lines where counterparty = 'Comunidade')], array[(select id from ledger_entries where name = 'Aluguel salão')]);
  raise exception 'FALHOU: consulta vinculou';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (consulta não vincula): %', sqlerrm; end $$;
do $$ begin
  perform public.ignore_statement_line((select id from statement_lines where counterparty = 'Comunidade'), 'Outro: teste');
  raise exception 'FALHOU: consulta ignorou';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (consulta não ignora): %', sqlerrm; end $$;
do $$ begin
  perform public.set_ledger_entry_outside_statement((select id from ledger_entries where name = 'Aluguel salão'), true);
  raise exception 'FALHOU: consulta marcou fora do extrato';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (consulta não marca): %', sqlerrm; end $$;
do $$ begin
  insert into public.reconciliation_links(statement_line_id, ledger_entry_id, amount_cents) values
    ((select id from statement_lines where counterparty = 'Comunidade'), (select id from ledger_entries where name = 'Aluguel salão'), -15000);
  raise exception 'FALHOU: insert direto aceito';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok (sem insert direto): %', sqlerrm; end $$;

\echo '--- outro usuário de fora do grupo não vê nada'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
select count(*) as linhas_de_fora from statement_lines;
reset role;
\echo '--- auditoria'
select action, count(*) from audit_events where group_id = :'gid' and (action like 'reconciliation.%' or action like 'statement_line.%' or action in ('ledger_entry.outside_statement', 'ledger_entry.account_changed')) group by 1 order by 1;
\echo ok 1 - TUDO OK
rollback;
