-- 016 — Controle de dados: as situações seguem o público do item e o da pessoa.
--
-- Antes, ao tirar um público de um item (ex.: o item deixa de valer para jovens), as situações já gravadas desse
-- público ficavam e apareciam como pendentes na matriz. Agora:
--   * item deixa de se aplicar a um público  → apaga as situações desse público no item;
--   * item passa a se aplicar a um público   → cria a situação inicial (se houver) das pessoas ativas desse público;
--   * pessoa muda de público (ramo ↔ adulto) → a mesma regra, só para ela.
-- "A remover" nunca é apagado: é uma ação pendente (tirar a pessoa de um sistema/canal), que segue visível.

/** Apaga as situações do item para um público (menos "a remover"). Devolve quantas apagou. */
create function public.control_statuses_drop_audience(p_item_id uuid, p_audience public.control_audience) returns integer
  language plpgsql security definer set search_path to '' as $$
declare dropped int;
begin
  if p_audience = 'responsavel' then
    delete from public.control_statuses s
    where s.item_id = p_item_id and s.status <> 'a_remover' and s.relative_id is not null;
  else
    delete from public.control_statuses s
    using public.associates a
    where s.item_id = p_item_id and s.status <> 'a_remover' and a.id = s.associate_id
      and (a.branch = 'adulto') = (p_audience = 'adulto');
  end if;
  get diagnostics dropped = row_count;
  return dropped;
end;
$$;

/** Cria a situação inicial do item para as pessoas ativas de um público (as que já têm situação ficam). Devolve quantas criou. */
create function public.control_statuses_init_audience(p_item_id uuid, p_audience public.control_audience) returns integer
  language plpgsql security definer set search_path to '' as $$
declare i public.control_items%rowtype; initial public.control_status; created int;
begin
  select * into i from public.control_items where id = p_item_id;
  select initial_status into initial from public.control_item_audiences where item_id = p_item_id and audience = p_audience;
  if i.id is null or not i.active or initial is null then return 0; end if;
  if p_audience = 'responsavel' then
    -- Responsável que não é associado ativo (quem é associado ativo é controlado como adulto), de algum jovem ativo.
    insert into public.control_statuses(group_id, associate_id, relative_id, item_id, status, status_date, valid_until, updated_by, updated_at)
    select i.group_id, null, r.id, i.id, initial, current_date,
      case when initial = 'ok' and i.validity_months is not null then (current_date + make_interval(months => i.validity_months))::date end,
      auth.uid(), now()
    from public.relatives r
    where r.group_id = i.group_id
      and not exists (select 1 from public.associates a where a.id = r.associate_id and a.active)
      and exists (select 1 from public.relative_links l join public.associates y on y.id = l.associate_id where l.relative_id = r.id and y.active)
    on conflict do nothing;
  else
    insert into public.control_statuses(group_id, associate_id, relative_id, item_id, status, status_date, valid_until, updated_by, updated_at)
    select i.group_id, a.id, null, i.id, initial, current_date,
      case when initial = 'ok' and i.validity_months is not null then (current_date + make_interval(months => i.validity_months))::date end,
      auth.uid(), now()
    from public.associates a
    where a.group_id = i.group_id and a.active and (a.branch = 'adulto') = (p_audience = 'adulto')
    on conflict do nothing;
  end if;
  get diagnostics created = row_count;
  return created;
end;
$$;

revoke all on function public.control_statuses_drop_audience(uuid, public.control_audience) from public;
revoke all on function public.control_statuses_init_audience(uuid, public.control_audience) from public;

create or replace function public.control_item_update(p_item_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate, p_audiences jsonb, p_validity_months integer, p_remove_on_leave boolean, p_active boolean, p_value_kind public.control_value_kind DEFAULT NULL::public.control_value_kind) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare item public.control_items%rowtype; before_state jsonb; clean_name text;
  old_audiences public.control_audience[]; new_audiences public.control_audience[]; aud public.control_audience;
  dropped int := 0; created int := 0;
begin
  select * into item from public.control_items where id = p_item_id for update;
  if item.id is null or not public.can_manage_associates(item.group_id) then raise exception 'Item não encontrado ou sem permissão'; end if;
  clean_name := public.control_item_check(item.group_id, item.id, p_name, p_kind, p_directorate, p_audiences, p_validity_months);
  before_state := public.control_item_snapshot(item.id);
  old_audiences := array(select audience from public.control_item_audiences where item_id = item.id);
  update public.control_items set name = clean_name, kind = p_kind, value_kind = coalesce(p_value_kind, value_kind), directorate = p_directorate,
    validity_months = p_validity_months,
    remove_on_leave = coalesce(p_remove_on_leave, remove_on_leave), active = coalesce(p_active, active),
    position = case when p_directorate = item.directorate then position
      else (select coalesce(max(position), 0) + 1 from public.control_items where group_id = item.group_id and directorate = p_directorate) end,
    updated_at = now()
  where id = item.id;
  perform public.control_item_save_audiences(item.id, item.group_id, p_audiences);
  new_audiences := array(select audience from public.control_item_audiences where item_id = item.id);
  foreach aud in array old_audiences loop
    if not aud = any(new_audiences) then dropped := dropped + public.control_statuses_drop_audience(item.id, aud); end if;
  end loop;
  foreach aud in array new_audiences loop
    if not aud = any(old_audiences) then created := created + public.control_statuses_init_audience(item.id, aud); end if;
  end loop;
  if p_directorate <> item.directorate then perform public.control_items_renumber(item.group_id, item.directorate); end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (item.group_id, auth.uid(), 'control_item.updated', 'control_item', item.id::text,
    jsonb_build_object('before', before_state, 'after', public.control_item_snapshot(item.id))
      || case when dropped + created > 0 then jsonb_build_object('statuses_dropped', dropped, 'statuses_created', created) else '{}'::jsonb end);
end;
$$;

/** Pessoa que muda de público (ramo ↔ adulto): apaga as situações dos itens que não valem mais para ela (menos
 * "a remover") e cria a situação inicial dos que passam a valer. */
create function public.associates_follow_audience() returns trigger
  language plpgsql security definer set search_path to '' as $$
declare target public.control_audience := case when new.branch = 'adulto' then 'adulto' else 'jovem' end;
begin
  if (old.branch = 'adulto') = (new.branch = 'adulto') then return null; end if;
  delete from public.control_statuses s
  where s.associate_id = new.id and s.status <> 'a_remover'
    and not exists (select 1 from public.control_item_audiences a where a.item_id = s.item_id and a.audience = target);
  if new.active then perform public.control_statuses_init(new.group_id, new.id, null, target); end if;
  return null;
end;
$$;

revoke all on function public.associates_follow_audience() from public;

create trigger associates_follow_audience after update of branch on public.associates
  for each row execute function public.associates_follow_audience();

-- Limpeza do que já ficou para trás: situações de itens que não se aplicam ao público atual da pessoa.
delete from public.control_statuses s
using public.associates p
where p.id = s.associate_id and s.status <> 'a_remover'
  and not exists (select 1 from public.control_item_audiences a where a.item_id = s.item_id
                  and a.audience = case when p.branch = 'adulto' then 'adulto'::public.control_audience else 'jovem'::public.control_audience end);

delete from public.control_statuses s
where s.relative_id is not null and s.status <> 'a_remover'
  and not exists (select 1 from public.control_item_audiences a where a.item_id = s.item_id and a.audience = 'responsavel');
