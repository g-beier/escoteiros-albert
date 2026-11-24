-- 004 — Vida escoteira: períodos de atividade, estrelas de atividade, eventos do histórico e anotações
-- (docs/plano-go-live.md, seção 4; modelo em apps/gestao/docs/associados/modelo.md).
--
-- Períodos (`associate_life_periods`): onde a pessoa esteve em atividade, com ramo (jovem) ou `adulto` (escotista ou
-- dirigente; honoríficos e outras funções não contam), início e fim. Intervalo [início, fim): na passagem, um termina
-- e o outro começa no mesmo dia. Fim vazio = período vigente. Lacuna = não ter período. `place` vazio = este grupo.
-- Os passados são livres (lançados à mão, pela sugestão do cadastro ou pela planilha); só o vigente acompanha o
-- cadastro sozinho (passagem, desligamento, reingresso, funções de escotista e dirigente), e nunca reescreve o passado.
--
-- A contagem (anos, data de cada estrela, ramo da estrela) é calculada no app (lib/associates/scout-life.ts) a partir
-- da promessa e dos períodos. Aqui ficam só as correções e entregas de cada estrela (`associate_stars`): entregar a
-- estrela N encerra também as anteriores.
--
-- Eventos (`associate_life_events`): fatos do histórico com data (Cruzeiro do Sul, Lis de Ouro, acampamentos…),
-- mostrados com os eventos do cadastro na linha do tempo. Anotações (`associates.life_notes`): texto livre para
-- recuperar informações perdidas, sem data.
--
-- Escrita só pelas funções auditadas, para Editor do Associados (a Diretoria de Métodos Educativos).

-- Tabelas ---------------------------------------------------------------------------------------------------------

create table public.associate_life_periods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  branch public.scout_branch not null,
  started_on date not null,
  ended_on date,
  place text,
  source text not null default 'manual',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint associate_life_periods_dates check (ended_on is null or ended_on > started_on),
  constraint associate_life_periods_place check (char_length(place) between 1 and 80),
  constraint associate_life_periods_source check (source in ('manual', 'automatico', 'cadastro', 'planilha'))
);
create index associate_life_periods_associate_idx on public.associate_life_periods(associate_id, started_on);
create index associate_life_periods_group_idx on public.associate_life_periods(group_id);
create unique index associate_life_periods_one_open on public.associate_life_periods(associate_id) where ended_on is null;

create table public.associate_stars (
  associate_id uuid not null references public.associates(id) on delete cascade,
  star smallint not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  branch public.scout_branch,
  delivered_on date,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamp with time zone not null default now(),
  primary key (associate_id, star),
  constraint associate_stars_star check (star between 1 and 99)
);
create index associate_stars_group_idx on public.associate_stars(group_id);

create table public.associate_life_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  event_date date not null,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  constraint associate_life_events_title check (char_length(title) between 1 and 80),
  constraint associate_life_events_description check (char_length(description) between 1 and 1000)
);
create index associate_life_events_associate_idx on public.associate_life_events(associate_id, event_date);
create index associate_life_events_group_idx on public.associate_life_events(group_id);

alter table public.associates add column life_notes text,
  add constraint associates_life_notes_check check (char_length(life_notes) <= 4000);

-- Leitura: quem lê o Associados. Escrita: só as funções abaixo.
alter table public.associate_life_periods enable row level security;
alter table public.associate_stars enable row level security;
alter table public.associate_life_events enable row level security;
create policy "associates readers read life periods" on public.associate_life_periods for select using (public.can_read_associates(group_id));
create policy "associates readers read stars" on public.associate_stars for select using (public.can_read_associates(group_id));
create policy "associates readers read life events" on public.associate_life_events for select using (public.can_read_associates(group_id));
grant select on public.associate_life_periods, public.associate_stars, public.associate_life_events to authenticated;

-- Auxiliares ------------------------------------------------------------------------------------------------------

/** Associado do grupo com permissão de Editor do Associados (trava a linha); erro em português se não. */
create function public.life_associate_for_edit(p_associate_id uuid) returns public.associates
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then
    raise exception 'Associado não encontrado ou sem permissão';
  end if;
  return a;
end;
$$;

/** Hoje em São Paulo. */
create function public.life_today() returns date
  language sql stable set search_path to '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

/** O período cabe sem sobrepor outro do associado (`p_except`: o próprio, na edição). */
create function public.life_period_check(p_associate_id uuid, p_branch public.scout_branch, p_started_on date, p_ended_on date,
  p_place text, p_except uuid) returns void
  language plpgsql stable security definer set search_path to '' as $$
declare clash record;
begin
  if p_branch is null then raise exception 'Escolha o ramo do período'; end if;
  if p_started_on is null then raise exception 'Informe o início do período'; end if;
  if p_started_on > public.life_today() then raise exception 'O início do período não pode ser futuro'; end if;
  if p_ended_on is not null and p_ended_on <= p_started_on then raise exception 'O fim do período deve ser depois do início'; end if;
  if p_ended_on > public.life_today() then raise exception 'O fim do período não pode ser futuro: deixe vazio enquanto vigente'; end if;
  if char_length(p_place) > 80 then raise exception 'Outro grupo: no máximo 80 caracteres'; end if;
  select started_on, ended_on into clash from public.associate_life_periods
  where associate_id = p_associate_id and id is distinct from p_except
    and daterange(started_on, ended_on, '[)') && daterange(p_started_on, p_ended_on, '[)')
  order by started_on limit 1;
  if found then
    raise exception 'O período se sobrepõe a outro (% a %)', to_char(clash.started_on, 'DD/MM/YYYY'),
      coalesce(to_char(clash.ended_on, 'DD/MM/YYYY'), 'hoje');
  end if;
end;
$$;

create function public.life_period_snapshot(p_period_id uuid) returns jsonb
  language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('branch', branch, 'started_on', started_on, 'ended_on', ended_on, 'place', place, 'source', source)
  from public.associate_life_periods where id = p_period_id;
$$;

-- Períodos ----------------------------------------------------------------------------------------------------------

/** Inclui (sem `p_period_id`) ou corrige um período; devolve o id. */
create function public.life_period_save(p_associate_id uuid, p_period_id uuid, p_branch public.scout_branch, p_started_on date,
  p_ended_on date, p_place text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; saved uuid; before jsonb; clean_place text := nullif(btrim(coalesce(p_place, '')), '');
begin
  a := public.life_associate_for_edit(p_associate_id);
  if p_period_id is not null then
    before := public.life_period_snapshot(p_period_id);
    if not exists (select 1 from public.associate_life_periods where id = p_period_id and associate_id = a.id) then
      raise exception 'Período não encontrado';
    end if;
  end if;
  perform public.life_period_check(a.id, p_branch, p_started_on, p_ended_on, clean_place, p_period_id);
  if p_period_id is null then
    insert into public.associate_life_periods(group_id, associate_id, branch, started_on, ended_on, place, created_by)
    values (a.group_id, a.id, p_branch, p_started_on, p_ended_on, clean_place, auth.uid())
    returning id into saved;
  else
    update public.associate_life_periods set branch = p_branch, started_on = p_started_on, ended_on = p_ended_on,
      place = clean_place, source = 'manual', updated_at = now()
    where id = p_period_id returning id into saved;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), case when p_period_id is null then 'associate.life_period_added' else 'associate.life_period_updated' end,
    'associate', a.id::text, jsonb_build_object('period_id', saved, 'before', before, 'after', public.life_period_snapshot(saved)));
  return saved;
end;
$$;

/** Apaga um período lançado errado. */
create function public.life_period_delete(p_period_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare p public.associate_life_periods%rowtype; a public.associates%rowtype;
begin
  select * into p from public.associate_life_periods where id = p_period_id;
  if p.id is null then raise exception 'Período não encontrado'; end if;
  a := public.life_associate_for_edit(p.associate_id);
  delete from public.associate_life_periods where id = p.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.life_period_deleted', 'associate', a.id::text,
    jsonb_build_object('period_id', p.id, 'branch', p.branch, 'started_on', p.started_on, 'ended_on', p.ended_on, 'place', p.place));
end;
$$;

/**
 * Inclui vários períodos de uma vez (sugestão do cadastro, planilha): `[{branch, started_on, ended_on?, place?}]`,
 * tudo ou nada. `p_source`: `cadastro` ou `planilha`. Devolve quantos entraram.
 */
create function public.life_periods_add(p_associate_id uuid, p_periods jsonb, p_source text) returns integer
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; item jsonb; total int := 0; p_branch public.scout_branch; p_start date; p_end date; clean_place text;
begin
  a := public.life_associate_for_edit(p_associate_id);
  if p_source not in ('cadastro', 'planilha') then raise exception 'Origem inválida'; end if;
  if jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) = 0 then raise exception 'Nenhum período para incluir'; end if;
  for item in select value from jsonb_array_elements(p_periods) loop
    p_branch := (item->>'branch')::public.scout_branch;
    p_start := (item->>'started_on')::date;
    p_end := nullif(item->>'ended_on', '')::date;
    clean_place := nullif(btrim(coalesce(item->>'place', '')), '');
    perform public.life_period_check(a.id, p_branch, p_start, p_end, clean_place, null);
    insert into public.associate_life_periods(group_id, associate_id, branch, started_on, ended_on, place, source, created_by)
    values (a.group_id, a.id, p_branch, p_start, p_end, clean_place, p_source, auth.uid());
    total := total + 1;
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.life_periods_added', 'associate', a.id::text,
    jsonb_build_object('source', p_source, 'periods', p_periods));
  return total;
end;
$$;

/**
 * Troca o período vigente numa data: encerra o aberto (se houver) e, com `p_branch`, abre outro nesse ramo. Corrige
 * o vigente quando o cadastro mudou sem passar pelo acompanhamento automático (correção de ramo, função antiga).
 */
create function public.life_period_switch(p_associate_id uuid, p_date date, p_branch public.scout_branch) returns void
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; open_period public.associate_life_periods%rowtype;
begin
  a := public.life_associate_for_edit(p_associate_id);
  if p_date is null then raise exception 'Informe a data'; end if;
  if p_date > public.life_today() then raise exception 'A data não pode ser futura'; end if;
  select * into open_period from public.associate_life_periods where associate_id = a.id and ended_on is null;
  if open_period.id is null and p_branch is null then raise exception 'Não há período vigente para encerrar'; end if;
  if open_period.id is not null then
    if p_date < open_period.started_on then
      raise exception 'O período vigente começou em %: escolha uma data depois', to_char(open_period.started_on, 'DD/MM/YYYY');
    elsif p_date = open_period.started_on then
      delete from public.associate_life_periods where id = open_period.id;
    else
      update public.associate_life_periods set ended_on = p_date, updated_at = now() where id = open_period.id;
    end if;
  end if;
  if p_branch is not null then
    perform public.life_period_check(a.id, p_branch, p_date, null, null, null);
    insert into public.associate_life_periods(group_id, associate_id, branch, started_on, source, created_by)
    values (a.group_id, a.id, p_branch, p_date, 'manual', auth.uid());
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.life_period_switched', 'associate', a.id::text,
    jsonb_build_object('date', p_date, 'closed', open_period.id, 'from', open_period.branch, 'to', p_branch));
end;
$$;

-- Estrelas ----------------------------------------------------------------------------------------------------------

/** Certificado da estrela `p_star` entregue em `p_date` (encerra também as anteriores); `null` desfaz a entrega. */
create function public.life_star_deliver(p_associate_id uuid, p_star integer, p_date date) returns void
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype;
begin
  a := public.life_associate_for_edit(p_associate_id);
  if p_star is null or p_star < 1 or p_star > 99 then raise exception 'Estrela inválida'; end if;
  if p_date > public.life_today() then raise exception 'A data da entrega não pode ser futura'; end if;
  insert into public.associate_stars(associate_id, star, group_id, delivered_on, updated_by)
  values (a.id, p_star, a.group_id, p_date, auth.uid())
  on conflict (associate_id, star) do update set delivered_on = excluded.delivered_on, updated_by = auth.uid(), updated_at = now();
  delete from public.associate_stars where associate_id = a.id and star = p_star and branch is null and delivered_on is null;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), case when p_date is null then 'associate.star_undelivered' else 'associate.star_delivered' end,
    'associate', a.id::text, jsonb_build_object('star', p_star, 'date', p_date));
end;
$$;

/** Corrige o ramo da estrela `p_star` (o calculado é o de mais atividade nos 12 meses); `null` volta ao calculado. */
create function public.life_star_set_branch(p_associate_id uuid, p_star integer, p_branch public.scout_branch) returns void
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype;
begin
  a := public.life_associate_for_edit(p_associate_id);
  if p_star is null or p_star < 1 or p_star > 99 then raise exception 'Estrela inválida'; end if;
  insert into public.associate_stars(associate_id, star, group_id, branch, updated_by)
  values (a.id, p_star, a.group_id, p_branch, auth.uid())
  on conflict (associate_id, star) do update set branch = excluded.branch, updated_by = auth.uid(), updated_at = now();
  delete from public.associate_stars where associate_id = a.id and star = p_star and branch is null and delivered_on is null;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.star_branch_set', 'associate', a.id::text, jsonb_build_object('star', p_star, 'branch', p_branch));
end;
$$;

-- Eventos e anotações -----------------------------------------------------------------------------------------------

/** Inclui (sem `p_event_id`) ou corrige um evento do histórico; devolve o id. */
create function public.life_event_save(p_associate_id uuid, p_event_id uuid, p_date date, p_title text, p_description text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; saved uuid;
  clean_title text := nullif(regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
  clean_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  a := public.life_associate_for_edit(p_associate_id);
  if p_date is null then raise exception 'Informe a data do evento'; end if;
  if p_date > public.life_today() then raise exception 'A data do evento não pode ser futura'; end if;
  if clean_title is null then raise exception 'Informe o título do evento'; end if;
  if char_length(clean_title) > 80 then raise exception 'Título: no máximo 80 caracteres'; end if;
  if char_length(clean_description) > 1000 then raise exception 'Descrição: no máximo 1000 caracteres'; end if;
  if p_event_id is null then
    insert into public.associate_life_events(group_id, associate_id, event_date, title, description, created_by)
    values (a.group_id, a.id, p_date, clean_title, clean_description, auth.uid())
    returning id into saved;
  else
    update public.associate_life_events set event_date = p_date, title = clean_title, description = clean_description
    where id = p_event_id and associate_id = a.id returning id into saved;
    if saved is null then raise exception 'Evento não encontrado'; end if;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), case when p_event_id is null then 'associate.life_event_added' else 'associate.life_event_updated' end,
    'associate', a.id::text, jsonb_build_object('event_id', saved, 'date', p_date, 'title', clean_title));
  return saved;
end;
$$;

create function public.life_event_delete(p_event_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare e public.associate_life_events%rowtype; a public.associates%rowtype;
begin
  select * into e from public.associate_life_events where id = p_event_id;
  if e.id is null then raise exception 'Evento não encontrado'; end if;
  a := public.life_associate_for_edit(e.associate_id);
  delete from public.associate_life_events where id = e.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.life_event_deleted', 'associate', a.id::text,
    jsonb_build_object('event_id', e.id, 'date', e.event_date, 'title', e.title));
end;
$$;

/** Anotações de histórico (texto livre, sem data). */
create function public.life_notes_set(p_associate_id uuid, p_notes text) returns void
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; clean text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  a := public.life_associate_for_edit(p_associate_id);
  if char_length(clean) > 4000 then raise exception 'Anotações: no máximo 4000 caracteres'; end if;
  update public.associates set life_notes = clean, updated_at = now() where id = a.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.life_notes_set', 'associate', a.id::text, jsonb_build_object('length', char_length(clean)));
end;
$$;

-- Acompanhamento automático do período vigente ---------------------------------------------------------------------

/**
 * Ramo que deveria estar vigente na data: jovem ativo = o ramo; adulto ativo com função de escotista ou dirigente em
 * exercício na data = `adulto`; senão nenhum (desligado, adulto sem função que conta).
 */
create function public.life_expected_branch(p_associate_id uuid, p_branch public.scout_branch, p_active boolean, p_on date)
  returns public.scout_branch
  language sql stable security definer set search_path to '' as $$
  select case
    when not p_active then null
    when p_branch <> 'adulto' then p_branch
    when exists (select 1 from public.associate_functions f where f.associate_id = p_associate_id
      and f.kind in ('escotista', 'dirigente') and coalesce(f.started_on, '-infinity') <= p_on
      and (f.ended_on is null or f.ended_on > p_on)) then 'adulto'::public.scout_branch
  end;
$$;

/**
 * Leva o período vigente ao ramo esperado na data de um evento do cadastro. Só mexe no presente: evento antes do
 * início do vigente, ou antes do fim de outro período, não muda nada (o passado é lançado à mão).
 */
create function public.life_follow(p_associate_id uuid, p_on date, p_expected public.scout_branch) returns void
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; open_period public.associate_life_periods%rowtype;
begin
  select * into a from public.associates where id = p_associate_id;
  if a.id is null or p_on is null or p_on > public.life_today() then return; end if;
  select * into open_period from public.associate_life_periods where associate_id = a.id and ended_on is null for update;
  if open_period.branch is not distinct from p_expected then return; end if;
  if exists (select 1 from public.associate_life_periods where associate_id = a.id and ended_on > p_on) then return; end if;
  if open_period.id is not null then
    if p_on < open_period.started_on then return; end if;
    if p_on = open_period.started_on then
      if p_expected is null then
        delete from public.associate_life_periods where id = open_period.id;
      else
        update public.associate_life_periods set branch = p_expected, source = 'automatico', updated_at = now() where id = open_period.id;
      end if;
      return;
    end if;
    update public.associate_life_periods set ended_on = p_on, updated_at = now() where id = open_period.id;
  end if;
  if p_expected is not null then
    -- Volta no mesmo dia em que saiu, no mesmo ramo: reabre o período em vez de criar outro colado.
    update public.associate_life_periods set ended_on = null, updated_at = now()
    where associate_id = a.id and ended_on = p_on and branch = p_expected;
    if not found then
      insert into public.associate_life_periods(group_id, associate_id, branch, started_on, source, created_by)
      values (a.group_id, a.id, p_expected, p_on, 'automatico', auth.uid());
    end if;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.life_period_followed', 'associate', a.id::text,
    jsonb_build_object('date', p_on, 'from', open_period.branch, 'to', p_expected));
end;
$$;

/** Passagem: o vigente vai para o ramo novo (Pioneiro → Adulto só continua com função de escotista ou dirigente). */
create function public.life_follow_move() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  perform public.life_follow(new.associate_id, new.move_date,
    public.life_expected_branch(new.associate_id, new.to_branch, true, new.move_date));
  return null;
end;
$$;

/** Entrada ou saída (cadastro, desligamento, reingresso, mensalidades, importação), se for a mais recente. */
create function public.life_follow_movement() returns trigger
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype;
begin
  if exists (select 1 from public.associate_movements where associate_id = new.associate_id and movement_date > new.movement_date) then
    return null;
  end if;
  select * into a from public.associates where id = new.associate_id;
  perform public.life_follow(a.id, new.movement_date,
    public.life_expected_branch(a.id, a.branch, new.kind = 'entrada', new.movement_date));
  return null;
end;
$$;

/** Função de escotista ou dirigente incluída, corrigida ou encerrada. */
create function public.life_follow_function() returns trigger
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; on_date date;
begin
  if new.kind not in ('escotista', 'dirigente') and (tg_op = 'INSERT' or old.kind not in ('escotista', 'dirigente')) then
    return null;
  end if;
  select * into a from public.associates where id = new.associate_id;
  if a.branch <> 'adulto' or not a.active then return null; end if;
  on_date := case
    when new.ended_on is not null and (tg_op = 'INSERT' or old.ended_on is distinct from new.ended_on) then new.ended_on
    else coalesce(new.started_on, public.life_today()) end;
  perform public.life_follow(a.id, on_date, public.life_expected_branch(a.id, a.branch, true, on_date));
  return null;
end;
$$;

create trigger associate_moves_life_follow after insert on public.associate_moves
  for each row execute function public.life_follow_move();
-- Roda antes de associate_movements_sync_active (ordem alfabética), por isso usa o tipo do movimento, não `active`.
create trigger associate_movements_life_follow after insert on public.associate_movements
  for each row execute function public.life_follow_movement();
create trigger associate_functions_life_follow after insert or update on public.associate_functions
  for each row execute function public.life_follow_function();

-- Permissões das funções --------------------------------------------------------------------------------------------

do $$
declare fn text;
begin
  foreach fn in array array['life_period_save(uuid,uuid,public.scout_branch,date,date,text)', 'life_period_delete(uuid)',
    'life_periods_add(uuid,jsonb,text)', 'life_period_switch(uuid,date,public.scout_branch)',
    'life_star_deliver(uuid,integer,date)', 'life_star_set_branch(uuid,integer,public.scout_branch)',
    'life_event_save(uuid,uuid,date,text,text)', 'life_event_delete(uuid)', 'life_notes_set(uuid,text)'] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
  foreach fn in array array['life_associate_for_edit(uuid)', 'life_period_check(uuid,public.scout_branch,date,date,text,uuid)',
    'life_period_snapshot(uuid)', 'life_expected_branch(uuid,public.scout_branch,boolean,date)',
    'life_follow(uuid,date,public.scout_branch)', 'life_follow_move()', 'life_follow_movement()', 'life_follow_function()'] loop
    execute format('revoke all on function public.%s from public', fn);
  end loop;
end;
$$;
