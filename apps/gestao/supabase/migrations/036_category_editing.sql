-- Rubricas editáveis: a árvore passa a ser rubrica pai + posição entre as irmãs, e o código é derivado.
--
-- Antes (008) o código era digitado e definia pai e tipo, por isso não podia mudar. Agora:
--   * parent_id e position são a verdade; code, kind e position são recalculados por renumber_categories
--     depois de cada mudança na árvore (1, 2 fixos; filhas numeradas 1, 2, 3… na ordem das posições).
--   * Os lançamentos apontam para o id (uuid), então renumerar não mexe em rateio nenhum.
--   * A tela edita a árvore como rascunho (arrastar, renomear, criar, inativar, excluir) e grava tudo de uma vez
--     por save_category_tree. Excluir leva os rateios para a rubrica pai mais próxima que fica (ou outra
--     escolhida); cada lançamento afetado ganha um evento no histórico.
-- As raízes 1 Receitas e 2 Despesas não mudam (a importação cria lançamentos nelas pelo código).
-- Rubricas antigas sem código (anteriores a 008) ficam fora da árvore até serem movidas para dentro dela.

drop trigger categories_derive_tree on public.categories;
drop function public.derive_category_tree();

alter table public.categories add column position integer not null default 0;

-- Renumerar troca códigos entre irmãs num só update: a unicidade precisa ser conferida no fim do comando.
-- (Restrição comum aceita vários nulos, como o índice parcial que ela substitui.)
drop index public.categories_group_code_idx;
alter table public.categories add constraint categories_group_code_key unique (group_id, code) deferrable initially immediate;

-- Código natural como vetor de números (2.2.10 depois de 2.2.9); nulo para rubricas sem código.
create function public.category_code_key(p_code text)
returns int[] language sql immutable set search_path = '' as $$
  select case when p_code is null then null else string_to_array(p_code, '.')::int[] end;
$$;

-- Posição inicial: o último número do código de hoje (mantém a ordem; buracos somem na renumeração).
update public.categories set position = (public.category_code_key(code))[array_length(public.category_code_key(code), 1)]
where code is not null;

-- Recalcula código, tipo e posição de todas as rubricas do grupo a partir de pai e posição.
create function public.renumber_categories(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  with recursive ranked as (
    select id, parent_id,
      row_number() over (partition by parent_id order by position, public.category_code_key(code) nulls last, lower(name), id) as n
    from public.categories where group_id = p_group_id and parent_id is not null
  ), tree as (
    select c.id, c.code as new_code, c.position as new_position, c.kind as new_kind
    from public.categories c where c.group_id = p_group_id and c.parent_id is null and c.code is not null
    union all
    select r.id, tree.new_code || '.' || r.n, (r.n - 1)::int, tree.new_kind
    from ranked r join tree on tree.id = r.parent_id
  )
  update public.categories c set code = t.new_code, position = t.new_position, kind = t.new_kind
  from tree t
  where t.id = c.id and (c.code, c.position, c.kind) is distinct from (t.new_code, t.new_position, t.new_kind);
end;
$$;
revoke all on function public.renumber_categories(uuid) from public, anon, authenticated;

select public.renumber_categories(id) from public.groups;

-- A rubrica e todas as de baixo, com o nível relativo (0 = ela mesma).
create function public.category_subtree(p_category_id uuid)
returns table (id uuid, depth int) language sql stable security definer set search_path = '' as $$
  with recursive tree as (
    select c.id, 0 as depth from public.categories c where c.id = p_category_id
    union all
    select c.id, tree.depth + 1 from public.categories c join tree on c.parent_id = tree.id
  )
  select id, depth from tree;
$$;
revoke all on function public.category_subtree(uuid) from public, anon, authenticated;

-- Rateios de sinal incompatível com o tipo de destino barram mover/excluir para outro ramo.
create function public.check_category_kind_fits(p_ids uuid[], p_kind public.category_kind)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_kind = 'receita' and exists (select 1 from public.entry_splits where category_id = any(p_ids) and amount_cents < 0) then
    raise exception 'Há rateios de despesa (saída) nesta rubrica ou nas de baixo: ela não pode ir para Receitas';
  end if;
  if p_kind = 'despesa' and exists (select 1 from public.entry_splits where category_id = any(p_ids) and amount_cents > 0) then
    raise exception 'Há rateios de receita (entrada) nesta rubrica ou nas de baixo: ela não pode ir para Despesas';
  end if;
end;
$$;
revoke all on function public.check_category_kind_fits(uuid[], public.category_kind) from public, anon, authenticated;

create or replace function public.category_snapshot(p_category_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code', c.code, 'name', c.name, 'ledger_code', c.ledger_code, 'active', c.active, 'parent_id', c.parent_id)
  from public.categories c where c.id = p_category_id;
$$;

-- Próxima posição entre as filhas de uma rubrica.
create function public.next_category_position(p_parent_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(max(position) + 1, 0) from public.categories where parent_id = p_parent_id;
$$;
revoke all on function public.next_category_position(uuid) from public, anon, authenticated;

-- Rubrica pai válida para receber uma rubrica: do grupo, na árvore e com espaço para a profundidade.
create function public.check_category_parent(p_group_id uuid, p_parent_id uuid, p_height int)
returns public.categories language plpgsql stable security definer set search_path = '' as $$
declare parent public.categories;
begin
  select * into parent from public.categories where id = p_parent_id and group_id = p_group_id;
  if parent.id is null then raise exception 'Rubrica pai não encontrada'; end if;
  if parent.code is null then raise exception 'A rubrica pai precisa estar na árvore (ter código)'; end if;
  if array_length(public.category_code_key(parent.code), 1) + 1 + p_height > 5 then
    raise exception 'A árvore de rubricas tem no máximo 5 níveis (ex.: 2.1.1.1.1)';
  end if;
  return parent;
end;
$$;
revoke all on function public.check_category_parent(uuid, uuid, int) from public, anon, authenticated;

drop function public.create_category(uuid, text, text, text);
drop function public.update_category(uuid, text, text);

-- Nova rubrica no fim das filhas da rubrica pai; o código sai da posição.
create function public.create_category(p_group_id uuid, p_parent_id uuid, p_name text, p_ledger_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; parent public.categories;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar rubricas neste grupo'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Informe um nome com 2 a 100 caracteres'; end if;
  parent := public.check_category_parent(p_group_id, p_parent_id, 0);
  insert into public.categories(group_id, parent_id, position, name, ledger_code, kind)
  values (p_group_id, parent.id, public.next_category_position(parent.id), trim(p_name), nullif(trim(p_ledger_code), ''), parent.kind)
  returning id into new_id;
  perform public.renumber_categories(p_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'category.created', 'category', new_id::text, public.category_snapshot(new_id));
  return new_id;
end;
$$;

-- Nome, conta contábil e rubrica pai. Mudar de pai leva a rubrica (com as de baixo) para o fim das novas irmãs.
create function public.update_category(p_category_id uuid, p_parent_id uuid, p_name text, p_ledger_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare cat public.categories; parent public.categories; before_state jsonb; subtree uuid[]; height int;
begin
  select * into cat from public.categories where id = p_category_id for update;
  if cat.id is null or not public.can_edit_group(cat.group_id) then raise exception 'Rubrica não encontrada ou sem permissão'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 100 then raise exception 'Informe um nome com 2 a 100 caracteres'; end if;
  before_state := public.category_snapshot(p_category_id);
  if p_parent_id is distinct from cat.parent_id then
    if cat.parent_id is null and cat.code is not null then raise exception 'As rubricas raiz (1 Receitas, 2 Despesas) não mudam de lugar'; end if;
    if p_parent_id is null then raise exception 'Escolha a rubrica pai'; end if;
    select array_agg(id), max(depth) into subtree, height from public.category_subtree(p_category_id);
    if p_parent_id = any(subtree) then raise exception 'Uma rubrica não pode ficar dentro dela mesma'; end if;
    parent := public.check_category_parent(cat.group_id, p_parent_id, height);
    perform public.check_category_kind_fits(subtree, parent.kind);
    update public.categories set parent_id = parent.id, position = public.next_category_position(parent.id) where id = p_category_id;
  end if;
  update public.categories set name = trim(p_name), ledger_code = nullif(trim(p_ledger_code), '') where id = p_category_id;
  perform public.renumber_categories(cat.group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (cat.group_id, auth.uid(), 'category.updated', 'category', p_category_id::text,
    jsonb_build_object('before', before_state, 'after', public.category_snapshot(p_category_id)));
end;
$$;

/*
  Grava de uma vez a árvore editada na tela (rascunho no navegador: arrastar, renomear, criar, inativar, excluir).

  p_nodes: todas as rubricas fora das raízes, na ordem final:
    [{ "key": id ou "new:N", "id": uuid|null, "parent": key da rubrica pai, "position": n, "name", "ledgerCode", "active" }]
  p_deleted: [{ "id": uuid, "target": key que recebe os rateios (normalmente a rubrica pai mais próxima que fica) }]
  Rubricas do grupo fora de p_nodes e de p_deleted não mudam (raízes e antigas sem código).

  Tudo ou nada: ciclos, mais de 5 níveis, rubrica pai excluída ou rateio que ficaria com o sinal errado
  (despesa em Receitas) recusam a gravação inteira. Cada rubrica criada, alterada (inclusive só o código) ou
  excluída gera seu evento de auditoria, e cada lançamento cujos rateios mudam de rubrica, um evento no histórico.
  Devolve { created, updated, deleted, splits, entries }.
*/
create function public.save_category_tree(p_group_id uuid, p_nodes jsonb, p_deleted jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  node jsonb;
  del jsonb;
  keys jsonb := '{}';
  new_id uuid;
  node_id uuid;
  new_parent uuid;
  target public.categories;
  deleted_ids uuid[];
  before jsonb;
  after jsonb;
  item record;
  bad record;
  created int := 0;
  updated int := 0;
  split_count int := 0;
  moved int;
  entry_count int := 0;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para alterar rubricas neste grupo'; end if;
  if jsonb_typeof(p_nodes) <> 'array' or jsonb_typeof(p_deleted) <> 'array' then raise exception 'Dados inválidos'; end if;
  perform 1 from public.categories where group_id = p_group_id for update;
  select jsonb_object_agg(id, public.category_snapshot(id)) into before from public.categories where group_id = p_group_id;

  select coalesce(array_agg((value->>'id')::uuid), '{}') into deleted_ids from jsonb_array_elements(p_deleted);
  if exists (
    select 1 from unnest(deleted_ids) d
    where not exists (select 1 from public.categories c where c.id = d and c.group_id = p_group_id and not (c.parent_id is null and c.code is not null))
  ) then raise exception 'Rubrica excluída inválida (as raízes 1 e 2 não saem)'; end if;

  -- 1. chaves: rubricas existentes conferidas; novas inseridas fora da árvore (pai e código vêm depois)
  for node in select value from jsonb_array_elements(p_nodes) loop
    if char_length(trim(coalesce(node->>'name', ''))) not between 2 and 100 then
      raise exception 'Rubrica “%”: informe um nome com 2 a 100 caracteres', coalesce(trim(node->>'name'), '');
    end if;
    if nullif(node->>'id', '') is null then
      insert into public.categories(group_id, name) values (p_group_id, trim(node->>'name')) returning id into new_id;
      keys := keys || jsonb_build_object(node->>'key', new_id);
      created := created + 1;
    else
      node_id := (node->>'id')::uuid;
      if node_id = any(deleted_ids) or not exists (
        select 1 from public.categories where id = node_id and group_id = p_group_id and not (parent_id is null and code is not null)
      ) then raise exception 'Rubrica “%” não encontrada', node->>'name'; end if;
      keys := keys || jsonb_build_object(node->>'key', node_id);
    end if;
  end loop;

  -- 2. pai, posição, nome, conta contábil e ativa
  for node in select value from jsonb_array_elements(p_nodes) loop
    node_id := (keys->>(node->>'key'))::uuid;
    new_parent := coalesce(keys->>(node->>'parent'), case when node->>'parent' ~ '^[0-9a-f-]{36}$' then node->>'parent' end)::uuid;
    if new_parent is null or new_parent = any(deleted_ids)
      or not exists (select 1 from public.categories where id = new_parent and group_id = p_group_id) then
      raise exception 'Rubrica “%”: rubrica pai inválida ou excluída', node->>'name';
    end if;
    update public.categories set
      parent_id = new_parent,
      position = coalesce((node->>'position')::int, 0),
      name = trim(node->>'name'),
      ledger_code = nullif(trim(node->>'ledgerCode'), ''),
      active = coalesce((node->>'active')::boolean, true)
    where id = node_id;
  end loop;

  -- 3. árvore sem ciclos e com até 5 níveis: todas as rubricas com pai precisam ser alcançadas a partir das raízes
  with recursive tree as (
    select id, 0 as depth from public.categories where group_id = p_group_id and parent_id is null and code is not null
    union all
    select c.id, tree.depth + 1 from public.categories c join tree on c.parent_id = tree.id
    where tree.depth < 10 and not c.id = any(deleted_ids)
  )
  select
    (select count(*) from public.categories c where c.group_id = p_group_id and c.parent_id is not null and not c.id = any(deleted_ids)
       and not exists (select 1 from tree where tree.id = c.id)) as orphans,
    (select max(depth) from tree) as depth
  into bad;
  if bad.orphans > 0 then raise exception 'A árvore ficou com uma rubrica dentro dela mesma'; end if;
  if bad.depth > 4 then raise exception 'A árvore de rubricas tem no máximo 5 níveis (ex.: 2.1.1.1.1)'; end if;

  -- 4. exclusões: rateios para o destino (com evento no histórico de cada lançamento), depois as rubricas
  for del in select value from jsonb_array_elements(p_deleted) loop
    node_id := (del->>'id')::uuid;
    target := null;
    select * into target from public.categories
    where id = coalesce(keys->>(del->>'target'), case when del->>'target' ~ '^[0-9a-f-]{36}$' then del->>'target' end)::uuid
      and group_id = p_group_id and not id = any(deleted_ids);
    if target.id is null then
      if exists (select 1 from public.entry_splits where category_id = node_id) then
        raise exception 'Escolha a rubrica que recebe os rateios de “%”', before->(node_id::text)->>'name';
      end if;
      continue;
    end if;
    for item in
      select s.entry_id, count(*) as splits from public.entry_splits s where s.category_id = node_id group by s.entry_id
    loop
      entry_count := entry_count + 1;
      insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
      values (p_group_id, auth.uid(), 'ledger_entry.category_merged', 'ledger_entry', item.entry_id::text,
        jsonb_build_object('from', jsonb_build_array(jsonb_build_object('code', before->(node_id::text)->>'code', 'name', before->(node_id::text)->>'name')),
          'to', jsonb_build_object('id', target.id, 'name', target.name), 'splits', item.splits));
    end loop;
    update public.entry_splits set category_id = target.id where category_id = node_id;
    get diagnostics moved = row_count;
    split_count := split_count + moved;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'category.deleted', 'category', node_id::text,
      jsonb_build_object('before', before->(node_id::text), 'target_id', target.id, 'splits', moved));
  end loop;
  -- exclusões sem destino (sem rateios) também ficam na auditoria
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  select p_group_id, auth.uid(), 'category.deleted', 'category', d::text, jsonb_build_object('before', before->(d::text), 'splits', 0)
  from unnest(deleted_ids) d
  where not exists (select 1 from public.audit_events a where a.entity_type = 'category' and a.entity_id = d::text and a.action = 'category.deleted');
  update public.fee_settings set category_id = null where category_id = any(deleted_ids);
  update public.categories set parent_id = null where id = any(deleted_ids);
  delete from public.categories where id = any(deleted_ids);

  -- 5. códigos e tipos; rateio com o sinal errado para o novo ramo recusa tudo
  perform public.renumber_categories(p_group_id);
  select c.code, c.name, c.kind into bad
  from public.entry_splits s join public.categories c on c.id = s.category_id
  where c.group_id = p_group_id and ((c.kind = 'receita' and s.amount_cents < 0) or (c.kind = 'despesa' and s.amount_cents > 0))
  limit 1;
  if found then
    raise exception 'A rubrica % % ficou em %, mas tem rateios de %', bad.code, bad.name,
      case bad.kind when 'receita' then 'Receitas' else 'Despesas' end, case bad.kind when 'receita' then 'despesa (saída)' else 'receita (entrada)' end;
  end if;

  -- 6. auditoria das criadas e alteradas (inclusive código renumerado)
  for item in select id from public.categories where group_id = p_group_id loop
    after := public.category_snapshot(item.id);
    if not before ? item.id::text then
      insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
      values (p_group_id, auth.uid(), 'category.created', 'category', item.id::text, after);
    elsif before->(item.id::text) is distinct from after then
      updated := updated + 1;
      insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
      values (p_group_id, auth.uid(), 'category.updated', 'category', item.id::text, jsonb_build_object('before', before->(item.id::text), 'after', after));
    end if;
  end loop;

  return jsonb_build_object('created', created, 'updated', updated, 'deleted', coalesce(array_length(deleted_ids, 1), 0),
    'splits', split_count, 'entries', entry_count);
end;
$$;

-- Plano padrão de grupo novo: mesmo conteúdo da 008, gravando pai e posição (não há mais gatilho derivando do código).
create or replace function public.seed_categories(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item record;
begin
  if exists (select 1 from public.categories where group_id = p_group_id and code is not null) then return; end if;
  for item in
    select code, name from (values
      ('1', 'Receitas'),
      ('1.1', 'Mensalidades'), ('1.2', 'Lojinha'), ('1.3', 'Pastelada'), ('1.4', 'Bufê de Sopas'),
      ('1.5', 'Campanhas financeiras'), ('1.6', 'Programa'),
      ('1.6.1', 'Acampamento de Grupo'), ('1.6.2', 'Acantonamento de Grupo'), ('1.6.3', 'Atividades da alcateia'),
      ('1.6.4', 'Atividades da tropa escoteira'), ('1.6.5', 'Atividades da tropa sênior'), ('1.6.6', 'Atividades do clã pioneiro'),
      ('1.7', 'Registros'), ('1.8', 'Materiais Escoteiros'),
      ('2', 'Despesas'),
      ('2.1', 'Despesas administrativas'),
      ('2.1.1', 'Cartório e contabilidades'), ('2.1.2', 'Telefone'), ('2.1.3', 'Redes sociais'), ('2.1.4', 'Domínio e hospedagem'),
      ('2.1.5', 'Material de limpeza'), ('2.1.6', 'Material de escritório'), ('2.1.7', 'Camisetas'), ('2.1.8', 'Impressões / papelaria'),
      ('2.2', 'Programa'),
      ('2.2.1', 'Escoteiro por um dia'), ('2.2.2', 'Acampamento de Grupo'), ('2.2.3', 'Acantonamento de Grupo'), ('2.2.4', 'Fórum de Jovens'),
      ('2.2.5', 'Indaba e CDEs'), ('2.2.6', 'Confraternização de encerramento'), ('2.2.7', 'Lenços'),
      ('2.2.8', 'Atividades Estratégicas Nacionais'), ('2.2.9', 'Loja Escoteira'), ('2.2.10', 'Atividades da alcateia'),
      ('2.2.11', 'Atividades da tropa escoteira'), ('2.2.12', 'Atividades da tropa sênior'), ('2.2.13', 'Atividades do clã pioneiro'),
      ('2.3', 'Gestão de Adultos'),
      ('2.3.1', 'Registros institucionais'), ('2.3.2', 'Cursos e capacitações'), ('2.3.3', 'Acampamento de adultos'),
      ('2.4', 'Manutenção dos espaços'),
      ('2.5', 'Pastelada'),
      ('2.5.1', 'Salão'), ('2.5.2', 'Ingredientes'), ('2.5.3', 'Bebidas'), ('2.5.4', 'Descartáveis'), ('2.5.5', 'Divulgação'),
      ('2.6', 'Bufê de Sopas'),
      ('2.6.1', 'Salão, decoração e limpeza'), ('2.6.2', 'Ingredientes'), ('2.6.3', 'Bebidas'), ('2.6.4', 'Descartáveis'),
      ('2.6.5', 'Divulgação e convites'),
      ('2.7', 'Eventos CML'),
      ('2.7.1', 'Almoço da Confirmação'), ('2.7.2', 'Noite das Massas'), ('2.7.3', 'Feijoada'), ('2.7.4', 'Chá da OASE'),
      ('2.7.5', 'Almoço Campeiro'), ('2.7.6', 'Jantar da Reforma'), ('2.7.7', 'Martin Lutherfest'), ('2.7.8', 'Confraternização de Advento'),
      ('2.8', 'Materiais Escoteiros'), ('2.9', 'Campanhas Financeiras')
    ) as t(code, name)
    order by public.category_code_key(code)
  loop
    insert into public.categories(group_id, code, name, kind, position, parent_id)
    values (p_group_id, item.code, item.name,
      case left(item.code, 1) when '1' then 'receita'::public.category_kind else 'despesa'::public.category_kind end,
      (public.category_code_key(item.code))[array_length(public.category_code_key(item.code), 1)],
      (select id from public.categories where group_id = p_group_id and code = regexp_replace(item.code, '\.[0-9]+$', '') and item.code like '%.%'));
  end loop;
  -- rubrica de mensalidade inicial (fee_category_ids usa só a configurada)
  insert into public.fee_settings(group_id, category_id)
  select p_group_id, id from public.categories where group_id = p_group_id and code = '1.1'
  on conflict (group_id) do nothing;
end;
$$;

-- Mensalidades: o código 1.1 deixa de ser fixo. Grupos sem rubrica configurada ficam com a 1.1 de hoje,
-- e a função passa a usar só a configurada.
insert into public.fee_settings(group_id, category_id)
select c.group_id, c.id from public.categories c where c.code = '1.1'
on conflict (group_id) do update set category_id = excluded.category_id where public.fee_settings.category_id is null;

create or replace function public.fee_category_ids(p_group_id uuid)
returns uuid[] language sql stable security invoker set search_path = '' as $$
  with recursive tree as (
    select s.category_id as id from public.fee_settings s where s.group_id = p_group_id and s.category_id is not null
    union
    select c.id from public.categories c join tree t on c.parent_id = t.id
  )
  select coalesce(array_agg(id), '{}') from tree;
$$;

revoke all on function public.create_category(uuid, uuid, text, text) from public, anon;
revoke all on function public.update_category(uuid, uuid, text, text) from public, anon;
revoke all on function public.save_category_tree(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_category(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_category(uuid, uuid, text, text) to authenticated;
grant execute on function public.save_category_tree(uuid, jsonb, jsonb) to authenticated;
