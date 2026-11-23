-- 002 — Papéis por módulo (docs/plano-go-live.md, seção 1).
--
-- * "Sem acesso" (`none`) no Financeiro (`memberships.role`) e no Associados (`memberships.associates_role`): os chefes
--   só usam o Inventário. A leitura de cada módulo passa a exigir acesso a ele (`can_read_finance`,
--   `can_read_associates`) em vez de só pertencer ao grupo; grupo, usuários, seções, equipes e inventário continuam
--   abertos a todo membro.
-- * Acesso ligado ao associado adulto (`memberships.associate_id`), escolhido pelo administrador em /usuarios.
-- * Avisos do Início para quem não lê o Associados: só os jovens das seções em que a pessoa é escotista
--   (`associates_section_alert_rows`).
--
-- Os valores novos dos enums não podem ser usados como literal na mesma transação em que são criados: aqui as
-- comparações com 'none' são feitas em texto.

alter type public.member_role add value if not exists 'none';
alter type public.associates_role add value if not exists 'none';

-- Leitura por módulo --------------------------------------------------------------------------------------------------

create function public.can_read_finance(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.memberships
    where group_id = p_group_id and user_id = auth.uid() and role::text <> 'none');
$$;

create function public.can_read_associates(p_group_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select coalesce(public.associates_role_of(p_group_id)::text <> 'none', false);
$$;

revoke all on function public.can_read_finance(uuid) from public;
revoke all on function public.can_read_associates(uuid) from public;
grant execute on function public.can_read_finance(uuid) to authenticated;
grant execute on function public.can_read_associates(uuid) to authenticated;

-- Políticas de leitura: troca `is_group_member(` pela checagem do módulo, mantendo o resto da expressão.
do $$
declare
  finance_tables text[] := array['accounts', 'categories', 'ledger_entries', 'entry_splits', 'entry_attachments',
    'payment_methods', 'import_profiles', 'statement_imports', 'statement_lines', 'reconciliation_links',
    'reconciliation_rejections', 'fee_settings', 'fee_year_settings', 'fee_records', 'fee_record_splits',
    'fee_exemptions', 'fee_associate_prices'];
  associates_tables text[] := array['associates', 'associate_functions', 'associate_movements', 'associate_moves',
    'relatives', 'relative_links', 'control_items', 'control_item_audiences', 'control_statuses'];
  p record;
  changed int := 0;
begin
  for p in
    select policyname, tablename, qual,
      case when tablename = any(finance_tables) then 'can_read_finance(' else 'can_read_associates(' end as check_fn
    from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and qual like '%is_group_member(%'
      and (tablename = any(finance_tables) or tablename = any(associates_tables))
  loop
    execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename,
      replace(p.qual, 'is_group_member(', p.check_fn));
    changed := changed + 1;
  end loop;
  if changed <> cardinality(finance_tables) + cardinality(associates_tables) then
    raise exception 'Esperava % políticas de leitura, achei %', cardinality(finance_tables) + cardinality(associates_tables), changed;
  end if;
end;
$$;

-- Funções de leitura do Financeiro que checavam só o grupo.
do $$
declare fn text;
begin
  foreach fn in array array['public.debt_rows(uuid)', 'public.ledger_entry_history(uuid)', 'public.can_read_attachment_object(text)'] loop
    execute replace(pg_get_functiondef(fn::regprocedure), 'public.is_group_member(', 'public.can_read_finance(');
  end loop;
end;
$$;

-- Acesso ligado ao associado ------------------------------------------------------------------------------------------

alter table public.memberships add column associate_id uuid references public.associates(id) on delete set null;
create unique index memberships_associate_idx on public.memberships(group_id, associate_id) where associate_id is not null;

/** Liga (ou desliga, com nulo) o acesso de uma pessoa ao cadastro dela como associado adulto. */
create function public.admin_link_member_associate(p_group_id uuid, p_user_id uuid, p_associate_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare old_associate uuid; a record;
begin
  if not exists (select 1 from public.memberships where group_id = p_group_id and user_id = auth.uid() and role = 'admin') then
    raise exception 'Apenas administradores podem alterar usuários';
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

revoke all on function public.admin_link_member_associate(uuid, uuid, uuid) from public;
grant execute on function public.admin_link_member_associate(uuid, uuid, uuid) to authenticated;

-- A tela de Usuários passa a mostrar o associado ligado.
drop function public.group_users(uuid);
create function public.group_users(p_group_id uuid)
  returns table(user_id uuid, email text, last_sign_in_at timestamp with time zone, role public.member_role,
    inventory_role public.inventory_role, associates_role public.associates_role, associate_id uuid)
  language plpgsql stable security definer set search_path to '' as $$
begin
  if not exists (select 1 from public.memberships m where m.group_id = p_group_id and m.user_id = auth.uid() and m.role = 'admin') then
    raise exception 'Apenas administradores do grupo gerenciam usuários';
  end if;
  return query
  select m.user_id, u.email, u.last_sign_in_at, m.role, m.inventory_role, m.associates_role, m.associate_id
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.group_id = p_group_id
  order by m.created_at, u.email;
end;
$$;

revoke all on function public.group_users(uuid) from public;
grant execute on function public.group_users(uuid) to authenticated;

-- Avisos por seção ----------------------------------------------------------------------------------------------------

/**
 * Jovens ativos das seções em que quem está logado é escotista hoje (função `escotista` em curso do associado ligado
 * ao acesso), só com o que os avisos do Início usam: aniversário, promessa e transição de ramo. Sem associado ligado
 * ou sem função de escotista: nada.
 */
create function public.associates_section_alert_rows(p_group_id uuid)
  returns table(id uuid, name text, active boolean, branch public.scout_branch, birth_date date, promise_date date,
    transition_started_on date)
  language sql stable security definer set search_path to '' as $$
  with my_sections as (
    select distinct f.section_id
    from public.memberships m
    join public.associates me on me.id = m.associate_id and me.active
    join public.associate_functions f on f.associate_id = me.id
    where m.group_id = p_group_id and m.user_id = auth.uid()
      and f.kind = 'escotista' and f.section_id is not null
      and (f.started_on is null or f.started_on <= current_date)
      and (f.ended_on is null or f.ended_on >= current_date)
  )
  select a.id, a.name, a.active, a.branch, a.birth_date, a.promise_date, a.transition_started_on
  from public.associates a
  where a.group_id = p_group_id and a.active and a.branch <> 'adulto'
    and a.section_id in (select section_id from my_sections)
  order by a.name;
$$;

revoke all on function public.associates_section_alert_rows(uuid) from public;
grant execute on function public.associates_section_alert_rows(uuid) to authenticated;
