-- pgTAP: importação de lancamentos.csv (013, import_batch → import_ledger_entries). Rode com `npm run test:db`.
begin;
select plan(10);
\ir _fixture.psql

select tests.login('00000000-0000-0000-0000-00000000f0a1') \gset
select id as cat_d from public.categories where group_id = :'gid_a' and kind = 'despesa' and active order by code limit 1 \gset
select count(*)::int as before_entries from public.ledger_entries where group_id = :'gid_a' \gset

select is(public.import_batch(:'gid_a', jsonb_build_array(jsonb_build_object('kind', 'lancamentos', 'rows', jsonb_build_array(
  jsonb_build_object('line', 2, 'date', '2026-03-10', 'name', 'Mensalidade março', 'account', 'Mercado Pago', 'payment_method', 'PIX',
    'filed', false, 'total_cents', 3000,
    'splits', jsonb_build_array(jsonb_build_object('category_id', :'cat_a', 'amount_cents', 3000, 'description', 'Mensalidade', 'associate', 'Associado RLS A'))),
  jsonb_build_object('line', 3, 'date', '2026-03-12', 'name', 'Feira', 'account', 'Caixa Feira', 'payment_method', 'Maquininha', 'document', 'NF 1',
    'filed', true, 'total_cents', -5250, 'notes', 'Associado na planilha: Fulano',
    'splits', jsonb_build_array(
      jsonb_build_object('category_id', :'cat_d', 'amount_cents', -4000, 'description', 'Legumes'),
      jsonb_build_object('category_id', :'cat_d', 'amount_cents', -1250, 'description', 'Copos'))))))) -> 'lancamentos',
  '{"lançamentos": 2, "contas": 2, "formas": 1}'::jsonb, 'cria 2 lançamentos, 2 contas e 1 forma');

select is((select count(*)::int from public.ledger_entries where group_id = :'gid_a'), :before_entries + 2, 'lançamentos gravados');
select is((select a.name from public.ledger_entries e join public.accounts a on a.id = e.account_id where e.name = 'Feira'), 'Caixa Feira', 'na conta criada');
select is((select count(*)::int from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id where e.name = 'Feira'), 2, 'dois rateios no mesmo lançamento');
select is((select document_filed from public.ledger_entries where name = 'Feira'), true, 'pasta');
select is((select s.associate_id from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id where e.name = 'Mensalidade março'), :'assoc_a'::uuid, 'associado pelo nome');
select is((select count(*)::int from public.ledger_entry_history((select id from public.ledger_entries where name = 'Feira')) where action = 'ledger_entry.created'), 1, 'auditado como lançamento');

-- Linha inválida: a transação inteira é desfeita, com a linha na mensagem.
select throws_like(format($$select public.import_batch(%L, jsonb_build_array(jsonb_build_object('kind', 'lancamentos', 'rows', jsonb_build_array(
  jsonb_build_object('line', 9, 'date', '2026-03-10', 'name', 'Errado', 'account', 'Mercado Pago', 'payment_method', 'PIX', 'total_cents', 100,
    'splits', jsonb_build_array(jsonb_build_object('category_id', %L, 'amount_cents', 100, 'description', 'x')))))))$$, :'gid_a', :'cat_d'),
  'lancamentos.csv, linha 9:%', 'erro aponta a linha');

select tests.login('00000000-0000-0000-0000-00000000f0a2') \gset
select throws_like(format($$select public.import_batch(%L, jsonb_build_array(jsonb_build_object('kind', 'lancamentos', 'rows', jsonb_build_array(jsonb_build_object('line', 2)))))$$, :'gid_a'),
  '%administrador do Financeiro%', 'editor não importa lançamentos');
select tests.login('00000000-0000-0000-0000-00000000f0a3') \gset
select throws_like(format($$select public.import_ledger_entries(%L, '[]'::jsonb)$$, :'gid_a'), '%permission denied%', 'função interna não é chamada direto');

select * from finish();
rollback;
