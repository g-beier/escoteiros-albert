-- Um usuário pertence a exatamente um grupo nesta primeira versão do produto.
alter table public.memberships add constraint memberships_one_group_per_user unique (user_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_group_created_idx on public.audit_events(group_id, created_at desc);
alter table public.audit_events enable row level security;
create policy "admins read audit" on public.audit_events for select using (
  exists (select 1 from public.memberships m where m.group_id = audit_events.group_id and m.user_id = auth.uid() and m.role = 'admin')
);

create or replace function public.audit_ledger_entry_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new.group_id, auth.uid(), 'ledger_entry.created', 'ledger_entry', new.id::text,
    jsonb_build_object('entry_date', new.entry_date, 'description', new.description, 'total_cents', new.total_cents));
  return new;
end;
$$;

create trigger ledger_entry_audit after insert on public.ledger_entries
for each row execute function public.audit_ledger_entry_created();

-- O bootstrap deixa de ser uma função pública após a configuração inicial.
revoke execute on function public.bootstrap_group(text) from authenticated, anon, public;

-- Executável somente pelo papel postgres do SQL Editor para criar o primeiro grupo.
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
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new_group_id, admin_id, 'group.bootstrapped', 'group', new_group_id::text, jsonb_build_object('name', trim(p_group_name)));
  return new_group_id;
end;
$$;
revoke all on function public.admin_bootstrap_group(text, text) from public, anon, authenticated;
grant execute on function public.admin_bootstrap_group(text, text) to postgres;

create or replace function public.record_user_invite(p_group_id uuid, p_target_user_id uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_group(p_group_id) or not exists (
    select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin'
  ) then raise exception 'Apenas administradores podem registrar convites'; end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.invited', 'user', p_target_user_id::text, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_change_member_role(p_group_id uuid, p_user_id uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
declare old_role public.member_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem alterar papéis';
  end if;
  select role into old_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if old_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'Você não pode remover sua própria função de administrador'; end if;
  if old_role = 'admin' and p_role <> 'admin' and (select count(*) from public.memberships where group_id = p_group_id and role = 'admin') <= 1 then
    raise exception 'O grupo precisa manter pelo menos um administrador';
  end if;
  update public.memberships set role = p_role where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.role_changed', 'user', p_user_id::text, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

create or replace function public.admin_remove_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare removed_role public.member_role;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem remover usuários';
  end if;
  if p_user_id = auth.uid() then raise exception 'Você não pode remover seu próprio acesso'; end if;
  select role into removed_role from public.memberships where group_id = p_group_id and user_id = p_user_id for update;
  if removed_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  if removed_role = 'admin' and (select count(*) from public.memberships where group_id = p_group_id and role = 'admin') <= 1 then
    raise exception 'O grupo precisa manter pelo menos um administrador';
  end if;
  delete from public.memberships where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.removed', 'user', p_user_id::text, jsonb_build_object('role', removed_role));
end;
$$;

grant execute on function public.record_user_invite(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.admin_change_member_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.admin_remove_member(uuid, uuid) to authenticated;
