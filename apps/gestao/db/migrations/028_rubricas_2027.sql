-- Rubricas da Previsão orçamentária 2027.
--
-- * `categories.transfer`: rubrica de "Simples transferência", filha direta de uma raiz, no máximo uma por raiz. Ela
--   fica sempre em primeiro e leva o código `.0` (1.0, 2.0); as irmãs continuam em 1.1, 1.2… como no orçamento.
-- * `seed_categories` (grupo novo) passa a criar a árvore do orçamento 2027, com 1.7 Lojinha já marcada "venda de
--   itens". Grupos existentes não mudam (sem produção: `npm run infra:reset` recria o local).

alter table public.categories add column transfer boolean not null default false;

create unique index categories_one_transfer_per_parent on public.categories (parent_id) where transfer;

/** A rubrica de simples transferência é filha direta de 1 Receitas ou 2 Despesas. */
create function public.categories_transfer_guard() returns trigger
  language plpgsql set search_path to '' as $$
begin
  if new.transfer and not exists (
    select 1 from public.categories p where p.id = new.parent_id and p.parent_id is null and p.code is not null
  ) then
    raise exception 'A rubrica % (simples transferência) fica direto abaixo de 1 Receitas ou 2 Despesas', new.name;
  end if;
  return new;
end;
$$;

create trigger categories_transfer_guard before insert or update of transfer, parent_id on public.categories
  for each row execute function public.categories_transfer_guard();

create or replace function public.category_snapshot(p_category_id uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('code', c.code, 'name', c.name, 'ledger_code', c.ledger_code, 'active', c.active, 'parent_id', c.parent_id,
    'sells_items', c.sells_items, 'transfer', c.transfer)
  from public.categories c where c.id = p_category_id;
$$;

-- A de transferência vem primeiro e é `.0`; sem ela, a numeração começa em `.1` como antes.
create or replace function public.renumber_categories(p_group_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
begin
  with recursive ranked as (
    select id, parent_id,
      row_number() over (partition by parent_id order by transfer desc, position, public.category_code_key(code) nulls last, lower(name), id) as n,
      bool_or(transfer) over (partition by parent_id) as has_transfer
    from public.categories where group_id = p_group_id and parent_id is not null
  ), tree as (
    select c.id, c.code as new_code, c.position as new_position, c.kind as new_kind
    from public.categories c where c.group_id = p_group_id and c.parent_id is null and c.code is not null
    union all
    select r.id, tree.new_code || '.' || (r.n - case when r.has_transfer then 1 else 0 end), (r.n - 1)::int, tree.new_kind
    from ranked r join tree on tree.id = r.parent_id
  )
  update public.categories c set code = t.new_code, position = t.new_position, kind = t.new_kind
  from tree t
  where t.id = c.id and (c.code, c.position, c.kind) is distinct from (t.new_code, t.new_position, t.new_kind);
end;
$$;

create or replace function public.seed_categories(p_group_id uuid) returns void
  language plpgsql security definer set search_path to '' as $_$
declare item record;
begin
  if exists (select 1 from public.categories where group_id = p_group_id and code is not null) then return; end if;
  for item in
    select code, name from (values
      ('1', 'Receitas'),
      ('1.0', 'Simples transferência'),
      ('1.1', 'Mensalidades'), ('1.2', 'Registros'), ('1.3', 'Pastelada'), ('1.4', 'Bufê de Sopas'),
      ('1.5', 'Campanhas financeiras'),
      ('1.6', 'Programa'),
      ('1.6.1', 'Acampamento de Grupo'), ('1.6.2', 'Acantonamento de Grupo'), ('1.6.3', 'Atividades da alcateia'),
      ('1.6.4', 'Atividades da tropa escoteira'), ('1.6.5', 'Atividades da tropa sênior'), ('1.6.6', 'Atividades do clã pioneiro'),
      ('1.7', 'Lojinha'),
      ('1.7.1', 'Roupas'), ('1.7.2', 'Adesivo'), ('1.7.3', 'Brechó'), ('1.7.4', 'Lenços'), ('1.7.5', 'Material escoteiro'),
      ('1.8', 'Doações'), ('1.9', 'Investimentos'),
      ('2', 'Despesas'),
      ('2.0', 'Simples transferência'),
      ('2.1', 'Despesas administrativas'),
      ('2.1.1', 'Cartório'), ('2.1.2', 'Contabilidade'), ('2.1.3', 'Taxas bancárias'), ('2.1.4', 'Tributos'),
      ('2.1.5', 'Registros'), ('2.1.6', 'Telefone'), ('2.1.7', 'Redes sociais'), ('2.1.8', 'Domínio e hospedagem'),
      ('2.1.9', 'Material de limpeza'), ('2.1.10', 'Material de escritório'), ('2.1.11', 'Camisetas'),
      ('2.1.12', 'Impressões / papelaria'), ('2.1.13', 'Taxas diversas'),
      ('2.2', 'Programa'),
      ('2.2.1', 'Escoteiro por um dia'), ('2.2.2', 'Acampamento de Grupo'), ('2.2.3', 'Acantonamento de Grupo'), ('2.2.4', 'Fórum de Jovens'),
      ('2.2.5', 'Confraternização de encerramento'), ('2.2.6', 'Lenços'), ('2.2.7', 'Atividades Estratégicas Nacionais'),
      ('2.2.8', 'Loja Escoteira'), ('2.2.9', 'Atividades da alcateia'), ('2.2.10', 'Atividades da tropa escoteira'),
      ('2.2.11', 'Atividades da tropa sênior'), ('2.2.12', 'Atividades do clã pioneiro'),
      ('2.3', 'Gestão de Adultos'),
      ('2.3.1', 'Cursos e capacitações'), ('2.3.2', 'Atividades de adultos'),
      ('2.4', 'Infraestrutura'),
      ('2.4.1', 'Manutenção'), ('2.4.2', 'Imobilizado'), ('2.4.3', 'Biblioteca'),
      ('2.5', 'Pastelada'),
      ('2.5.1', 'Salão'), ('2.5.2', 'Ingredientes'), ('2.5.3', 'Bebidas'), ('2.5.4', 'Descartáveis'), ('2.5.5', 'Divulgação'),
      ('2.6', 'Bufê de Sopas'),
      ('2.6.1', 'Salão, decoração e limpeza'), ('2.6.2', 'Ingredientes'), ('2.6.3', 'Bebidas'), ('2.6.4', 'Descartáveis'),
      ('2.6.5', 'Divulgação e convites'),
      ('2.7', 'Eventos CML'),
      ('2.7.1', 'Almoço da Confirmação'), ('2.7.2', 'Feijoada'), ('2.7.3', 'Chá da OASE'), ('2.7.4', 'Almoço Campeiro'),
      ('2.7.5', 'Martin Lutherfest'),
      ('2.8', 'Campanhas Financeiras'), ('2.9', 'Investimentos')
    ) as t(code, name)
    order by public.category_code_key(code)
  loop
    insert into public.categories(group_id, code, name, kind, position, parent_id, transfer, sells_items)
    values (p_group_id, item.code, item.name,
      case left(item.code, 1) when '1' then 'receita'::public.category_kind else 'despesa'::public.category_kind end,
      (public.category_code_key(item.code))[array_length(public.category_code_key(item.code), 1)],
      (select id from public.categories where group_id = p_group_id and code = regexp_replace(item.code, '\.[0-9]+$', '') and item.code like '%.%'),
      item.code in ('1.0', '2.0'),
      item.code = '1.7');
  end loop;
  -- posições começam em 0 como nas rubricas criadas depois; os códigos não mudam
  perform public.renumber_categories(p_group_id);
  -- rubrica de mensalidade inicial (fee_category_ids usa só a configurada)
  insert into public.fee_settings(group_id, category_id)
  select p_group_id, id from public.categories where group_id = p_group_id and code = '1.1'
  on conflict (group_id) do nothing;
end;
$_$;
