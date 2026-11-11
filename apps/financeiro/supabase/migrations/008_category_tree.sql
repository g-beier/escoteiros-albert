-- Rubricas hierárquicas: código (ex.: 2.5.2), tipo (receita/despesa) e rubrica pai.
-- O tipo e o pai são derivados do código: 1.x = receita, 2.x = despesa; "2.5.2" é filha de "2.5".

create type public.category_kind as enum ('receita', 'despesa');

alter table public.categories
  add column code text check (code ~ '^[12](\.[0-9]{1,3}){0,4}$'),
  add column kind public.category_kind,
  add column parent_id uuid references public.categories(id) on delete restrict;

-- Nomes se repetem em ramos diferentes (ex.: "Ingredientes" em 2.5 e 2.6); o código passa a identificar.
alter table public.categories drop constraint categories_group_id_name_key;
create unique index categories_group_code_idx on public.categories(group_id, code) where code is not null;
create index categories_parent_idx on public.categories(parent_id);

create or replace function public.derive_category_tree()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.code is null then
    new.kind := null;
    new.parent_id := null;
    return new;
  end if;
  new.kind := case left(new.code, 1) when '1' then 'receita'::public.category_kind else 'despesa'::public.category_kind end;
  if position('.' in new.code) = 0 then
    new.parent_id := null;
  else
    select id into new.parent_id from public.categories
    where group_id = new.group_id and code = regexp_replace(new.code, '\.[0-9]+$', '');
    if new.parent_id is null then
      raise exception 'Cadastre antes a rubrica %', regexp_replace(new.code, '\.[0-9]+$', '');
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_derive_tree before insert or update of code on public.categories
for each row execute function public.derive_category_tree();

-- Plano de rubricas padrão do grupo.
create or replace function public.seed_categories(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item record;
begin
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
    order by array_length(string_to_array(code, '.'), 1), code
  loop
    -- uma instrução por rubrica: o gatilho precisa enxergar a rubrica pai já gravada
    insert into public.categories(group_id, code, name) values (p_group_id, item.code, item.name)
    on conflict (group_id, code) where code is not null do nothing;
  end loop;
end;
$$;
revoke all on function public.seed_categories(uuid) from public, anon, authenticated;

-- Rubricas antigas, sem código, saem de uso (continuam nos lançamentos que já as usam).
update public.categories set active = false where code is null;
select public.seed_categories(id) from public.groups;

-- Sinais: receita só positiva, despesa só negativa, e todos os rateios com o sinal do total.
create or replace function public.validate_entry_totals(p_total_cents bigint, p_splits jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare split_total bigint;
begin
  if p_total_cents = 0 then raise exception 'O total não pode ser zero'; end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then raise exception 'Informe ao menos uma rubrica'; end if;
  if exists (select 1 from jsonb_array_elements(p_splits) where sign((value->>'amount_cents')::bigint) <> sign(p_total_cents)) then
    raise exception 'Todos os rateios devem ter o mesmo sinal do total (entrada ou saída)';
  end if;
  select coalesce(sum((value->>'amount_cents')::bigint), 0) into split_total from jsonb_array_elements(p_splits);
  if split_total <> p_total_cents then raise exception 'A soma das rubricas deve ser igual ao total'; end if;
end;
$$;

create or replace function public.write_entry_splits(
  p_entry_id uuid, p_group_id uuid, p_splits jsonb, p_previous_splits jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  split jsonb;
  split_category uuid;
  split_associate uuid;
  split_amount bigint;
  category_kind public.category_kind;
begin
  for split in select value from jsonb_array_elements(p_splits)
  loop
    split_category := (split->>'category_id')::uuid;
    split_amount := (split->>'amount_cents')::bigint;
    select c.kind into category_kind from public.categories c
    where c.id = split_category and c.group_id = p_group_id
      and (c.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where (prev->>'category_id')::uuid = split_category));
    if not found then raise exception 'Rubrica inválida'; end if;
    if category_kind = 'receita' and split_amount < 0 then raise exception 'Rubrica de receita exige valor de entrada'; end if;
    if category_kind = 'despesa' and split_amount > 0 then raise exception 'Rubrica de despesa exige valor de saída'; end if;

    split_associate := nullif(split->>'associate_id', '')::uuid;
    if split_associate is not null and not exists (
      select 1 from public.associates a where a.id = split_associate and a.group_id = p_group_id
        and (a.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where nullif(prev->>'associate_id', '')::uuid = split_associate))
    ) then raise exception 'Associado inválido'; end if;

    insert into public.entry_splits (entry_id, category_id, amount_cents, description, associate_id)
    values (p_entry_id, split_category, split_amount, trim(split->>'description'), split_associate);
  end loop;
end;
$$;
revoke all on function public.write_entry_splits(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.admin_bootstrap_group(p_admin_email text, p_group_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare admin_id uuid; new_group_id uuid;
begin
  select id into admin_id from auth.users where lower(email) = lower(trim(p_admin_email));
  if admin_id is null then raise exception 'Crie e confirme o usuário administrativo antes de iniciar o grupo'; end if;
  if exists (select 1 from public.memberships where user_id = admin_id) then raise exception 'Usuário já pertence a um grupo'; end if;
  insert into public.groups(name) values (trim(p_group_name)) returning id into new_group_id;
  insert into public.memberships(group_id, user_id, role) values (new_group_id, admin_id, 'admin');
  perform public.seed_categories(new_group_id);
  perform public.seed_payment_methods(new_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new_group_id, admin_id, 'group.bootstrapped', 'group', new_group_id::text, jsonb_build_object('name', trim(p_group_name)));
  return new_group_id;
end;
$$;
revoke all on function public.admin_bootstrap_group(text, text) from public, anon, authenticated;
grant execute on function public.admin_bootstrap_group(text, text) to postgres;

-- Visão explodida: código e tipo da rubrica para exibição.
create or replace view public.entry_split_rows with (security_invoker = true) as
select
  s.id as split_id,
  e.id as entry_id,
  e.group_id,
  e.entry_date,
  e.payment_method_id,
  pm.name as payment_method_name,
  e.document,
  e.document_filed,
  e.total_cents as entry_total_cents,
  s.amount_cents,
  s.description,
  s.category_id,
  c.name as category_name,
  s.associate_id,
  a.name as associate_name,
  e.name as entry_name,
  e.name || ' ' || s.description as search_text,
  c.code as category_code,
  c.kind as category_kind
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id;
