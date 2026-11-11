-- Lançamento = linha do extrato (data, forma de pagamento, pasta, total).
-- Rateio = rubrica, valor, descrição e associado opcional.

-- Formas de pagamento -------------------------------------------------------
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);
create index payment_methods_group_idx on public.payment_methods(group_id);
alter table public.payment_methods enable row level security;
create policy "members read payment methods" on public.payment_methods for select using (public.is_group_member(group_id));
create policy "editors manage payment methods" on public.payment_methods for all
  using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id));

create or replace function public.seed_payment_methods(p_group_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.payment_methods(group_id, name) values
    (p_group_id, 'PIX'), (p_group_id, 'Transferência'), (p_group_id, 'Boleto'),
    (p_group_id, 'Cartão de débito'), (p_group_id, 'Cartão de crédito'),
    (p_group_id, 'Dinheiro'), (p_group_id, 'Débito automático'), (p_group_id, 'Tarifa bancária')
  on conflict (group_id, name) do nothing;
$$;
revoke all on function public.seed_payment_methods(uuid) from public, anon, authenticated;

select public.seed_payment_methods(id) from public.groups;

-- Associados ------------------------------------------------------------------
create type public.scout_branch as enum ('lobinho', 'escoteiro', 'senior', 'pioneiro', 'adulto');

create table public.associates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  branch public.scout_branch not null,
  section text check (char_length(section) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index associates_group_name_idx on public.associates(group_id, name);
alter table public.associates enable row level security;
create policy "members read associates" on public.associates for select using (public.is_group_member(group_id));
create policy "editors manage associates" on public.associates for all
  using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id));

-- Lançamentos e rateios -------------------------------------------------------
-- Apenas banco local existe; lançamentos de teste são descartados para aplicar as novas colunas obrigatórias.
delete from public.ledger_entries;

drop view if exists public.category_summary;
drop function if exists public.create_ledger_entry(uuid, date, text, text, bigint, jsonb);

alter table public.ledger_entries
  drop column description,
  add column payment_method_id uuid not null references public.payment_methods(id),
  add column document_filed boolean not null default false;

alter table public.entry_splits
  add column description text not null check (char_length(description) between 2 and 200),
  add column associate_id uuid references public.associates(id);

create index entry_splits_category_idx on public.entry_splits(category_id);
create index entry_splits_associate_idx on public.entry_splits(associate_id);

create or replace function public.create_ledger_entry(
  p_group_id uuid, p_entry_date date, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_entry_id uuid;
  split_total bigint;
  split jsonb;
  split_associate uuid;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para lançar neste grupo'; end if;
  if p_total_cents = 0 then raise exception 'O total não pode ser zero'; end if;
  if jsonb_array_length(p_splits) = 0 then raise exception 'Informe ao menos uma rubrica'; end if;
  select coalesce(sum((value->>'amount_cents')::bigint), 0) into split_total from jsonb_array_elements(p_splits);
  if split_total <> p_total_cents then raise exception 'A soma das rubricas deve ser igual ao total'; end if;
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and group_id = p_group_id and active) then
    raise exception 'Forma de pagamento inválida';
  end if;

  insert into public.ledger_entries (group_id, entry_date, payment_method_id, document, document_filed, total_cents, created_by)
  values (p_group_id, p_entry_date, p_payment_method_id, nullif(trim(p_document), ''), coalesce(p_document_filed, false), p_total_cents, auth.uid())
  returning id into new_entry_id;

  for split in select value from jsonb_array_elements(p_splits)
  loop
    if not exists (select 1 from public.categories where id = (split->>'category_id')::uuid and group_id = p_group_id and active) then
      raise exception 'Rubrica inválida';
    end if;
    split_associate := nullif(split->>'associate_id', '')::uuid;
    if split_associate is not null and not exists (
      select 1 from public.associates where id = split_associate and group_id = p_group_id and active
    ) then raise exception 'Associado inválido'; end if;
    insert into public.entry_splits (entry_id, category_id, amount_cents, description, associate_id)
    values (new_entry_id, (split->>'category_id')::uuid, (split->>'amount_cents')::bigint, trim(split->>'description'), split_associate);
  end loop;
  return new_entry_id;
end;
$$;
revoke all on function public.create_ledger_entry(uuid, date, uuid, text, boolean, bigint, jsonb) from public;
grant execute on function public.create_ledger_entry(uuid, date, uuid, text, boolean, bigint, jsonb) to authenticated;

-- Visão "por rubrica" explodida: uma linha por rateio, ligada à linha do extrato.
create view public.entry_split_rows with (security_invoker = true) as
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
  a.name as associate_name
from public.entry_splits s
join public.ledger_entries e on e.id = s.entry_id
join public.payment_methods pm on pm.id = e.payment_method_id
join public.categories c on c.id = s.category_id
left join public.associates a on a.id = s.associate_id;

-- Auditoria e bootstrap acompanham o novo modelo ------------------------------
create or replace function public.audit_ledger_entry_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new.group_id, auth.uid(), 'ledger_entry.created', 'ledger_entry', new.id::text,
    jsonb_build_object('entry_date', new.entry_date, 'payment_method_id', new.payment_method_id, 'total_cents', new.total_cents));
  return new;
end;
$$;

create or replace function public.admin_bootstrap_group(p_admin_email text, p_group_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare admin_id uuid; new_group_id uuid;
begin
  select id into admin_id from auth.users where lower(email) = lower(trim(p_admin_email));
  if admin_id is null then raise exception 'Crie e confirme o usuário administrativo antes de iniciar o grupo'; end if;
  if exists (select 1 from public.memberships where user_id = admin_id) then raise exception 'Usuário já pertence a um grupo'; end if;
  insert into public.groups(name) values (trim(p_group_name)) returning id into new_group_id;
  insert into public.memberships(group_id, user_id, role) values (new_group_id, admin_id, 'admin');
  insert into public.categories(group_id, name) values
    (new_group_id, 'Alimentação'), (new_group_id, 'Materiais de escritório'),
    (new_group_id, 'Material de atividades'), (new_group_id, 'Manutenção'),
    (new_group_id, 'Mensalidades'), (new_group_id, 'Outros');
  perform public.seed_payment_methods(new_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new_group_id, admin_id, 'group.bootstrapped', 'group', new_group_id::text, jsonb_build_object('name', trim(p_group_name)));
  return new_group_id;
end;
$$;
revoke all on function public.admin_bootstrap_group(text, text) from public, anon, authenticated;
grant execute on function public.admin_bootstrap_group(text, text) to postgres;

-- bootstrap_group (001) foi revogado na 003; remove-se para não manter código morto.
drop function if exists public.bootstrap_group(text);
