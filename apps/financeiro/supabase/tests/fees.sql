-- Mensalidades (018) sem alterar o banco local: rode, a partir de apps/financeiro,
--   cat supabase/tests/fees.sql \
--     | docker exec -i supabase_db_geas-financeiro psql -U postgres -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no `supabase test db` (pg_prove).
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'tes.mensal@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000e2', 'consulta.mensal@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.mensal@escoteirosalbert.com.br', 'Grupo Teste Mensalidades') as gid \gset
update public.memberships set role = 'treasurer' where user_id = '00000000-0000-0000-0000-0000000000e1';
insert into public.memberships(group_id, user_id, role) values (:'gid', '00000000-0000-0000-0000-0000000000e2', 'viewer');
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select id as cat_mens from public.categories where group_id = :'gid' and code = '1.1' \gset
select id as cat_outra from public.categories where group_id = :'gid' and code = '1.2' \gset
select public.fallback_account(:'gid') as acc \gset
insert into public.associates(group_id, name, branch) values (:'gid', 'Ana', 'lobinho') returning id as ana \gset
insert into public.associates(group_id, name, branch) values (:'gid', 'Bia', 'escoteiro') returning id as bia \gset

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

\echo '--- rateios: mensalidade da Ana (3 meses de uma vez) e uma doação (outra rubrica)'
select public.create_ledger_entry(:'gid', '2026-03-08', 'Ana', :'pix', null, false, 9000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_mens', 'amount_cents', 9000, 'description', 'mar-mai', 'associate_id', :'ana')), :'acc') as e1 \gset
select public.create_ledger_entry(:'gid', '2026-03-09', 'Bia', :'pix', null, false, 5000,
  jsonb_build_array(jsonb_build_object('category_id', :'cat_outra', 'amount_cents', 5000, 'description', 'lojinha', 'associate_id', :'bia')), :'acc') as e2 \gset
select split_id as s_ana from public.fee_split_candidates where associate_id = :'ana' \gset
do $$ begin
  if (select count(*) from public.fee_split_candidates) <> 1 then raise exception 'FALHOU: só o rateio de mensalidade é candidato'; end if;
end $$;

\echo '--- confirmar sugestão em março e vincular o mesmo rateio a abril e maio'
select public.confirm_fee_suggestions(jsonb_build_array(jsonb_build_object('associateId', :'ana', 'year', 2026, 'month', 3, 'splitId', :'s_ana')));
select public.set_fee_record(:'ana', 2026, 4, 'pago', null, array[:'s_ana']::uuid[]);
select public.set_fee_record(:'ana', 2026, 5, 'pago', null, array[:'s_ana']::uuid[]);
select public.set_fee_record(:'bia', 2026, 3, 'atencao', 'pagou metade', '{}');
do $$ begin
  if (select linked_periods from public.fee_split_candidates where associate_id = (select id from public.associates where name = 'Ana')) <> '{202603,202604,202605}' then
    raise exception 'FALHOU: vínculos %', (select linked_periods from public.fee_split_candidates limit 1);
  end if;
  if (select note from public.fee_records r join public.associates a on a.id = r.associate_id where a.name = 'Bia') <> 'pagou metade' then raise exception 'FALHOU: nota'; end if;
end $$;

\echo '--- mês isento é gravado como estado próprio'
select public.set_fee_record(:'bia', 2026, 6, 'isento', 'bolsa no mês', '{}');
do $$ begin
  if (select status::text from public.fee_records r join public.associates a on a.id = r.associate_id where a.name = 'Bia' and r.month = 6) <> 'isento' then
    raise exception 'FALHOU: mês isento';
  end if;
end $$;
select public.set_fee_record(:'bia', 2026, 6, null, null, '{}');

\echo '--- rateio de outra rubrica ou de outro associado é recusado'
do $$ begin
  perform public.set_fee_record((select id from public.associates where name = 'Bia'), 2026, 4, 'pago', null,
    array(select id from public.entry_splits where description = 'lojinha'));
  raise exception 'FALHOU: rateio de outra rubrica aceito';
exception when raise_exception then if sqlerrm not like 'Rateio inválido%' then raise; end if;
end $$;

\echo '--- limpar, isentar e configurar'
select public.set_fee_record(:'bia', 2026, 3, null, null, null);
select public.set_fee_exemption(:'bia', 2026, 'Voluntária');
select public.set_fee_settings(:'gid', 'dia_util', 5, null);
do $$ begin
  if exists (select 1 from public.fee_records r join public.associates a on a.id = r.associate_id where a.name = 'Bia') then raise exception 'FALHOU: limpar'; end if;
  if (select reason from public.fee_exemptions) <> 'Voluntária' then raise exception 'FALHOU: isenção'; end if;
  if (select due_rule::text || due_day from public.fee_settings) <> 'dia_util5' then raise exception 'FALHOU: configurações'; end if;
end $$;
do $$ begin
  perform public.set_fee_settings((select group_id from public.fee_settings limit 1), 'dia_fixo', 31, null);
  raise exception 'FALHOU: dia 31 aceito';
exception when raise_exception then if sqlerrm not like 'Dia do vencimento%' then raise; end if;
end $$;

\echo '--- valor do ano e sugestão de atenção com nota'
select public.set_fee_year_settings(:'gid', 2026, 6000, 10, '2026-03-31');
do $$ begin
  perform public.set_fee_year_settings((select group_id from public.fee_settings limit 1), 2026, 6000, 10, null);
  raise exception 'FALHOU: desconto sem data aceito';
exception when raise_exception then if sqlerrm not like 'Informe a data-limite%' then raise; end if;
end $$;
select public.confirm_fee_suggestions(jsonb_build_array(jsonb_build_object('associateId', :'ana', 'year', 2026, 'month', 6, 'splitId', :'s_ana', 'status', 'atencao', 'note', 'pagou R$ 30,00 de R$ 60,00')));
do $$ begin
  if (select status::text || ':' || note from public.fee_records r join public.associates a on a.id = r.associate_id where a.name = 'Ana' and r.month = 6)
    <> 'atencao:pagou R$ 30,00 de R$ 60,00' then raise exception 'FALHOU: sugestão com atenção'; end if;
  if (select monthly_cents::text || '/' || annual_discount_pct from public.fee_year_settings) <> '6000/10.00' then raise exception 'FALHOU: valor do ano'; end if;
end $$;

\echo '--- valor individual'
select public.set_fee_associate_price(:'bia', 2026, 4000, 'Irmãos');
do $$ begin
  if (select monthly_cents::text || ':' || reason from public.fee_associate_prices) <> '4000:Irmãos' then raise exception 'FALHOU: valor individual'; end if;
  perform public.set_fee_associate_price((select id from public.associates where name = 'Bia'), 2026, 3000, '');
  raise exception 'FALHOU: valor sem motivo aceito';
exception when raise_exception then if sqlerrm not like 'Informe o motivo%' then raise; end if;
end $$;
select public.set_fee_associate_price(:'bia', 2026, null, null);
do $$ begin if exists (select 1 from public.fee_associate_prices) then raise exception 'FALHOU: remover valor individual'; end if; end $$;

\echo '--- movimentações: saída e retorno'
select public.add_associate_movement(:'bia', '2026-06-15', 'saida', 'Evasão') as mov \gset
select public.add_associate_movement(:'bia', '2026-09-01', 'entrada', 'Retorno');
select public.delete_associate_movement(:'mov');
do $$ begin
  if (select string_agg(kind::text || ':' || coalesce(reason, ''), ',') from public.associate_movements) <> 'entrada:Retorno' then raise exception 'FALHOU: movimentações'; end if;
end $$;

\echo '--- excluir o lançamento desfaz o vínculo, o registro fica'
select public.delete_ledger_entry(:'e1');
do $$ begin
  if (select count(*) from public.fee_records r join public.associates a on a.id = r.associate_id where a.name = 'Ana') <> 4 then raise exception 'FALHOU: registros sumiram'; end if;
  if exists (select 1 from public.fee_record_splits) then raise exception 'FALHOU: vínculo ficou'; end if;
end $$;

\echo '--- consulta lê, não grava'
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.fee_records) <> 4 then raise exception 'FALHOU: consulta deveria ler'; end if;
  perform public.set_fee_exemption((select id from public.associates where name = 'Ana'), 2026, 'x x');
  raise exception 'FALHOU: consulta gravou';
exception when raise_exception then if sqlerrm not like '%sem permissão%' then raise; end if;
end $$;
reset role;
\echo ok 1 - TUDO OK
rollback;
