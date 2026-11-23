-- 003 — Os mesmos cinco níveis de acesso em todos os módulos (docs/plano-go-live.md, seção 1).
--
--   none        Sem acesso     o módulo some do menu e o banco não deixa ler os dados dele
--   viewer      Consulta       só lê
--   contributor Colaborador    faz o dia a dia (lançamentos, associados, materiais e movimentos), sempre "para revisar"
--   editor      Editor         também revisa, mantém as configurações, importa, concilia e cuida das mensalidades
--   admin       Administrador  também gerencia os usuários do módulo
--
-- Uma coluna por módulo em `memberships` (`finance_role`, `inventory_role`, `associates_role`). Não há mais
-- administrador do grupo: cada módulo tem os seus; quem administra algum módulo abre /usuarios e muda só as colunas
-- dos módulos que administra. Quem fica "Sem acesso" em todos sai do grupo.
--
-- Conversão: admin → Administrador nos três; treasurer → Editor no Financeiro e no mínimo Editor no Associados (já
-- editava associados); Inventário manager → Editor, chief → Colaborador; Associados manager → Editor.

create type public.module_role as enum ('none', 'viewer', 'contributor', 'editor', 'admin');

-- Quem dependia dos tipos antigos -------------------------------------------------------------------------------------

drop policy "admins read audit" on public.audit_events;
drop function public.admin_add_member(uuid, text, public.member_role, public.inventory_role, public.associates_role);
drop function public.admin_change_member_role(uuid, uuid, public.member_role);
drop function public.admin_change_inventory_role(uuid, uuid, public.inventory_role);
drop function public.admin_change_associates_role(uuid, uuid, public.associates_role);
drop function public.group_users(uuid);
drop function public.admin_remove_member(uuid, uuid);
drop function public.associates_role_of(uuid);
drop function public.inventory_role_of(uuid);

-- Colunas -------------------------------------------------------------------------------------------------------------

alter table public.memberships add column finance_role public.module_role not null default 'viewer';
update public.memberships set finance_role = case role::text
  when 'admin' then 'admin' when 'treasurer' then 'editor' when 'viewer' then 'viewer' else 'none' end::public.module_role;

alter table public.memberships
  alter column inventory_role drop default,
  alter column inventory_role type public.module_role using (case
    when role::text = 'admin' then 'admin'
    when inventory_role::text = 'manager' then 'editor'
    when inventory_role::text = 'chief' then 'contributor'
    else 'viewer' end)::public.module_role,
  alter column inventory_role set default 'viewer',
  alter column associates_role drop default,
  alter column associates_role type public.module_role using (case
    when role::text = 'admin' then 'admin'
    when associates_role::text = 'manager' or role::text = 'treasurer' then 'editor'
    when associates_role::text = 'viewer' then 'viewer'
    else 'none' end)::public.module_role,
  alter column associates_role set default 'viewer';

alter table public.memberships drop column role;
drop type public.member_role;
drop type public.inventory_role;
drop type public.associates_role;

-- Papel e permissões de quem está logado -----------------------------------------------------------------------------

create function public.finance_role_of(p_group_id uuid) returns public.module_role
  language sql stable security definer set search_path to '' as $$
  select coalesce((select finance_role from public.memberships where group_id = p_group_id and user_id = auth.uid()), 'none');
$$;

create function public.inventory_role_of(p_group_id uuid) returns public.module_role
  language sql stable security definer set search_path to '' as $$
  select coalesce((select inventory_role from public.memberships where group_id = p_group_id and user_id = auth.uid()), 'none');
$$;

create function public.associates_role_of(p_group_id uuid) returns public.module_role
  language sql stable security definer set search_path to '' as $$
  select coalesce((select associates_role from public.memberships where group_id = p_group_id and user_id = auth.uid()), 'none');
$$;

/** Papel de quem está logado no módulo `finance`, `inventory` ou `associates`. */
create function public.module_role_of(p_group_id uuid, p_module text) returns public.module_role
  language sql stable security definer set search_path to '' as $$
  select case p_module
    when 'finance' then public.finance_role_of(p_group_id)
    when 'inventory' then public.inventory_role_of(p_group_id)
    when 'associates' then public.associates_role_of(p_group_id)
  end;
$$;

-- Financeiro: ler (Consulta+), lançar (Colaborador+), revisar e configurar (Editor+; nome antigo mantido).
create or replace function public.can_read_finance(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.finance_role_of(p_group_id) >= 'viewer';
$$;

create function public.can_write_finance(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.finance_role_of(p_group_id) >= 'contributor';
$$;

create or replace function public.can_edit_group(requested_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.finance_role_of(requested_group_id) >= 'editor';
$$;

-- Associados: ler, fazer o dia a dia (Colaborador+), revisar e configurar (Editor+).
create or replace function public.can_read_associates(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.associates_role_of(p_group_id) >= 'viewer';
$$;

create function public.can_write_associates(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.associates_role_of(p_group_id) >= 'contributor';
$$;

create or replace function public.can_manage_associates(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.associates_role_of(p_group_id) >= 'editor';
$$;

-- Inventário: ler, cadastrar e movimentar (Colaborador+, que passa por revisão), revisar e configurar (Editor+).
create function public.can_read_inventory(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.inventory_role_of(p_group_id) >= 'viewer';
$$;

create or replace function public.can_edit_inventory(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.inventory_role_of(p_group_id) >= 'contributor';
$$;

create or replace function public.can_manage_inventory(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.inventory_role_of(p_group_id) >= 'editor';
$$;

/** Administra algum módulo: abre /usuarios e lê a auditoria. */
create function public.is_any_module_admin(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid()
    and 'admin' in (finance_role, inventory_role, associates_role));
$$;

do $$
declare fn text;
begin
  foreach fn in array array['finance_role_of(uuid)', 'inventory_role_of(uuid)', 'associates_role_of(uuid)',
    'module_role_of(uuid,text)', 'can_read_finance(uuid)', 'can_write_finance(uuid)', 'can_edit_group(uuid)',
    'can_read_associates(uuid)', 'can_write_associates(uuid)', 'can_manage_associates(uuid)', 'can_read_inventory(uuid)',
    'can_edit_inventory(uuid)', 'can_manage_inventory(uuid)', 'is_any_module_admin(uuid)'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

-- Leitura ---------------------------------------------------------------------------------------------------------

do $$
declare p record; changed int := 0;
begin
  for p in
    select policyname, tablename, qual from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and tablename like 'inventory\_%' and qual like '%is_group_member(%'
  loop
    execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename,
      replace(p.qual, 'is_group_member(', 'can_read_inventory('));
    changed := changed + 1;
  end loop;
  if changed <> 7 then raise exception 'Esperava 7 políticas de leitura do inventário, achei %', changed; end if;
end;
$$;

create policy "admins read audit" on public.audit_events for select using (public.is_any_module_admin(group_id));

-- Quem pode o quê: Colaborador no dia a dia -------------------------------------------------------------------------

do $$
declare fn text; def text;
begin
  -- Financeiro: lançamentos e comprovantes.
  foreach fn in array array['public.create_ledger_entry(uuid,date,text,uuid,text,boolean,bigint,jsonb,uuid,text)',
    'public.update_ledger_entry(uuid,date,text,uuid,text,boolean,bigint,jsonb,uuid,text)',
    'public.delete_ledger_entry(uuid)', 'public.set_entry_document_filed(uuid,boolean)',
    'public.can_write_attachment_object(text)', 'public.can_delete_attachment_object(text)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    if def not like '%public.can_edit_group(%' then raise exception '% não usa can_edit_group', fn; end if;
    execute replace(def, 'public.can_edit_group(', 'public.can_write_finance(');
  end loop;
  foreach fn in array array['add_entry_attachment', 'delete_entry_attachment'] loop
    for def in select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn loop
      if def not like '%public.can_edit_group(%' then raise exception '% não usa can_edit_group', fn; end if;
      execute replace(def, 'public.can_edit_group(', 'public.can_write_finance(');
    end loop;
  end loop;

  -- Associados: cadastro, funções, movimentos, passagens, transição, situações de controle e responsáveis.
  foreach fn in array array['associates_create', 'associates_create_quick', 'associates_update', 'associates_add_function',
    'associates_update_function', 'associates_end_function', 'associates_delete_function', 'associates_leave',
    'associates_rejoin', 'associates_move', 'associates_set_transition', 'control_status_set', 'control_status_clear',
    'control_status_set_relative', 'control_status_clear_relative', 'relatives_check_associate', 'relatives_rename',
    'relatives_unlink', 'relatives_update_link'] loop
    if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = fn) then
      raise exception 'Função % não encontrada', fn;
    end if;
    for def in select pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn loop
      if def like '%public.can_manage_associates(%' then
        execute replace(def, 'public.can_manage_associates(', 'public.can_write_associates(');
      end if;
    end loop;
  end loop;
end;
$$;

-- Colaborador: o que grava fica "para revisar" -----------------------------------------------------------------------

/** Lançamento gravado por Colaborador fica para revisar; ele só apaga o que ainda não foi revisado. */
create function public.ledger_entries_contributor_review() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if public.finance_role_of(coalesce(new.group_id, old.group_id)) <> 'contributor' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.review_status = 'revisado' then raise exception 'Lançamento já revisado: peça a um editor do Financeiro para apagar'; end if;
    return old;
  end if;
  new.review_status := 'para_revisar';
  new.reviewed_by := null;
  new.reviewed_at := null;
  return new;
end;
$$;

create trigger ledger_entries_contributor_review before insert or update or delete on public.ledger_entries
  for each row execute function public.ledger_entries_contributor_review();

/** Associado gravado por Colaborador fica para revisar. */
create function public.associates_contributor_review() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if public.associates_role_of(new.group_id) = 'contributor' then
    new.review_status := 'para_revisar';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

create trigger associates_contributor_review before insert or update on public.associates
  for each row execute function public.associates_contributor_review();

/** Mudança feita por Colaborador numa função, movimento, passagem, situação ou responsável: o associado (ou os jovens
 * do responsável) volta a ficar para revisar. */
create function public.associates_contributor_touch() returns trigger
  language plpgsql security definer set search_path to '' as $$
declare r record; target_group uuid; targets uuid[];
begin
  r := coalesce(new, old);
  target_group := r.group_id;
  if public.associates_role_of(target_group) <> 'contributor' then return null; end if;
  if tg_table_name = 'relatives' then
    targets := array(select l.associate_id from public.relative_links l where l.relative_id = r.id);
  elsif tg_table_name = 'control_statuses' and r.associate_id is null then
    targets := array(select l.associate_id from public.relative_links l where l.relative_id = r.relative_id);
  else
    targets := array[r.associate_id];
  end if;
  update public.associates set review_status = 'para_revisar', reviewed_by = null, reviewed_at = null
  where id = any(targets) and review_status <> 'para_revisar';
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['associate_functions', 'associate_movements', 'associate_moves', 'control_statuses',
    'relative_links', 'relatives'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.associates_contributor_touch()',
      t || '_contributor_touch', t);
  end loop;
end;
$$;

-- Usuários: cada administrador cuida do seu módulo --------------------------------------------------------------------

/** Pessoas do grupo com o papel em cada módulo; para quem administra algum módulo. */
create function public.group_users(p_group_id uuid)
  returns table(user_id uuid, email text, last_sign_in_at timestamp with time zone, finance_role public.module_role,
    inventory_role public.module_role, associates_role public.module_role, associate_id uuid)
  language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.is_any_module_admin(p_group_id) then
    raise exception 'Apenas administradores gerenciam usuários';
  end if;
  return query
  select m.user_id, u.email, u.last_sign_in_at, m.finance_role, m.inventory_role, m.associates_role, m.associate_id
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.group_id = p_group_id
  order by m.created_at, u.email;
end;
$$;

/** Tira do grupo quem ficou sem acesso em todos os módulos (e solta a conta Google se não tiver outro grupo). */
create function public.members_drop_if_empty(p_group_id uuid, p_user_id uuid) returns boolean
  language plpgsql security definer set search_path to '' as $$
begin
  delete from public.memberships
  where group_id = p_group_id and user_id = p_user_id
    and finance_role = 'none' and inventory_role = 'none' and associates_role = 'none';
  if not found then return false; end if;
  if not exists (select 1 from public.memberships where user_id = p_user_id) then
    -- sem grupo: solta também a conta Google, para o recadastro aceitar outra (só aqui, nunca em admin_add_member)
    update auth.users set banned_until = 'infinity', google_sub = null where id = p_user_id;
    delete from auth.sessions where user_id = p_user_id;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.removed', 'user', p_user_id::text, '{}'::jsonb);
  return true;
end;
$$;

/** Cadastra um e-mail no grupo. Cada papel diferente de "Sem acesso" exige administrar o módulo. */
create function public.admin_add_member(p_group_id uuid, p_email text, p_finance_role public.module_role default 'none',
  p_inventory_role public.module_role default 'none', p_associates_role public.module_role default 'none') returns uuid
  language plpgsql security definer set search_path to '' as $_$
declare
  clean_email text := lower(btrim(coalesce(p_email, '')));
  target uuid;
  fin public.module_role := coalesce(p_finance_role, 'none');
  inv public.module_role := coalesce(p_inventory_role, 'none');
  ass public.module_role := coalesce(p_associates_role, 'none');
begin
  if not public.is_any_module_admin(p_group_id) then raise exception 'Apenas administradores podem cadastrar usuários'; end if;
  if (fin <> 'none' and public.finance_role_of(p_group_id) <> 'admin')
    or (inv <> 'none' and public.inventory_role_of(p_group_id) <> 'admin')
    or (ass <> 'none' and public.associates_role_of(p_group_id) <> 'admin') then
    raise exception 'Você só pode dar acesso aos módulos que administra';
  end if;
  if fin = 'none' and inv = 'none' and ass = 'none' then raise exception 'Dê acesso a pelo menos um módulo'; end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido'; end if;
  insert into auth.users(email) values (clean_email)
  on conflict (email) do update set banned_until = null
  returning id into target;
  if exists (select 1 from public.memberships where group_id = p_group_id and user_id = target) then
    raise exception 'Este e-mail já tem acesso ao grupo: mude o papel na lista';
  end if;
  insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
  values (p_group_id, target, fin, inv, ass);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.invited', 'user', target::text, jsonb_build_object('email', clean_email,
    'finance_role', fin, 'inventory_role', inv, 'associates_role', ass));
  return target;
end;
$_$;

/** Muda o papel de alguém num módulo (`finance`, `inventory`, `associates`); só o administrador do módulo. Cada módulo
 * mantém pelo menos um administrador. "Sem acesso" em todos tira a pessoa do grupo. */
create function public.admin_set_module_role(p_group_id uuid, p_user_id uuid, p_module text, p_role public.module_role)
  returns void
  language plpgsql security definer set search_path to '' as $$
declare old_role public.module_role; col text; last_admin boolean;
begin
  col := case p_module when 'finance' then 'finance_role' when 'inventory' then 'inventory_role'
    when 'associates' then 'associates_role' end;
  if col is null then raise exception 'Módulo inválido'; end if;
  if p_role is null then raise exception 'Escolha o papel'; end if;
  if public.module_role_of(p_group_id, p_module) <> 'admin' then
    raise exception 'Apenas o administrador do módulo pode alterar papéis nele';
  end if;
  execute format('select %I from public.memberships where group_id = $1 and user_id = $2 for update', col)
    into old_role using p_group_id, p_user_id;
  if old_role is null then raise exception 'Usuário não encontrado no grupo'; end if;
  if old_role = p_role then return; end if;
  if old_role = 'admin' then
    if p_user_id = auth.uid() then raise exception 'Você não pode tirar sua própria função de administrador'; end if;
    execute format('select count(*) <= 1 from public.memberships where group_id = $1 and %I = ''admin''', col)
      into last_admin using p_group_id;
    if last_admin then raise exception 'O módulo precisa manter pelo menos um administrador'; end if;
  end if;
  execute format('update public.memberships set %I = $3 where group_id = $1 and user_id = $2', col)
    using p_group_id, p_user_id, p_role;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.role_changed', 'user', p_user_id::text,
    jsonb_build_object('module', p_module, 'from', old_role, 'to', p_role));
  perform public.members_drop_if_empty(p_group_id, p_user_id);
end;
$$;

/** Tira o acesso de alguém aos módulos que quem chama administra; sem acesso em nenhum, a pessoa sai do grupo.
 * Devolve verdadeiro quando a pessoa saiu do grupo. */
create function public.admin_remove_member(p_group_id uuid, p_user_id uuid) returns boolean
  language plpgsql security definer set search_path to '' as $$
declare m public.memberships%rowtype; module text;
begin
  if not public.is_any_module_admin(p_group_id) then raise exception 'Apenas administradores podem remover usuários'; end if;
  if p_user_id = auth.uid() then raise exception 'Você não pode remover seu próprio acesso'; end if;
  select * into m from public.memberships where group_id = p_group_id and user_id = p_user_id;
  if not found then raise exception 'Usuário não encontrado no grupo'; end if;
  foreach module in array array['finance', 'inventory', 'associates'] loop
    if public.module_role_of(p_group_id, module) = 'admin' then
      -- sem a regra "último administrador" aqui: quem chama administra o módulo e continua nele
      execute format('update public.memberships set %I = ''none'' where group_id = $1 and user_id = $2', module || '_role')
        using p_group_id, p_user_id;
    end if;
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.access_removed', 'user', p_user_id::text, jsonb_build_object(
    'finance_role', m.finance_role, 'inventory_role', m.inventory_role, 'associates_role', m.associates_role));
  return public.members_drop_if_empty(p_group_id, p_user_id);
end;
$$;

/** Liga (ou desliga, com nulo) o acesso de uma pessoa ao cadastro dela como associado adulto: administrador do
 * Associados. */
create or replace function public.admin_link_member_associate(p_group_id uuid, p_user_id uuid, p_associate_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare old_associate uuid; a record;
begin
  if public.associates_role_of(p_group_id) <> 'admin' then
    raise exception 'Apenas o administrador do Associados liga o acesso ao associado';
  end if;
  select m.associate_id into old_associate from public.memberships m where m.group_id = p_group_id and m.user_id = p_user_id for update;
  if not found then raise exception 'Usuário não encontrado no grupo'; end if;
  if p_associate_id is not distinct from old_associate then return; end if;
  if p_associate_id is not null then
    select id, branch into a from public.associates where id = p_associate_id and group_id = p_group_id;
    if not found then raise exception 'Associado não encontrado no grupo'; end if;
    if a.branch <> 'adulto' then raise exception 'Só um associado adulto pode ser ligado a um acesso'; end if;
    if exists (select 1 from public.memberships where group_id = p_group_id and associate_id = p_associate_id and user_id <> p_user_id) then
      raise exception 'Este associado já está ligado a outro acesso';
    end if;
  end if;
  update public.memberships set associate_id = p_associate_id where group_id = p_group_id and user_id = p_user_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'user.associate_linked', 'user', p_user_id::text,
    jsonb_build_object('from', old_associate, 'to', p_associate_id));
end;
$$;

/** Primeiro acesso de um grupo novo: administrador nos três módulos. */
create or replace function public.admin_bootstrap_group(p_admin_email text, p_group_name text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare admin_id uuid; new_group_id uuid;
begin
  select id into admin_id from auth.users where lower(email) = lower(trim(p_admin_email));
  if admin_id is null then raise exception 'Crie e confirme o usuário administrativo antes de iniciar o grupo'; end if;
  if exists (select 1 from public.memberships where user_id = admin_id) then raise exception 'Usuário já pertence a um grupo'; end if;
  insert into public.groups(name) values (trim(p_group_name)) returning id into new_group_id;
  insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
  values (new_group_id, admin_id, 'admin', 'admin', 'admin');
  perform public.seed_categories(new_group_id);
  perform public.seed_payment_methods(new_group_id);
  perform public.seed_accounts(new_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (new_group_id, admin_id, 'group.bootstrapped', 'group', new_group_id::text, jsonb_build_object('name', trim(p_group_name)));
  return new_group_id;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['group_users(uuid)', 'admin_add_member(uuid,text,public.module_role,public.module_role,public.module_role)',
    'admin_set_module_role(uuid,uuid,text,public.module_role)', 'admin_remove_member(uuid,uuid)'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
  revoke all on function public.members_drop_if_empty(uuid, uuid) from public;
  revoke all on function public.ledger_entries_contributor_review() from public;
  revoke all on function public.associates_contributor_review() from public;
  revoke all on function public.associates_contributor_touch() from public;
end;
$$;
