-- Associados: a função de escotista é de uma seção (o escotista conta na seção, como os jovens); funções podem ser
-- editadas (tipo, seção, cargo, início e fim) e a passagem é só de jovens (adulto não muda de ramo, seção ou equipe).
-- Funções antigas de escotista sem seção continuam valendo; a seção é exigida ao adicionar ou editar.

alter table public.associate_functions add column section_id uuid references public.sections(id) on delete restrict;
alter table public.associate_functions add constraint associate_functions_section_only_scouter check (kind = 'escotista' or section_id is null);
create index associate_functions_section_idx on public.associate_functions(section_id);

-- Visão com a seção (id e nome) no fim.
create or replace view public.associate_function_rows with (security_invoker = true) as
select f.id, f.group_id, f.associate_id, a.name as associate_name, f.kind, f.title, f.started_on, f.ended_on,
  (f.ended_on is null or f.ended_on > current_date) as active, f.created_at,
  f.section_id, s.name as section
from public.associate_functions f
join public.associates a on a.id = f.associate_id
left join public.sections s on s.id = f.section_id;

create or replace function public.associate_function_snapshot(p_function_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('associate_id', f.associate_id, 'kind', f.kind, 'section_id', f.section_id, 'title', f.title,
    'started_on', f.started_on, 'ended_on', f.ended_on)
  from public.associate_functions f where f.id = p_function_id;
$$;

-- Seção da função: obrigatória no escotista (seção ativa do grupo, ou a atual da função), proibida no dirigente.
create function public.associates_check_function_section(p_group_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_current uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_kind = 'escotista' then
    if p_section_id is null then raise exception 'Escolha a seção do escotista'; end if;
    if not exists (select 1 from public.sections where id = p_section_id and group_id = p_group_id and (active or id = p_current)) then
      raise exception 'Seção não encontrada ou inativa';
    end if;
  elsif p_section_id is not null then
    raise exception 'Só a função de escotista tem seção';
  end if;
end;
$$;

-- Mesma função ativa (tipo, seção e cargo) já cadastrada para o associado, fora `p_except`.
create function public.associates_function_taken(p_associate_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text, p_except uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.associate_functions where associate_id = p_associate_id and kind = p_kind
    and section_id is not distinct from p_section_id and lower(coalesce(title, '')) = lower(coalesce(p_title, ''))
    and (ended_on is null or ended_on > current_date) and id is distinct from p_except);
$$;

drop function public.associates_add_function(uuid, public.associate_function_kind, text, date);
create function public.associates_add_function(p_associate_id uuid, p_kind public.associate_function_kind, p_title text, p_started_on date, p_section_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; new_id uuid; clean_title text := nullif(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch <> 'adulto' then raise exception 'Só adultos têm função'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes de adicionar função'; end if;
  if p_kind is null then raise exception 'Escolha o tipo da função'; end if;
  perform public.associates_check_function_section(a.group_id, p_kind, p_section_id, null);
  if char_length(clean_title) > 80 then raise exception 'Cargo: no máximo 80 caracteres'; end if;
  if p_started_on > current_date then raise exception 'O início da função não pode ser futuro'; end if;
  if public.associates_function_taken(a.id, p_kind, p_section_id, clean_title, null) then raise exception 'O associado já tem esta função ativa'; end if;
  insert into public.associate_functions(group_id, associate_id, kind, section_id, title, started_on, created_by)
  values (a.group_id, a.id, p_kind, p_section_id, clean_title, p_started_on, auth.uid())
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.function_added', 'associate', a.id::text, public.associate_function_snapshot(new_id));
  return new_id;
end;
$$;

-- Edição da função (corrige tipo, seção, cargo e datas; fim vazio = em exercício).
create function public.associates_update_function(p_function_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text,
  p_started_on date, p_ended_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.associate_functions%rowtype; a public.associates%rowtype; before_state jsonb;
  clean_title text := nullif(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
begin
  select * into f from public.associate_functions where id = p_function_id for update;
  if f.id is null or not public.can_manage_associates(f.group_id) then raise exception 'Função não encontrada ou sem permissão'; end if;
  select * into a from public.associates where id = f.associate_id;
  if a.branch <> 'adulto' then raise exception 'Só adultos têm função'; end if;
  if p_kind is null then raise exception 'Escolha o tipo da função'; end if;
  perform public.associates_check_function_section(f.group_id, p_kind, p_section_id, f.section_id);
  if char_length(clean_title) > 80 then raise exception 'Cargo: no máximo 80 caracteres'; end if;
  if p_started_on > current_date then raise exception 'O início da função não pode ser futuro'; end if;
  if p_ended_on > current_date then raise exception 'O término da função não pode ser futuro'; end if;
  if p_ended_on < p_started_on then raise exception 'O término não pode ser antes do início (%)', to_char(p_started_on, 'DD/MM/YYYY'); end if;
  if (p_ended_on is null or p_ended_on > current_date) and public.associates_function_taken(a.id, p_kind, p_section_id, clean_title, f.id) then
    raise exception 'O associado já tem esta função ativa';
  end if;
  before_state := public.associate_function_snapshot(f.id);
  update public.associate_functions set kind = p_kind, section_id = p_section_id, title = clean_title, started_on = p_started_on, ended_on = p_ended_on
  where id = f.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (f.group_id, auth.uid(), 'associate.function_updated', 'associate', f.associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.associate_function_snapshot(f.id)));
end;
$$;

-- Passagem: só de jovens (o Pioneiro passa a Adulto por aqui; adulto não tem passagem).
create or replace function public.associates_move(p_associate_id uuid, p_date date, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; new_id uuid;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch = 'adulto' then raise exception 'Passagem é só de jovens'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes da passagem'; end if;
  if p_date is null then raise exception 'Informe a data da passagem'; end if;
  if p_date > current_date then raise exception 'A data da passagem não pode ser futura'; end if;
  perform public.associates_check_placement(a.group_id, p_branch, p_section_id, p_patrol_id);
  if a.branch = p_branch and a.section_id is not distinct from p_section_id and a.patrol_id is not distinct from p_patrol_id then
    raise exception 'A passagem não muda ramo, seção nem equipe';
  end if;
  insert into public.associate_moves(group_id, associate_id, move_date, from_branch, to_branch, from_section_id, to_section_id, to_patrol_id, created_by)
  values (a.group_id, a.id, p_date, a.branch, p_branch, a.section_id, p_section_id, p_patrol_id, auth.uid())
  returning id into new_id;
  update public.associates set branch = p_branch, section_id = p_section_id, patrol_id = p_patrol_id, updated_at = now() where id = a.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.moved', 'associate', a.id::text,
    jsonb_build_object('date', p_date, 'from_branch', a.branch, 'to_branch', p_branch, 'from_section_id', a.section_id,
      'to_section_id', p_section_id, 'from_patrol_id', a.patrol_id, 'to_patrol_id', p_patrol_id));
  return new_id;
end;
$$;

revoke all on function public.associates_check_function_section(uuid, public.associate_function_kind, uuid, uuid) from public, anon, authenticated;
revoke all on function public.associates_function_taken(uuid, public.associate_function_kind, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.associates_add_function(uuid, public.associate_function_kind, text, date, uuid) from public, anon;
revoke all on function public.associates_update_function(uuid, public.associate_function_kind, uuid, text, date, date) from public, anon;
grant execute on function public.associates_add_function(uuid, public.associate_function_kind, text, date, uuid) to authenticated;
grant execute on function public.associates_update_function(uuid, public.associate_function_kind, uuid, text, date, date) to authenticated;
