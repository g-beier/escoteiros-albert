-- Devedores (038) sem alterar o banco local: rode, a partir de apps/financeiro,
--   cat supabase/tests/debts.sql \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no `supabase test db` (pg_prove).
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'tes.devedores@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000d2', 'consulta.devedores@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000d3', 'intruso.devedores@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.devedores@escoteirosalbert.com.br', 'Grupo Teste Devedores') as gid \gset
select public.admin_bootstrap_group('intruso.devedores@escoteirosalbert.com.br', 'Grupo Intruso Devedores') as gid_b \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into public.memberships(group_id, user_id, role) values (:'gid', '00000000-0000-0000-0000-0000000000d2', 'viewer');
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select id as cat_rec from public.categories where group_id = :'gid' and code = '1.2' \gset
select id as cat_desp from public.categories where group_id = :'gid' and code = '2.1' \gset
select public.fallback_account(:'gid') as acc \gset
insert into public.associates(group_id, name, branch) values (:'gid', 'Ana', 'lobinho') returning id as ana \gset
insert into public.associates(group_id, name, branch) values (:'gid', 'Bia', 'escoteiro') returning id as bia \gset

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

\echo '--- lançamentos: Ana 30 e 20 (com Bia 20); um grande da Ana (240); uma despesa com a Ana'
select public.create_ledger_entry(:'gid', '2026-04-10', 'Ana', :'pix', null, false, 3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_rec', 'amount_cents', 3000, 'description', 'acampamento', 'associate_id', :'ana')), :'acc') as e1 \gset
select public.create_ledger_entry(:'gid', '2026-05-10', 'Ana e Bia', :'pix', null, false, 4000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_rec', 'amount_cents', 2000, 'description', 'acampamento', 'associate_id', :'ana'),
                    jsonb_build_object('category_id', :'cat_rec', 'amount_cents', 2000, 'description', 'lojinha', 'associate_id', :'bia')), :'acc') as e2 \gset
select public.create_ledger_entry(:'gid', '2026-05-11', 'Reembolso', :'pix', null, false, -1000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_desp', 'amount_cents', -1000, 'description', 'reembolso', 'associate_id', :'ana')), :'acc') as e3 \gset
select public.create_ledger_entry(:'gid', '2026-05-12', 'Ana grande', :'pix', null, false, 24000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_rec', 'amount_cents', 24000, 'description', 'lanche e acampamento', 'associate_id', :'ana')), :'acc') as e4 \gset
select set_config('test.gid', :'gid', true);
select set_config('test.e4', :'e4', true);

\echo '--- anotar e pagar em parcelas, com o valor de cada lançamento'
select public.save_debt(:'gid', null, :'ana', '2026-03-01', 5000, 'Acampamento de março', '2x de R$ 25', '[]') as d1 \gset
select public.save_debt(:'gid', :'d1', :'ana', '2026-03-01', 5000, 'Acampamento de março', '2x de R$ 25', jsonb_build_array(jsonb_build_object('entryId', :'e1', 'amountCents', 3000)));
do $$ declare r record; begin
  select * into r from public.debt_rows(current_setting('test.gid')::uuid);
  if r.paid_cents <> 3000 or r.associate_name <> 'Ana' or jsonb_array_length(r.payments) <> 1 or r.payment_mismatch then raise exception 'FALHOU: parcela 1 (%)', row_to_json(r); end if;
end $$;
select public.save_debt(:'gid', :'d1', :'ana', '2026-03-01', 5000, 'Acampamento de março', null,
  jsonb_build_array(jsonb_build_object('entryId', :'e1', 'amountCents', 3000), jsonb_build_object('entryId', :'e2', 'amountCents', 2000)));
do $$ declare r record; begin
  select * into r from public.debt_rows(current_setting('test.gid')::uuid);
  if r.paid_cents <> 5000 or r.agreement is not null then raise exception 'FALHOU: quitada (%)', row_to_json(r); end if;
end $$;

\echo '--- editar o lançamento (recria os rateios) mantém o pagamento'
select public.update_ledger_entry(:'e1', '2026-04-10', 'Ana', :'pix', null, true, 3000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_rec', 'amount_cents', 3000, 'description', 'acampamento (pix)', 'associate_id', :'ana')), :'acc', null);
do $$ begin
  if (select paid_cents from public.debt_rows(current_setting('test.gid')::uuid)) <> 5000 then raise exception 'FALHOU: pagamento perdido ao editar o lançamento'; end if;
end $$;

\echo '--- um lançamento (240) paga duas dívidas (10 + 230) pelo devedor'
select public.save_debt(:'gid', null, :'ana', '2026-04-01', 1000, 'Lanche', null, '[]') as d3 \gset
select public.save_debt(:'gid', null, :'ana', '2026-04-02', 23000, 'Acampamento de abril', null, '[]') as d4 \gset
select public.pay_debts(:'gid', :'ana', :'e4', jsonb_build_array(jsonb_build_object('debtId', :'d3', 'amountCents', 1000), jsonb_build_object('debtId', :'d4', 'amountCents', 23000)));
do $$ begin
  if (select string_agg(paid_cents::text || '/' || amount_cents, ',' order by debt_date) from public.debt_rows(current_setting('test.gid')::uuid)) <> '5000/5000,1000/1000,23000/23000' then
    raise exception 'FALHOU: dois pagamentos de um lançamento';
  end if;
  if (select (payments->0->>'entryUnallocatedCents')::int from public.debt_rows(current_setting('test.gid')::uuid) where description = 'Lanche') <> 0 then
    raise exception 'FALHOU: sobra do lançamento';
  end if;
end $$;

\echo '--- validações'
do $$ declare gid uuid := current_setting('test.gid')::uuid;
  ana uuid := (select id from public.associates where name = 'Ana' and group_id = gid);
  bia uuid := (select id from public.associates where name = 'Bia' and group_id = gid);
  e1 uuid := (select id from public.ledger_entries where group_id = gid and name = 'Ana');
  e3 uuid := (select id from public.ledger_entries where group_id = gid and name = 'Reembolso');
  e4 uuid := current_setting('test.e4')::uuid;
  d1 uuid := (select id from public.debts where description = 'Acampamento de março');
  d3 uuid := (select id from public.debts where description = 'Lanche');
  d4 uuid := (select id from public.debts where description = 'Acampamento de abril');
  pay jsonb;
begin
  begin perform public.save_debt(gid, null, ana, '2026-03-01', 0, 'Zero', null, '[]'); raise exception 'FALHOU: valor zero';
  exception when raise_exception then if sqlerrm not like 'Informe um valor%' then raise; end if; end;
  begin perform public.save_debt(gid, null, ana, '2026-03-01', 100, 'x', null, '[]'); raise exception 'FALHOU: descrição curta';
  exception when raise_exception then if sqlerrm not like 'Descrição%' then raise; end if; end;
  begin perform public.save_debt(gid, null, bia, '2026-03-01', 100, 'Da Bia', null, jsonb_build_array(jsonb_build_object('entryId', e1, 'amountCents', 100))); raise exception 'FALHOU: lançamento de outro associado';
  exception when raise_exception then if sqlerrm not like 'Pagamento inválido%' then raise; end if; end;
  begin perform public.save_debt(gid, null, ana, '2026-03-01', 100, 'Despesa', null, jsonb_build_array(jsonb_build_object('entryId', e3, 'amountCents', 100))); raise exception 'FALHOU: despesa como pagamento';
  exception when raise_exception then if sqlerrm not like 'Pagamento inválido%' then raise; end if; end;
  begin perform public.save_debt(gid, null, ana, '2026-03-01', 100, 'Sem valor', null, jsonb_build_array(jsonb_build_object('entryId', e1, 'amountCents', 0))); raise exception 'FALHOU: pagamento zero';
  exception when raise_exception then if sqlerrm not like 'Informe o valor de cada pagamento%' then raise; end if; end;
  begin perform public.save_debt(gid, null, ana, '2026-03-01', 100, 'Outra', null, jsonb_build_array(jsonb_build_object('entryId', e4, 'amountCents', 50))); raise exception 'FALHOU: passou da receita do lançamento';
  exception when raise_exception then if sqlerrm not like 'O lançamento Ana grande de 12/05/2026 tem R$ 240,00 do associado e já foram usados R$ 240,50%' then raise; end if; end;
  begin perform public.pay_debts(gid, ana, e4, jsonb_build_array(jsonb_build_object('debtId', d3, 'amountCents', 2000), jsonb_build_object('debtId', d4, 'amountCents', 22000))); raise exception 'FALHOU: passou do valor da dívida';
  exception when raise_exception then if sqlerrm not like 'Os pagamentos de "Lanche" (R$ 20,00) passam do valor da dívida (R$ 10,00)%' then raise; end if; end;
  select jsonb_agg(jsonb_build_object('entryId', p.entry_id, 'amountCents', p.amount_cents)) into pay from public.debt_payments p where p.debt_id = d1;
  begin perform public.save_debt(gid, d1, ana, '2026-03-01', 4000, 'Acampamento de março', null, pay); raise exception 'FALHOU: valor abaixo do pago';
  exception when raise_exception then if sqlerrm not like 'Os pagamentos de "Acampamento de março" (R$ 50,00) passam do valor da dívida (R$ 40,00)%' then raise; end if; end;
end $$;

\echo '--- lançamento editado com menos receita: vale o que cabe (mais antiga primeiro) e a tesouraria é avisada'
select public.update_ledger_entry(:'e4', '2026-05-12', 'Ana grande', :'pix', null, false, 20000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_rec', 'amount_cents', 20000, 'description', 'lanche e acampamento', 'associate_id', :'ana')), :'acc', null);
do $$ begin
  if (select string_agg(paid_cents::text || ':' || payment_mismatch, ',' order by debt_date) from public.debt_rows(current_setting('test.gid')::uuid)) <> '5000:false,1000:false,19000:true' then
    raise exception 'FALHOU: pago limitado ao lançamento editado';
  end if;
end $$;
-- o mesmo lançamento pode pagar a dívida da Bia (outro associado)
select public.save_debt(:'gid', null, :'bia', '2026-02-01', 2500, 'Lojinha', null, jsonb_build_array(jsonb_build_object('entryId', :'e2', 'amountCents', 2000))) as d2 \gset

\echo '--- consulta: vê dívidas e valores, sem associado nem lançamentos; não lê as tabelas; não grava'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
do $$ declare r record; begin
  if (select count(*) from public.debt_rows(current_setting('test.gid')::uuid)) <> 4 then raise exception 'FALHOU: consulta deveria ver as dívidas'; end if;
  if exists (select 1 from public.debt_rows(current_setting('test.gid')::uuid) where associate_id is not null or associate_name is not null or payments is not null or payment_mismatch is not null) then
    raise exception 'FALHOU: consulta viu o associado';
  end if;
  if (select sum(paid_cents) from public.debt_rows(current_setting('test.gid')::uuid)) <> 27000 then raise exception 'FALHOU: consulta vê o pago'; end if;
  if (select string_agg(debtor_number::text, ',' order by debt_date) from public.debt_rows(current_setting('test.gid')::uuid)) <> '1,2,2,2' then
    raise exception 'FALHOU: consulta agrupa por devedor anônimo (Bia, com a dívida mais antiga, = 1)';
  end if;
  if exists (select 1 from public.debts) or exists (select 1 from public.debt_payments) then raise exception 'FALHOU: consulta leu as tabelas'; end if;
  perform public.save_debt(current_setting('test.gid')::uuid, null, (select id from public.associates where name = 'Ana' limit 1), '2026-03-01', 100, 'Consulta', null, '[]');
  raise exception 'FALHOU: consulta gravou';
exception when raise_exception then if sqlerrm not like 'Sem permissão%' then raise; end if;
end $$;
do $$ begin
  perform public.pay_debts(current_setting('test.gid')::uuid, (select id from public.associates where name = 'Ana' limit 1), current_setting('test.e4')::uuid, '[]');
  raise exception 'FALHOU: consulta registrou pagamento';
exception when raise_exception then if sqlerrm not like 'Sem permissão%' then raise; end if;
end $$;

\echo '--- outro grupo não vê nem apaga'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.debt_rows(current_setting('test.gid')::uuid)) or exists (select 1 from public.debts) then raise exception 'FALHOU: intruso viu'; end if;
end $$;
do $$ begin
  perform public.delete_debt((select d.id from public.debt_payments p join public.debts d on d.id = p.debt_id limit 1));
  raise exception 'FALHOU: intruso apagou';
exception when raise_exception then if sqlerrm not like 'Dívida não encontrada%' then raise; end if;
end $$;

\echo '--- excluir: o lançamento some do pagamento; a dívida apaga com auditoria'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select public.delete_ledger_entry(:'e2');
do $$ begin
  if (select string_agg(paid_cents::text, ',' order by debt_date) from public.debt_rows(current_setting('test.gid')::uuid)) <> '0,3000,1000,19000' then raise exception 'FALHOU: pagamento após excluir o lançamento'; end if;
end $$;
select public.delete_debt(:'d2');
do $$ begin
  if (select count(*) from public.debt_rows(current_setting('test.gid')::uuid)) <> 3 then raise exception 'FALHOU: dívida não apagou'; end if;
end $$;
reset role;
do $$ begin
  if (select string_agg(action, ',' order by action) from public.audit_events where entity_type in ('debt', 'debt_payment') and group_id = current_setting('test.gid')::uuid)
    <> 'debt.created,debt.created,debt.created,debt.created,debt.deleted,debt.paid,debt.updated,debt.updated' then raise exception 'FALHOU: auditoria das dívidas'; end if;
end $$;
\echo ok 1 - TUDO OK
rollback;
