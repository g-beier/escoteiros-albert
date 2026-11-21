-- Associados: correção da divisão × passagem.
-- Correção: a edição do cadastro (associates_update) também corrige ramo, seção e equipe, sem histórico de passagem
-- (só a auditoria `associate.updated`, com antes e depois). Serve para o cadastro feito só com o ramo, ou errado.
-- Passagem (associates_move): cerimônia que leva o jovem ao ramo seguinte (Lobinho → Escoteiro … Pioneiro → Adulto),
-- com data e registro em `associate_moves`; não serve para trocar seção ou equipe dentro do mesmo ramo.

-- Ramo seguinte na ordem do enum (Filhote, Lobinho, Escoteiro, Sênior, Pioneiro, Adulto); null depois do Adulto.
create function public.associates_next_branch(p_branch public.scout_branch)
returns public.scout_branch language sql immutable set search_path = '' as $$
  select min(b) from unnest(enum_range(null::public.scout_branch)) as b where b > p_branch;
$$;

-- Edição: dados pessoais, registro, apelido e (opcional) a divisão. `p_branch` nulo mantém ramo, seção e equipe.
drop function public.associates_update(uuid, text, date, date, date, text, public.associate_registration, text);
create function public.associates_update(p_associate_id uuid, p_name text, p_birth_date date, p_promise_date date, p_joined_on date, p_notes text,
  p_registration public.associate_registration, p_nickname text,
  p_branch public.scout_branch default null, p_section_id uuid default null, p_patrol_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; before_state jsonb; clean_name text; clean_nickname text := nullif(trim(coalesce(p_nickname, '')), '');
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  clean_name := public.associates_check_details(p_name, p_birth_date, p_promise_date, p_joined_on, p_notes);
  if p_registration is null then raise exception 'Escolha o registro (provisório ou definitivo)'; end if;
  if char_length(clean_nickname) > 8 then raise exception 'Apelido: no máximo 8 caracteres'; end if;
  if p_branch is not null then
    perform public.associates_check_placement(a.group_id, p_branch, p_section_id, p_patrol_id);
    if a.branch = 'adulto' and p_branch <> 'adulto' and exists (
      select 1 from public.associate_functions f where f.associate_id = a.id and (f.ended_on is null or f.ended_on > current_date)) then
      raise exception 'Adulto com função ativa: encerre as funções antes de mudar o ramo';
    end if;
  end if;
  before_state := public.associate_snapshot(p_associate_id);
  update public.associates set name = clean_name, birth_date = p_birth_date, promise_date = p_promise_date,
    joined_on = p_joined_on, notes = nullif(trim(p_notes), ''), registration = p_registration, nickname = clean_nickname,
    branch = coalesce(p_branch, branch),
    section_id = case when p_branch is null then section_id else p_section_id end,
    patrol_id = case when p_branch is null then patrol_id else p_patrol_id end,
    updated_at = now()
  where id = p_associate_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.updated', 'associate', p_associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.associate_snapshot(p_associate_id)));
end;
$$;

-- Passagem: só de jovens, só para o ramo seguinte (seção e equipe do novo ramo, opcionais).
create or replace function public.associates_move(p_associate_id uuid, p_date date, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; new_id uuid; next_branch public.scout_branch;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch = 'adulto' then raise exception 'Passagem é só de jovens'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes da passagem'; end if;
  if p_date is null then raise exception 'Informe a data da passagem'; end if;
  if p_date > current_date then raise exception 'A data da passagem não pode ser futura'; end if;
  next_branch := public.associates_next_branch(a.branch);
  if p_branch is distinct from next_branch then
    raise exception 'A passagem é para o ramo seguinte (%); para corrigir ramo, seção ou equipe, edite o cadastro', next_branch;
  end if;
  perform public.associates_check_placement(a.group_id, p_branch, p_section_id, p_patrol_id);
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

revoke all on function public.associates_next_branch(public.scout_branch) from public, anon, authenticated;
revoke all on function public.associates_update(uuid, text, date, date, date, text, public.associate_registration, text, public.scout_branch, uuid, uuid) from public, anon;
grant execute on function public.associates_update(uuid, text, date, date, date, text, public.associate_registration, text, public.scout_branch, uuid, uuid) to authenticated;
