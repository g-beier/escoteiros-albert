-- Associados: transição de ramo iniciada. As idades e os alertas (pensar na transição, já devia ter passado) ficam no
-- app (lib/associates/alerts.ts); aqui só a marca "começamos a transição" (ou, no Pioneiro, "partida programada"),
-- com a data. A marca vale para o ramo atual: a passagem (troca de ramo) e o desligamento a apagam sozinhos.

alter table public.associates add column transition_started_on date;

create function public.associates_clear_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.branch is distinct from old.branch or (old.active and not new.active) then new.transition_started_on := null; end if;
  return new;
end;
$$;
create trigger associates_clear_transition before update on public.associates
for each row execute function public.associates_clear_transition();

-- Marca (p_date) ou desmarca (null) a transição do jovem ativo.
create function public.associates_set_transition(p_associate_id uuid, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch = 'adulto' then raise exception 'Adultos não têm transição de ramo'; end if;
  if not a.active then raise exception 'O associado está desligado'; end if;
  if p_date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data de início não pode ser no futuro'; end if;
  update public.associates set transition_started_on = p_date, updated_at = now() where id = p_associate_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), case when p_date is null then 'associate.transition_cleared' else 'associate.transition_started' end,
    'associate', p_associate_id::text, jsonb_build_object('branch', a.branch, 'before', a.transition_started_on, 'after', p_date));
end;
$$;

-- Visão do cadastro (049) com transition_started_on no fim.
create or replace view public.associate_profile_rows with (security_invoker = true) as
select r.id, r.group_id, r.name, r.branch, r.active,
  r.section_id, r.section, r.patrol_id, r.patrol,
  r.created_at, r.updated_at,
  a.birth_date, a.promise_date, a.joined_on, a.notes,
  case when r.active then null else (
    select max(m.movement_date) from public.associate_movements m where m.associate_id = r.id and m.kind = 'saida'
  ) end as left_on,
  a.review_status,
  a.transition_started_on
from public.associate_rows r
join public.associates a on a.id = r.id;

revoke all on function public.associates_set_transition(uuid, date) from public, anon;
grant execute on function public.associates_set_transition(uuid, date) to authenticated;
