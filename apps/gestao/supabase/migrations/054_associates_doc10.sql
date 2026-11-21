-- Associados: dados do Doc 10 (Lista simples de efetivo). Registro provisório ou definitivo; apelido curto (até 8
-- caracteres, para "Ver Manu" nos relatórios); marca "eleito" na função de dirigente; tipos de função Colaborador e
-- Contribuinte (bloco "Outros" do Doc 10, com Honorífico e Comissão Fiscal).

alter type public.associate_function_kind add value if not exists 'colaborador';
alter type public.associate_function_kind add value if not exists 'contribuinte';

create type public.associate_registration as enum ('provisorio', 'definitivo');
-- quem já está cadastrado é definitivo; daqui para frente (cadastro, registro rápido, importação) começa provisório
alter table public.associates add column registration public.associate_registration not null default 'definitivo';
alter table public.associates alter column registration set default 'provisorio';
alter table public.associates add column nickname text check (char_length(nickname) between 1 and 8);

alter table public.associate_functions add column elected boolean not null default false;
alter table public.associate_functions add constraint associate_functions_elected_board check (not elected or kind = 'dirigente');

create or replace function public.associate_snapshot(p_associate_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', a.name, 'branch', a.branch, 'section_id', a.section_id, 'patrol_id', a.patrol_id,
    'active', a.active, 'birth_date', a.birth_date, 'promise_date', a.promise_date, 'joined_on', a.joined_on, 'notes', a.notes,
    'registration', a.registration, 'nickname', a.nickname)
  from public.associates a where a.id = p_associate_id;
$$;

create or replace function public.associate_function_snapshot(p_function_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('associate_id', f.associate_id, 'kind', f.kind, 'section_id', f.section_id, 'title', f.title,
    'started_on', f.started_on, 'ended_on', f.ended_on, 'elected', f.elected)
  from public.associate_functions f where f.id = p_function_id;
$$;

-- Dados pessoais, registro e apelido. Ramo, seção e equipe só mudam por passagem (associates_move).
drop function public.associates_update(uuid, text, date, date, date, text);
create function public.associates_update(p_associate_id uuid, p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text,
  p_registration public.associate_registration, p_nickname text)
returns void language plpgsql security definer set search_path = '' as $$
declare associate_group uuid; before_state jsonb; clean_name text; clean_nickname text := nullif(trim(coalesce(p_nickname, '')), '');
begin
  select group_id into associate_group from public.associates where id = p_associate_id for update;
  if associate_group is null or not public.can_manage_associates(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  clean_name := public.associates_check_details(p_name, p_birth_date, p_promise_date, p_joined_on, p_notes);
  if p_registration is null then raise exception 'Escolha o registro (provisório ou definitivo)'; end if;
  if char_length(clean_nickname) > 8 then raise exception 'Apelido: no máximo 8 caracteres'; end if;
  before_state := public.associate_snapshot(p_associate_id);
  update public.associates set name = clean_name, birth_date = p_birth_date, promise_date = p_promise_date,
    joined_on = p_joined_on, notes = nullif(trim(p_notes), ''), registration = p_registration, nickname = clean_nickname, updated_at = now()
  where id = p_associate_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'associate.updated', 'associate', p_associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.associate_snapshot(p_associate_id)));
end;
$$;

drop function public.associates_add_function(uuid, public.associate_function_kind, text, date, uuid);
create function public.associates_add_function(p_associate_id uuid, p_kind public.associate_function_kind, p_title text, p_started_on date,
  p_section_id uuid default null, p_elected boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; new_id uuid; clean_title text := nullif(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch <> 'adulto' then raise exception 'Só adultos têm função'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes de adicionar função'; end if;
  if p_kind is null then raise exception 'Escolha o tipo da função'; end if;
  perform public.associates_check_function_section(a.group_id, p_kind, p_section_id, null);
  if coalesce(p_elected, false) and p_kind <> 'dirigente' then raise exception 'Só a função de dirigente é eleita'; end if;
  if char_length(clean_title) > 80 then raise exception 'Cargo: no máximo 80 caracteres'; end if;
  if p_started_on > current_date then raise exception 'O início da função não pode ser futuro'; end if;
  if public.associates_function_taken(a.id, p_kind, p_section_id, clean_title, null) then raise exception 'O associado já tem esta função ativa'; end if;
  insert into public.associate_functions(group_id, associate_id, kind, section_id, title, started_on, elected, created_by)
  values (a.group_id, a.id, p_kind, p_section_id, clean_title, p_started_on, coalesce(p_elected, false), auth.uid())
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.function_added', 'associate', a.id::text, public.associate_function_snapshot(new_id));
  return new_id;
end;
$$;

drop function public.associates_update_function(uuid, public.associate_function_kind, uuid, text, date, date);
create function public.associates_update_function(p_function_id uuid, p_kind public.associate_function_kind, p_section_id uuid, p_title text,
  p_started_on date, p_ended_on date, p_elected boolean default false)
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
  if coalesce(p_elected, false) and p_kind <> 'dirigente' then raise exception 'Só a função de dirigente é eleita'; end if;
  if char_length(clean_title) > 80 then raise exception 'Cargo: no máximo 80 caracteres'; end if;
  if p_started_on > current_date then raise exception 'O início da função não pode ser futuro'; end if;
  if p_ended_on > current_date then raise exception 'O término da função não pode ser futuro'; end if;
  if p_ended_on < p_started_on then raise exception 'O término não pode ser antes do início (%)', to_char(p_started_on, 'DD/MM/YYYY'); end if;
  if (p_ended_on is null or p_ended_on > current_date) and public.associates_function_taken(a.id, p_kind, p_section_id, clean_title, f.id) then
    raise exception 'O associado já tem esta função ativa';
  end if;
  before_state := public.associate_function_snapshot(f.id);
  update public.associate_functions set kind = p_kind, section_id = p_section_id, title = clean_title, started_on = p_started_on,
    ended_on = p_ended_on, elected = coalesce(p_elected, false)
  where id = f.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (f.group_id, auth.uid(), 'associate.function_updated', 'associate', f.associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.associate_function_snapshot(f.id)));
end;
$$;

-- Visões com os campos novos no fim.
create or replace view public.associate_profile_rows with (security_invoker = true) as
select r.id, r.group_id, r.name, r.branch, r.active,
  r.section_id, r.section, r.patrol_id, r.patrol,
  r.created_at, r.updated_at,
  a.birth_date, a.promise_date, a.joined_on, a.notes,
  case when r.active then null else (
    select max(m.movement_date) from public.associate_movements m where m.associate_id = r.id and m.kind = 'saida'
  ) end as left_on,
  a.review_status,
  a.transition_started_on,
  a.registration,
  a.nickname
from public.associate_rows r
join public.associates a on a.id = r.id;

create or replace view public.associate_function_rows with (security_invoker = true) as
select f.id, f.group_id, f.associate_id, a.name as associate_name, f.kind, f.title, f.started_on, f.ended_on,
  (f.ended_on is null or f.ended_on > current_date) as active, f.created_at,
  f.section_id, s.name as section,
  f.elected
from public.associate_functions f
join public.associates a on a.id = f.associate_id
left join public.sections s on s.id = f.section_id;

revoke all on function public.associates_update(uuid, text, date, date, date, text, public.associate_registration, text) from public, anon;
revoke all on function public.associates_add_function(uuid, public.associate_function_kind, text, date, uuid, boolean) from public, anon;
revoke all on function public.associates_update_function(uuid, public.associate_function_kind, uuid, text, date, date, boolean) from public, anon;
grant execute on function public.associates_update(uuid, text, date, date, date, text, public.associate_registration, text) to authenticated;
grant execute on function public.associates_add_function(uuid, public.associate_function_kind, text, date, uuid, boolean) to authenticated;
grant execute on function public.associates_update_function(uuid, public.associate_function_kind, uuid, text, date, date, boolean) to authenticated;
