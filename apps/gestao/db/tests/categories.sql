-- Rubricas editáveis (036) sem alterar o banco local: rode, a partir de apps/gestao,
--   cat db/tests/categories.sql \
--     | docker compose -f db/compose.yaml exec -T db psql -U postgres -d geas -v ON_ERROR_STOP=1 -q
-- (ou junto com os demais por `npm run test:db`). O arquivo abre e desfaz a própria transação e imprime TAP
-- (`1..1` ... `ok 1 - TUDO OK`), por isso também roda no pg_prove.
\set ON_ERROR_STOP 1
\echo 1..1
begin;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'tes.rubricas@escoteirosalbert.com.br'),
  ('00000000-0000-0000-0000-0000000000f2', 'consulta.rubricas@escoteirosalbert.com.br');
select public.admin_bootstrap_group('tes.rubricas@escoteirosalbert.com.br', 'Grupo Teste Rubricas') as gid \gset
update public.memberships set finance_role = 'editor' where user_id = '00000000-0000-0000-0000-0000000000f1';
insert into public.memberships(group_id, user_id, finance_role) values (:'gid', '00000000-0000-0000-0000-0000000000f2', 'viewer');
select id as pix from public.payment_methods where group_id = :'gid' and name = 'PIX' \gset
select public.fallback_account(:'gid') as acc \gset
select id as acampamento from public.categories where group_id = :'gid' and code = '2.2.2' \gset
select id as lencos from public.categories where group_id = :'gid' and code = '2.2.6' \gset
select id as admin from public.categories where group_id = :'gid' and code = '2.1' \gset
select set_config('test.gid', :'gid', true);

-- Rubricas do grupo de teste: pelo código, ou pelo nome (nomes repetidos nos dois ramos: a de despesa).
create function pg_temp.cat(p_code text) returns uuid language sql as $$
  select id from public.categories where group_id = current_setting('test.gid')::uuid and code = p_code $$;
create function pg_temp.id_of(p_name text) returns uuid language sql as $$
  select id from public.categories where group_id = current_setting('test.gid')::uuid and name = p_name
  order by kind = 'despesa' desc limit 1 $$;
create function pg_temp.code_of(p_name text) returns text language sql as $$
  select code from public.categories where id = pg_temp.id_of(p_name) $$;
-- Estado atual como a tela envia (todas as rubricas fora das raízes), com alterações por id e rubricas novas.
create function pg_temp.nodes(p_changes jsonb default '{}', p_new jsonb default '[]') returns jsonb language sql as $$
  select coalesce(jsonb_agg(n || coalesce(p_changes->(n->>'key'), '{}')), '[]') || p_new from (
    select jsonb_build_object('key', id, 'id', id, 'parent', parent_id, 'position', position, 'name', name, 'ledgerCode', ledger_code, 'active', active) as n
    from public.categories where group_id = current_setting('test.gid')::uuid and parent_id is not null
  ) t $$;
create function pg_temp.save(p_nodes jsonb, p_deleted jsonb default '[]') returns jsonb language sql as $$
  select public.save_category_tree(current_setting('test.gid')::uuid, p_nodes, p_deleted) $$;
create function pg_temp.fails(p_nodes jsonb, p_deleted jsonb, p_message text) returns void language plpgsql as $$
begin
  perform pg_temp.save(p_nodes, p_deleted);
  raise exception 'FALHOU: deveria recusar (%)', p_message;
exception when raise_exception then
  if sqlerrm not like '%' || p_message || '%' then raise; end if;
end $$;

do $$ begin
  if (select category_id from public.fee_settings where group_id = current_setting('test.gid')::uuid) is distinct from pg_temp.cat('1.1') then
    raise exception 'FALHOU: grupo novo começa com 1.1 como rubrica de mensalidade';
  end if;
  -- árvore do orçamento 2027 (028): simples transferência em .0, Lojinha vendendo itens
  if (select count(*) from public.categories where group_id = current_setting('test.gid')::uuid and transfer and code in ('1.0', '2.0')) <> 2 then
    raise exception 'FALHOU: 1.0 e 2.0 são de simples transferência';
  end if;
  if (select name from public.categories where id = pg_temp.cat('1.2')) <> 'Registros' or (select name from public.categories where id = pg_temp.cat('2.9')) <> 'Investimentos' then
    raise exception 'FALHOU: as irmãs da transferência começam em .1';
  end if;
  if not (select sells_items from public.categories where id = pg_temp.cat('1.7')) then raise exception 'FALHOU: 1.7 Lojinha vende itens'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);

select public.create_ledger_entry(:'gid', '2026-03-08', 'Lona', :'pix', null, false, -9000,
  jsonb_build_array(jsonb_build_object('category_id', :'acampamento', 'amount_cents', -9000, 'description', 'lona')), :'acc') as e1 \gset
select public.create_ledger_entry(:'gid', '2026-03-09', 'Lenços', :'pix', null, false, -5000,
  jsonb_build_array(jsonb_build_object('category_id', :'lencos', 'amount_cents', -3000, 'description', 'lenços'),
                    jsonb_build_object('category_id', :'admin', 'amount_cents', -2000, 'description', 'papel')), :'acc') as e2 \gset

\echo '--- criar (inclusive dentro de outra nova), reordenar, renomear e inativar numa gravação só'
select pg_temp.save(pg_temp.nodes(
  jsonb_build_object(
    pg_temp.id_of('Acampamento de Grupo'), jsonb_build_object('position', -1),
    pg_temp.id_of('Telefone'), jsonb_build_object('name', 'Telefone e internet', 'ledgerCode', '4.1.2.1.0010'),
    pg_temp.id_of('Lenços'), jsonb_build_object('active', false)),
  jsonb_build_array(
    jsonb_build_object('key', 'new:1', 'parent', pg_temp.cat('2.2'), 'position', 99, 'name', 'Jamboree', 'active', true),
    jsonb_build_object('key', 'new:2', 'parent', 'new:1', 'position', 0, 'name', 'Passagens', 'active', true))));
do $$ begin
  if pg_temp.code_of('Jamboree') <> '2.2.13' then raise exception 'FALHOU: nova no fim de 2.2 (%)', pg_temp.code_of('Jamboree'); end if;
  if pg_temp.code_of('Passagens') <> '2.2.13.1' then raise exception 'FALHOU: nova dentro de nova'; end if;
  if pg_temp.code_of('Acampamento de Grupo') <> '2.2.1' then raise exception 'FALHOU: acampamento sobe para 2.2.1'; end if;
  if pg_temp.code_of('Escoteiro por um dia') <> '2.2.2' then raise exception 'FALHOU: vizinha desce para 2.2.2'; end if;
  if (select ledger_code from public.categories where id = pg_temp.id_of('Telefone e internet')) <> '4.1.2.1.0010' then raise exception 'FALHOU: renomear e conta contábil'; end if;
  if (select active from public.categories where id = pg_temp.id_of('Lenços')) then raise exception 'FALHOU: inativar'; end if;
  if (select kind from public.categories where id = pg_temp.id_of('Passagens')) <> 'despesa' then raise exception 'FALHOU: tipo vem da raiz'; end if;
end $$;

\echo '--- mover para outra rubrica pai leva as de baixo e fecha o buraco'
select pg_temp.save(pg_temp.nodes(jsonb_build_object(pg_temp.id_of('Jamboree'), jsonb_build_object('parent', pg_temp.id_of('Acampamento de Grupo')))));
select pg_temp.save(pg_temp.nodes(jsonb_build_object(pg_temp.id_of('Acampamento de Grupo'), jsonb_build_object('parent', pg_temp.cat('2.1'), 'position', 99))));
do $$ begin
  if pg_temp.code_of('Acampamento de Grupo') <> '2.1.14' then raise exception 'FALHOU: vai para o fim de 2.1'; end if;
  if pg_temp.code_of('Passagens') <> '2.1.14.1.1' then raise exception 'FALHOU: as de baixo acompanham'; end if;
  if pg_temp.code_of('Escoteiro por um dia') <> '2.2.1' then raise exception 'FALHOU: irmãs antigas renumeradas'; end if;
end $$;

\echo '--- recusas: ciclo, níveis, sinal, raiz, nome, pai excluído'
select pg_temp.fails(pg_temp.nodes(jsonb_build_object(pg_temp.id_of('Acampamento de Grupo'), jsonb_build_object('parent', pg_temp.id_of('Passagens')))), '[]', 'dentro dela mesma');
select pg_temp.fails(pg_temp.nodes('{}', jsonb_build_array(jsonb_build_object('key', 'new:9', 'parent', pg_temp.id_of('Passagens'), 'position', 0, 'name', 'Fundo'))), '[]', '5 níveis');
select pg_temp.fails(pg_temp.nodes(jsonb_build_object(pg_temp.id_of('Acampamento de Grupo'), jsonb_build_object('parent', pg_temp.cat('1.6')))), '[]', 'ficou em Receitas');
select pg_temp.fails(pg_temp.nodes(), jsonb_build_array(jsonb_build_object('id', pg_temp.cat('2'), 'target', pg_temp.cat('1'))), 'raízes');
select pg_temp.fails(pg_temp.nodes(jsonb_build_object(pg_temp.id_of('Passagens'), jsonb_build_object('name', ' x '))), '[]', 'nome com 2 a 100');
select pg_temp.fails(pg_temp.nodes(), jsonb_build_array(jsonb_build_object('id', pg_temp.id_of('Jamboree'), 'target', pg_temp.cat('2.1'))), 'não encontrada');
select pg_temp.fails(
  (select jsonb_agg(n) from jsonb_array_elements(pg_temp.nodes()) n where (n->>'id')::uuid <> pg_temp.id_of('Jamboree')),
  jsonb_build_array(jsonb_build_object('id', pg_temp.id_of('Jamboree'), 'target', pg_temp.cat('2.1'))), 'rubrica pai inválida ou excluída');
select pg_temp.fails(pg_temp.nodes(jsonb_build_object(pg_temp.cat('2.0'), jsonb_build_object('parent', pg_temp.cat('2.1')))), '[]', 'direto abaixo de 1 Receitas ou 2 Despesas');
-- rubrica sem rateios pode trocar de ramo (o tipo segue a nova raiz)
select pg_temp.save(pg_temp.nodes(jsonb_build_object(pg_temp.id_of('Fórum de Jovens'), jsonb_build_object('parent', pg_temp.cat('1')))));
do $$ begin
  if (select kind from public.categories where id = pg_temp.id_of('Fórum de Jovens')) <> 'receita' then raise exception 'FALHOU: tipo segue a nova raiz'; end if;
end $$;

\echo '--- excluir: rateios vão para o destino (rubrica pai), com histórico no lançamento'
select pg_temp.save(
  (select jsonb_agg(n) from jsonb_array_elements(pg_temp.nodes()) n
   where (n->>'id')::uuid not in (pg_temp.id_of('Acampamento de Grupo'), pg_temp.id_of('Jamboree'), pg_temp.id_of('Passagens'))),
  jsonb_build_array(
    jsonb_build_object('id', pg_temp.id_of('Acampamento de Grupo'), 'target', pg_temp.cat('2.1')),
    jsonb_build_object('id', pg_temp.id_of('Jamboree'), 'target', pg_temp.cat('2.1')),
    jsonb_build_object('id', pg_temp.id_of('Passagens'), 'target', pg_temp.cat('2.1')))) as result \gset
\echo :result
select (select category_id from public.entry_splits where entry_id = :'e1') = :'admin'::uuid as is_true \gset
\if :is_true
\else
  \echo 'FALHOU: rateio da lona deveria estar em 2.1'
  select 1/0;
\endif
select count(*) = 1 as is_true from public.ledger_entry_history(:'e1') where action = 'ledger_entry.category_merged' \gset
\if :is_true
\else
  \echo 'FALHOU: histórico do lançamento mostra a troca de rubrica'
  select 1/0;
\endif

\echo '--- excluir a rubrica de mensalidade limpa a configuração e renumera; consulta não grava'
select pg_temp.save(
  (select jsonb_agg(n) from jsonb_array_elements(pg_temp.nodes()) n where (n->>'id')::uuid <> pg_temp.cat('1.1')),
  jsonb_build_array(jsonb_build_object('id', pg_temp.cat('1.1'), 'target', pg_temp.cat('1'))));
do $$ begin
  if exists (select 1 from public.fee_settings where category_id is not null and group_id = current_setting('test.gid')::uuid) then
    raise exception 'FALHOU: mensalidade sem configuração';
  end if;
  if (select name from public.categories where id = pg_temp.cat('1.1')) <> 'Registros' then raise exception 'FALHOU: 1.2 vira 1.1'; end if;
  if (select name from public.categories where id = pg_temp.cat('1.0')) <> 'Simples transferência' then raise exception 'FALHOU: transferência continua 1.0'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select pg_temp.fails(pg_temp.nodes(), '[]', 'Sem permissão');
reset role;
\echo ok 1 - TUDO OK
rollback;
