create extension if not exists pgcrypto;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('admin', 'treasurer', 'viewer');

create table public.memberships (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  entry_date date not null,
  description text not null check (char_length(description) between 2 and 200),
  document text check (char_length(document) <= 60),
  total_cents bigint not null check (total_cents <> 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entry_splits (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ledger_entries(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  amount_cents bigint not null check (amount_cents <> 0),
  created_at timestamptz not null default now()
);

create index memberships_user_idx on public.memberships(user_id);
create index ledger_entries_group_date_idx on public.ledger_entries(group_id, entry_date desc);
create index entry_splits_entry_idx on public.entry_splits(entry_id);
create index categories_group_idx on public.categories(group_id);

create or replace function public.is_group_member(requested_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where group_id = requested_group_id and user_id = auth.uid());
$$;

create or replace function public.can_edit_group(requested_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where group_id = requested_group_id and user_id = auth.uid() and role in ('admin', 'treasurer'));
$$;

alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.categories enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.entry_splits enable row level security;

create policy "members read groups" on public.groups for select using (public.is_group_member(id));
create policy "members read memberships" on public.memberships for select using (public.is_group_member(group_id));
create policy "members read categories" on public.categories for select using (public.is_group_member(group_id));
create policy "editors manage categories" on public.categories for all using (public.can_edit_group(group_id)) with check (public.can_edit_group(group_id));
create policy "members read entries" on public.ledger_entries for select using (public.is_group_member(group_id));
create policy "members read splits" on public.entry_splits for select using (
  exists (select 1 from public.ledger_entries e where e.id = entry_id and public.is_group_member(e.group_id))
);

create or replace function public.create_ledger_entry(
  p_group_id uuid, p_entry_date date, p_description text, p_document text,
  p_total_cents bigint, p_splits jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_entry_id uuid;
  split_total bigint;
  split jsonb;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para lançar neste grupo'; end if;
  if p_total_cents = 0 then raise exception 'O total não pode ser zero'; end if;
  select coalesce(sum((value->>'amount_cents')::bigint), 0) into split_total from jsonb_array_elements(p_splits);
  if split_total <> p_total_cents then raise exception 'A soma das rubricas deve ser igual ao total'; end if;
  if jsonb_array_length(p_splits) = 0 then raise exception 'Informe ao menos uma rubrica'; end if;

  insert into public.ledger_entries (group_id, entry_date, description, document, total_cents, created_by)
  values (p_group_id, p_entry_date, trim(p_description), nullif(trim(p_document), ''), p_total_cents, auth.uid()) returning id into new_entry_id;

  for split in select value from jsonb_array_elements(p_splits)
  loop
    if not exists (select 1 from public.categories where id = (split->>'category_id')::uuid and group_id = p_group_id and active) then
      raise exception 'Rubrica inválida';
    end if;
    insert into public.entry_splits (entry_id, category_id, amount_cents)
    values (new_entry_id, (split->>'category_id')::uuid, (split->>'amount_cents')::bigint);
  end loop;
  return new_entry_id;
end;
$$;

create or replace view public.category_summary with (security_invoker = true) as
select e.group_id, c.id category_id, c.name category_name, sum(s.amount_cents)::bigint total_cents
from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id join public.categories c on c.id = s.category_id
group by e.group_id, c.id, c.name;

create or replace function public.bootstrap_group(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_group_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then raise exception 'Usuário já pertence a um grupo'; end if;
  insert into public.groups(name) values (trim(p_name)) returning id into new_group_id;
  insert into public.memberships(group_id, user_id, role) values (new_group_id, auth.uid(), 'admin');
  insert into public.categories(group_id, name) values
    (new_group_id, 'Alimentação'), (new_group_id, 'Materiais de escritório'),
    (new_group_id, 'Material de atividades'), (new_group_id, 'Manutenção'),
    (new_group_id, 'Mensalidades'), (new_group_id, 'Outros');
  return new_group_id;
end;
$$;

revoke all on function public.create_ledger_entry(uuid, date, text, text, bigint, jsonb) from public;
grant execute on function public.create_ledger_entry(uuid, date, text, text, bigint, jsonb) to authenticated;
revoke all on function public.bootstrap_group(text) from public;
grant execute on function public.bootstrap_group(text) to authenticated;
