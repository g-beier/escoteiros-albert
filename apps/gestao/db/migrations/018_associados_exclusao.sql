-- 018 — Excluir associado (cadastro errado, em duplicidade): quarentena de 60 dias e exclusão definitiva.
--
-- Até aqui só dava para desligar: o cadastro errado ficava inativo para sempre. Agora o Editor do Associados pede a
-- exclusão (com motivo); o associado some de todas as telas na hora (RLS), fica 60 dias em quarentena, quando o
-- Editor ainda pode restaurá-lo (Configurações › Excluídos), e depois é apagado de vez pela manutenção diária
-- (`associates_purge_due`, comando `purge` de scripts/maintenance.mjs), com tudo o que é só dele (funções,
-- movimentos, controle, vida escoteira, mensalidades; responsáveis que ficarem sem jovem).
-- Não exclui quem tem lançamento financeiro ou dívida (move-se antes para o associado certo) nem quem está ligado
-- a um acesso (desvincula-se antes em Usuários).

alter table public.associates
  add column deletion_due_on date,
  add column deletion_requested_at timestamp with time zone,
  add column deletion_requested_by uuid references auth.users(id) on delete set null,
  add column deletion_reason text check (char_length(deletion_reason) <= 200),
  add constraint associates_deletion_complete check ((deletion_due_on is null) = (deletion_requested_at is null));

create index associates_deletion_due_idx on public.associates(deletion_due_on) where deletion_due_on is not null;

/** Dias de quarentena antes da exclusão definitiva (espelhado em lib/associates/model.ts, DELETION_DAYS). */
create function public.associates_deletion_days() returns integer
  language sql immutable set search_path to '' as $$ select 60 $$;

/** O associado está em quarentena (pedido de exclusão): esconde as linhas dele nas tabelas que o referenciam. */
create function public.associate_quarantined(p_associate_id uuid) returns boolean
  language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.associates where id = p_associate_id and deletion_due_on is not null);
$$;
revoke all on function public.associate_quarantined(uuid) from public;
grant execute on function public.associate_quarantined(uuid) to authenticated;

-- Leitura: some o associado em quarentena e o que é dele. -------------------------------------------------------------

alter policy "members read associates" on public.associates
  using (public.can_read_associates(group_id) and deletion_due_on is null);
alter policy "editors manage associates" on public.associates
  using (public.can_edit_group(group_id) and deletion_due_on is null)
  with check (public.can_edit_group(group_id) and deletion_due_on is null);

do $$
declare p record;
begin
  for p in
    select policyname, tablename, qual from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and tablename in (
      'associate_functions', 'associate_movements', 'associate_moves', 'associate_life_periods', 'associate_life_events',
      'associate_life_exclusions', 'associate_stars', 'control_statuses', 'relative_links',
      'fee_associate_prices', 'fee_exemptions', 'fee_records')
  loop
    execute format('alter policy %I on public.%I using ((%s) and (associate_id is null or not public.associate_quarantined(associate_id)))',
      p.policyname, p.tablename, p.qual);
  end loop;
end;
$$;

-- Pedir, cancelar, listar ----------------------------------------------------------------------------------------------

/** Pede a exclusão: some das telas na hora e é apagado de vez depois da quarentena. Só Editor do Associados. */
create function public.associates_request_deletion(p_associate_id uuid, p_reason text) returns date
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; clean_reason text := nullif(regexp_replace(trim(coalesce(p_reason, '')), '\s+', ' ', 'g'), ''); due date;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.deletion_due_on is not null then raise exception 'A exclusão deste associado já foi pedida'; end if;
  if clean_reason is null then raise exception 'Informe o motivo da exclusão'; end if;
  if char_length(clean_reason) > 200 then raise exception 'Motivo: no máximo 200 caracteres'; end if;
  if exists (select 1 from public.entry_splits where associate_id = a.id) or exists (select 1 from public.debts where associate_id = a.id) then
    raise exception 'Tem lançamentos ou dívidas no Financeiro: mova-os para o associado correto (Detalhamento) antes de excluir';
  end if;
  if exists (select 1 from public.memberships where associate_id = a.id) then
    raise exception 'Está ligado a um acesso: desvincule em Usuários antes de excluir';
  end if;
  due := current_date + public.associates_deletion_days();
  update public.associates set deletion_due_on = due, deletion_requested_at = now(), deletion_requested_by = auth.uid(),
    deletion_reason = clean_reason, updated_at = now()
  where id = a.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.deletion_requested', 'associate', a.id::text,
    public.associate_snapshot(a.id) || jsonb_build_object('reason', clean_reason, 'due_on', due));
  return due;
end;
$$;

/** Desiste da exclusão durante a quarentena: o associado volta como estava. Só Editor do Associados. */
create function public.associates_cancel_deletion(p_associate_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.deletion_due_on is null then raise exception 'Este associado não está na lista de exclusão'; end if;
  update public.associates set deletion_due_on = null, deletion_requested_at = null, deletion_requested_by = null, deletion_reason = null,
    updated_at = now()
  where id = a.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.deletion_canceled', 'associate', a.id::text,
    jsonb_build_object('name', a.name, 'reason', a.deletion_reason, 'due_on', a.deletion_due_on));
end;
$$;

/** Associados em quarentena do grupo (Configurações › Excluídos). Só Editor do Associados. */
create function public.associates_quarantine(p_group_id uuid)
  returns table(id uuid, name text, branch public.scout_branch, active boolean, deletion_due_on date,
    deletion_requested_at timestamp with time zone, requested_by text, deletion_reason text)
  language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão'; end if;
  return query
    select a.id, a.name, a.branch, a.active, a.deletion_due_on, a.deletion_requested_at, u.email::text, a.deletion_reason
    from public.associates a left join auth.users u on u.id = a.deletion_requested_by
    where a.group_id = p_group_id and a.deletion_due_on is not null
    order by a.deletion_due_on, a.name;
end;
$$;

/** Nomes em quarentena (importação: avisar quem cadastraria de novo alguém com exclusão pedida). Quem lê o Associados. */
create function public.associates_quarantined_names(p_group_id uuid) returns setof text
  language sql stable security definer set search_path to '' as $$
  select name from public.associates
  where group_id = p_group_id and deletion_due_on is not null and public.can_read_associates(p_group_id)
  order by name;
$$;
revoke all on function public.associates_quarantined_names(uuid) from public;
grant execute on function public.associates_quarantined_names(uuid) to authenticated;

-- Exclusão definitiva --------------------------------------------------------------------------------------------------

/** Apaga de vez quem passou da quarentena (manutenção diária, como dono do banco; sem grant para o app). Pula, sem
 * apagar, quem ganhou lançamento, dívida ou acesso no meio tempo. Responsáveis que ficarem sem jovem vão junto.
 * Devolve quantos apagou. */
create function public.associates_purge_due() returns integer
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; relative_ids uuid[]; purged int := 0;
begin
  for a in select * from public.associates where deletion_due_on <= current_date order by deletion_due_on for update skip locked loop
    if exists (select 1 from public.entry_splits where associate_id = a.id) or exists (select 1 from public.debts where associate_id = a.id)
      or exists (select 1 from public.memberships where associate_id = a.id) then
      insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
      values (a.group_id, null, 'associate.purge_skipped', 'associate', a.id::text,
        jsonb_build_object('name', a.name, 'why', 'lançamento, dívida ou acesso ligado'));
      continue;
    end if;
    relative_ids := array(select relative_id from public.relative_links where associate_id = a.id);
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (a.group_id, null, 'associate.deleted', 'associate', a.id::text,
      public.associate_snapshot(a.id) || jsonb_build_object('reason', a.deletion_reason, 'requested_at', a.deletion_requested_at,
        'requested_by', a.deletion_requested_by));
    delete from public.associates where id = a.id;
    delete from public.relatives r where r.id = any(relative_ids)
      and not exists (select 1 from public.relative_links l where l.relative_id = r.id);
    purged := purged + 1;
  end loop;
  return purged;
end;
$$;

revoke all on function public.associates_request_deletion(uuid, text) from public;
revoke all on function public.associates_cancel_deletion(uuid) from public;
revoke all on function public.associates_quarantine(uuid) from public;
revoke all on function public.associates_purge_due() from public;
grant execute on function public.associates_request_deletion(uuid, text) to authenticated;
grant execute on function public.associates_cancel_deletion(uuid) to authenticated;
grant execute on function public.associates_quarantine(uuid) to authenticated;
