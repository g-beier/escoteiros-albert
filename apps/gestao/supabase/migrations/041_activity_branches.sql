-- Seções da atividade (ramos): lobinho (amarelo), escoteiro (verde), sênior (grená), pioneiro (vermelho).
-- Uma atividade pode ser de várias seções (ex.: acampamento do grupo).

alter table public.activities
  add column branches public.scout_branch[] not null default '{}';

alter table public.activities
  add constraint activities_branches_sections
  check (branches <@ array['lobinho', 'escoteiro', 'senior', 'pioneiro']::public.scout_branch[]);

drop function public.activity_save(uuid, uuid, public.activity_kind, text, date, date, time, time, jsonb, jsonb, uuid[], text[]);

create or replace function public.activity_save(
  p_group_id uuid,
  p_id uuid,
  p_kind public.activity_kind,
  p_title text,
  p_starts_on date,
  p_ends_on date,
  p_start_time time,
  p_end_time time,
  p_schedule jsonb default '[]'::jsonb,
  p_authorization jsonb default null,
  p_attendance uuid[] default '{}',
  p_plan_actions text[] default '{}',
  p_branches public.scout_branch[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
declare v_branches public.scout_branch[];
begin
  if not public.can_edit_activities(p_group_id) then raise exception 'Sem permissão para editar atividades'; end if;
  v_branches := coalesce(p_branches, '{}');
  if cardinality(v_branches) = 0 then raise exception 'Escolha ao menos uma seção'; end if;
  if exists (
    select 1 from unnest(v_branches) b
    where b not in ('lobinho', 'escoteiro', 'senior', 'pioneiro')
  ) then raise exception 'Seção inválida'; end if;

  if p_id is null then
    insert into public.activities(group_id, kind, title, starts_on, ends_on, start_time, end_time, schedule, authorization_doc, attendance, plan_actions, branches, created_by)
    values (p_group_id, p_kind, nullif(trim(p_title), ''), p_starts_on, p_ends_on, p_start_time, p_end_time,
      coalesce(p_schedule, '[]'::jsonb), p_authorization, coalesce(p_attendance, '{}'), coalesce(p_plan_actions, '{}'),
      v_branches, auth.uid())
    returning id into v_id;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'activity.created', 'activity', v_id::text,
      jsonb_build_object('kind', p_kind, 'starts_on', p_starts_on, 'branches', to_jsonb(v_branches)));
  else
    update public.activities set
      kind = p_kind,
      title = nullif(trim(p_title), ''),
      starts_on = p_starts_on,
      ends_on = p_ends_on,
      start_time = p_start_time,
      end_time = p_end_time,
      schedule = coalesce(p_schedule, schedule),
      authorization_doc = p_authorization,
      attendance = coalesce(p_attendance, attendance),
      plan_actions = coalesce(p_plan_actions, plan_actions),
      branches = v_branches
    where id = p_id and group_id = p_group_id
    returning id into v_id;
    if v_id is null then raise exception 'Atividade não encontrada'; end if;
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (p_group_id, auth.uid(), 'activity.updated', 'activity', v_id::text,
      jsonb_build_object('kind', p_kind, 'starts_on', p_starts_on, 'branches', to_jsonb(v_branches)));
  end if;
  return v_id;
end;
$$;

revoke all on function public.activity_save(uuid, uuid, public.activity_kind, text, date, date, time, time, jsonb, jsonb, uuid[], text[], public.scout_branch[]) from public, anon;
grant execute on function public.activity_save(uuid, uuid, public.activity_kind, text, date, date, time, time, jsonb, jsonb, uuid[], text[], public.scout_branch[]) to authenticated;
