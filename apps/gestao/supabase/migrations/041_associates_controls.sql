-- Associados, segunda etapa (apps/gestao/docs/associados/modelo.md): funções do adulto (escotista/dirigente),
-- controle de dados pessoais do Doc 22 (itens de controle por diretoria e situação por pessoa × item) e
-- `associates.active` derivado da última movimentação.
--
-- Público de um associado: jovem = ramo diferente de adulto; adulto = ramo adulto (as funções escotista/
-- dirigente só dividem a lista de adultos); responsavel = responsável de um jovem (tabela `relatives`).
-- Situação ausente = "sem registro" (pendência implícita). Cada item diz, por público, se se aplica e o valor
-- inicial gravado quando a pessoa é cadastrada (`control_item_audiences`).
-- Alguns itens mostram na célula um valor em vez da situação (Doc 22: "Ano-base do registro" mostra o ano,
-- "Validade do registro" a data): `control_items.value_kind`. Ano em `control_statuses.value_year`; data = `valid_until`.
-- Diretorias por usuário ficam para depois: quem gerencia associados (can_manage_associates) edita tudo,
-- os demais membros leem. Escrita só pelas funções auditadas abaixo.

-- Tipos ----------------------------------------------------------------------------------------
create type public.associate_function_kind as enum ('escotista', 'dirigente');
create type public.directorate as enum ('metodos_educativos', 'administrativa', 'financeira', 'comunicacao');
create type public.control_audience as enum ('jovem', 'adulto', 'responsavel');
create type public.relative_kinship as enum ('mae', 'pai', 'outro');
create type public.control_item_kind as enum ('documento', 'sistema', 'canal', 'etapa');
create type public.control_status as enum ('ok', 'pendente', 'desatualizado', 'a_verificar', 'convidado', 'nao_se_aplica', 'a_remover', 'removido');
create type public.control_value_kind as enum ('situacao', 'ano', 'data');

-- Funções do adulto ----------------------------------------------------------------------------
create table public.associate_functions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  kind public.associate_function_kind not null,
  title text check (char_length(title) between 1 and 80),
  started_on date,
  ended_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);
create index associate_functions_associate_idx on public.associate_functions(associate_id);
create index associate_functions_group_idx on public.associate_functions(group_id);
alter table public.associate_functions enable row level security;
create policy "members read associate functions" on public.associate_functions for select using (public.is_group_member(group_id));

create view public.associate_function_rows with (security_invoker = true) as
select f.id, f.group_id, f.associate_id, a.name as associate_name, f.kind, f.title, f.started_on, f.ended_on,
  (f.ended_on is null or f.ended_on > current_date) as active, f.created_at
from public.associate_functions f
join public.associates a on a.id = f.associate_id;
grant select on public.associate_function_rows to authenticated;

-- Público de cada associado (para "se aplica").
create view public.associate_audiences with (security_invoker = true) as
select a.id as associate_id, a.group_id,
  (case when a.branch = 'adulto' then 'adulto' else 'jovem' end)::public.control_audience as audience
from public.associates a;
grant select on public.associate_audiences to authenticated;

-- Itens de controle ----------------------------------------------------------------------------
create table public.control_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  kind public.control_item_kind not null,
  value_kind public.control_value_kind not null default 'situacao',
  directorate public.directorate not null,
  validity_months int check (validity_months between 1 and 120),
  remove_on_leave boolean not null default false,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index control_items_group_name_idx on public.control_items(group_id, lower(name));
create index control_items_group_idx on public.control_items(group_id, directorate, position);
alter table public.control_items enable row level security;
create policy "members read control items" on public.control_items for select using (public.is_group_member(group_id));

-- Públicos do item: linha presente = se aplica; `initial_status` nulo = começa "sem registro".
create table public.control_item_audiences (
  item_id uuid not null references public.control_items(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  audience public.control_audience not null,
  initial_status public.control_status,
  primary key (item_id, audience)
);
create index control_item_audiences_group_idx on public.control_item_audiences(group_id);
alter table public.control_item_audiences enable row level security;
create policy "members read control item audiences" on public.control_item_audiences for select using (public.is_group_member(group_id));

-- Responsáveis dos jovens ----------------------------------------------------------------------
-- Um responsável pode ser de vários jovens (irmãos) e pode ser também associado (ex.: mãe escotista).
create table public.relatives (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  associate_id uuid references public.associates(id) on delete set null,
  notes text check (char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index relatives_group_idx on public.relatives(group_id);
create index relatives_associate_idx on public.relatives(associate_id);
alter table public.relatives enable row level security;
create policy "members read relatives" on public.relatives for select using (public.is_group_member(group_id));

create table public.relative_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  relative_id uuid not null references public.relatives(id) on delete cascade,
  kinship public.relative_kinship not null,
  kinship_note text check (char_length(kinship_note) between 1 and 40),
  legal boolean not null default false,
  financial boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (associate_id, relative_id),
  check (kinship <> 'outro' or kinship_note is not null)
);
create index relative_links_relative_idx on public.relative_links(relative_id);
create index relative_links_group_idx on public.relative_links(group_id);
alter table public.relative_links enable row level security;
create policy "members read relative links" on public.relative_links for select using (public.is_group_member(group_id));

create view public.relative_link_rows with (security_invoker = true) as
select l.id, l.group_id, l.associate_id, l.relative_id, r.name as relative_name, r.associate_id as relative_associate_id,
  l.kinship, l.kinship_note, l.legal, l.financial, l.position,
  (select count(*)::int from public.relative_links o where o.relative_id = l.relative_id and o.id <> l.id) as sibling_count
from public.relative_links l
join public.relatives r on r.id = l.relative_id;
grant select on public.relative_link_rows to authenticated;

-- Situações ------------------------------------------------------------------------------------
create table public.control_statuses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid references public.associates(id) on delete cascade,
  relative_id uuid references public.relatives(id) on delete cascade,
  item_id uuid not null references public.control_items(id) on delete cascade,
  status public.control_status not null,
  status_date date,
  valid_until date,
  value_year int check (value_year between 1900 and 2100),
  note text check (char_length(note) <= 200),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (associate_id, item_id),
  unique (relative_id, item_id),
  check (num_nonnulls(associate_id, relative_id) = 1)
);
create index control_statuses_group_idx on public.control_statuses(group_id);
create index control_statuses_item_idx on public.control_statuses(item_id);
alter table public.control_statuses enable row level security;
create policy "members read control statuses" on public.control_statuses for select using (public.is_group_member(group_id));

-- Situação efetiva: ok com validade vencida ou ano antes do atual conta como desatualizado.
create view public.control_status_rows with (security_invoker = true) as
select s.id, s.group_id, s.associate_id, s.relative_id, s.item_id, s.status,
  case when s.status = 'ok' and (s.valid_until < current_date or s.value_year < extract(year from current_date)::int)
    then 'desatualizado'::public.control_status else s.status end as effective_status,
  s.status_date, s.valid_until, s.value_year, s.note, s.updated_at, s.updated_by
from public.control_statuses s;
grant select on public.control_status_rows to authenticated;

-- associates.active segue a última movimentação ------------------------------------------------
-- Inserção: se o movimento novo é o mais recente (data igual conta: o novo vence), ele decide; se for
-- uma saída, marca "a remover" (abaixo).
-- Exclusão: recalcula pelo movimento restante mais recente; sem movimentos, mantém.
create function public.associates_sync_active()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid; last_kind public.associate_movement_kind;
begin
  if tg_op = 'INSERT' then
    target := new.associate_id;
    if exists (select 1 from public.associate_movements where associate_id = target and movement_date > new.movement_date) then
      select kind into last_kind from public.associate_movements where associate_id = target
      order by movement_date desc, created_at desc, (kind = 'entrada') desc limit 1;
    else
      last_kind := new.kind;
      -- Saída que deixa o associado inativo (desligamento, Financeiro ou importação): abre "a remover"
      -- nos itens ativos removidos no desligamento a que ele ainda tem acesso.
      if new.kind = 'saida' then
        update public.control_statuses s set status = 'a_remover', status_date = new.movement_date, updated_by = auth.uid(), updated_at = now()
        from public.control_items i
        where s.associate_id = target and i.id = s.item_id and i.active and i.remove_on_leave
          and s.status in ('ok', 'desatualizado', 'a_verificar', 'convidado');
        -- O mesmo para os responsáveis do jovem que não acompanham outro jovem ativo. Responsável que é
        -- associado ativo é controlado como adulto: continua no grupo.
        update public.control_statuses s set status = 'a_remover', status_date = new.movement_date, updated_by = auth.uid(), updated_at = now()
        from public.control_items i, public.relative_links l
        where l.associate_id = target and s.relative_id = l.relative_id and i.id = s.item_id and i.active and i.remove_on_leave
          and s.status in ('ok', 'desatualizado', 'a_verificar', 'convidado')
          and not exists (select 1 from public.relative_links o join public.associates a on a.id = o.associate_id
                          where o.relative_id = l.relative_id and o.associate_id <> target and a.active)
          and not exists (select 1 from public.relatives r join public.associates a on a.id = r.associate_id
                          where r.id = l.relative_id and a.active);
      end if;
    end if;
  else
    target := old.associate_id;
    select kind into last_kind from public.associate_movements where associate_id = target
    order by movement_date desc, created_at desc, (kind = 'entrada') desc limit 1;
  end if;
  if last_kind is not null then
    update public.associates set active = (last_kind = 'entrada'), updated_at = now()
    where id = target and active is distinct from (last_kind = 'entrada');
  end if;
  return null;
end;
$$;
create trigger associate_movements_sync_active after insert or delete on public.associate_movements
  for each row execute function public.associates_sync_active();
revoke all on function public.associates_sync_active() from public, anon, authenticated;

-- Funções auditadas: funções do adulto ---------------------------------------------------------

create function public.associate_function_snapshot(p_function_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('associate_id', f.associate_id, 'kind', f.kind, 'title', f.title, 'started_on', f.started_on, 'ended_on', f.ended_on)
  from public.associate_functions f where f.id = p_function_id;
$$;

create function public.associates_add_function(p_associate_id uuid, p_kind public.associate_function_kind, p_title text, p_started_on date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; new_id uuid; clean_title text := nullif(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch <> 'adulto' then raise exception 'Só adultos têm função'; end if;
  if not a.active then raise exception 'Associado desligado: reingresse antes de adicionar função'; end if;
  if p_kind is null then raise exception 'Escolha o tipo da função'; end if;
  if char_length(clean_title) > 80 then raise exception 'Cargo: no máximo 80 caracteres'; end if;
  if p_started_on > current_date then raise exception 'O início da função não pode ser futuro'; end if;
  if exists (select 1 from public.associate_functions where associate_id = a.id and kind = p_kind
      and lower(coalesce(title, '')) = lower(coalesce(clean_title, '')) and (ended_on is null or ended_on > current_date)) then
    raise exception 'O associado já tem esta função ativa';
  end if;
  insert into public.associate_functions(group_id, associate_id, kind, title, started_on, created_by)
  values (a.group_id, a.id, p_kind, clean_title, p_started_on, auth.uid())
  returning id into new_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.function_added', 'associate', a.id::text, public.associate_function_snapshot(new_id));
  return new_id;
end;
$$;

create function public.associates_end_function(p_function_id uuid, p_ended_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.associate_functions%rowtype;
begin
  select * into f from public.associate_functions where id = p_function_id for update;
  if f.id is null or not public.can_manage_associates(f.group_id) then raise exception 'Função não encontrada ou sem permissão'; end if;
  if f.ended_on is not null then raise exception 'A função já está encerrada'; end if;
  if p_ended_on is null then raise exception 'Informe a data de término'; end if;
  if p_ended_on > current_date then raise exception 'O término da função não pode ser futuro'; end if;
  if p_ended_on < f.started_on then raise exception 'O término não pode ser antes do início (%)', to_char(f.started_on, 'DD/MM/YYYY'); end if;
  update public.associate_functions set ended_on = p_ended_on where id = f.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (f.group_id, auth.uid(), 'associate.function_ended', 'associate', f.associate_id::text, public.associate_function_snapshot(f.id));
end;
$$;

create function public.associates_delete_function(p_function_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.associate_functions%rowtype; before_state jsonb;
begin
  select * into f from public.associate_functions where id = p_function_id for update;
  if f.id is null or not public.can_manage_associates(f.group_id) then raise exception 'Função não encontrada ou sem permissão'; end if;
  before_state := public.associate_function_snapshot(f.id);
  delete from public.associate_functions where id = f.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (f.group_id, auth.uid(), 'associate.function_deleted', 'associate', f.associate_id::text, before_state);
end;
$$;

-- Funções auditadas: itens de controle ---------------------------------------------------------

create function public.control_item_snapshot(p_item_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', i.name, 'kind', i.kind, 'value_kind', i.value_kind, 'directorate', i.directorate,
    'audiences', (select coalesce(jsonb_agg(jsonb_build_object('audience', a.audience, 'initial_status', a.initial_status) order by a.audience), '[]'::jsonb)
                  from public.control_item_audiences a where a.item_id = i.id),
    'validity_months', i.validity_months, 'remove_on_leave', i.remove_on_leave, 'active', i.active, 'position', i.position)
  from public.control_items i where i.id = p_item_id;
$$;

-- Confere os campos do item; devolve o nome limpo.
create function public.control_item_check(p_group_id uuid, p_item_id uuid, p_name text, p_kind public.control_item_kind,
  p_directorate public.directorate, p_audiences jsonb, p_validity_months int)
returns text language plpgsql stable security definer set search_path = '' as $$
declare clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'); x jsonb; seen text[] := '{}';
begin
  if char_length(clean_name) not between 2 and 80 then raise exception 'Informe um nome com 2 a 80 caracteres'; end if;
  if p_kind is null then raise exception 'Escolha o tipo do item'; end if;
  if p_directorate is null then raise exception 'Escolha a diretoria'; end if;
  if p_audiences is null or jsonb_typeof(p_audiences) <> 'array' or jsonb_array_length(p_audiences) = 0 then raise exception 'Escolha a quem o item se aplica'; end if;
  for x in select value from jsonb_array_elements(p_audiences) loop
    if jsonb_typeof(x) <> 'object' or not pg_input_is_valid(coalesce(x->>'audience', ''), 'public.control_audience') then
      raise exception 'Público inválido';
    end if;
    if (x->>'audience') = any(seen) then raise exception 'Público repetido: %', x->>'audience'; end if;
    seen := seen || (x->>'audience');
    if nullif(x->>'initial_status', '') is not null and not pg_input_is_valid(x->>'initial_status', 'public.control_status') then
      raise exception 'Valor inicial inválido';
    end if;
  end loop;
  if p_validity_months is not null and p_validity_months not between 1 and 120 then raise exception 'Validade: de 1 a 120 meses'; end if;
  if exists (select 1 from public.control_items where group_id = p_group_id and lower(name) = lower(clean_name) and id is distinct from p_item_id) then
    raise exception 'Já existe o item %', clean_name;
  end if;
  return clean_name;
end;
$$;

-- Troca os públicos do item (já conferidos por control_item_check). Não mexe em situações gravadas.
create function public.control_item_save_audiences(p_item_id uuid, p_group_id uuid, p_audiences jsonb)
returns void language sql security definer set search_path = '' as $$
  delete from public.control_item_audiences where item_id = p_item_id;
  insert into public.control_item_audiences(item_id, group_id, audience, initial_status)
  select p_item_id, p_group_id, (x->>'audience')::public.control_audience, nullif(x->>'initial_status', '')::public.control_status
  from jsonb_array_elements(p_audiences) x;
$$;

-- O item (ativo) se aplica ao público?
create function public.control_item_applies(p_item_id uuid, p_audience public.control_audience)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.control_item_audiences where item_id = p_item_id and audience = p_audience);
$$;

-- Renumera as posições de uma diretoria (1..n), na ordem atual.
create function public.control_items_renumber(p_group_id uuid, p_directorate public.directorate)
returns void language sql security definer set search_path = '' as $$
  update public.control_items i set position = o.rn
  from (select id, row_number() over (order by position, name) as rn from public.control_items
        where group_id = p_group_id and directorate = p_directorate) o
  where i.id = o.id and i.position <> o.rn;
$$;

create function public.control_item_create(p_group_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate,
  p_audiences jsonb, p_validity_months int, p_remove_on_leave boolean, p_value_kind public.control_value_kind default 'situacao')
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; clean_name text;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para alterar itens de controle neste grupo'; end if;
  clean_name := public.control_item_check(p_group_id, null, p_name, p_kind, p_directorate, p_audiences, p_validity_months);
  insert into public.control_items(group_id, name, kind, value_kind, directorate, validity_months, remove_on_leave, position)
  values (p_group_id, clean_name, p_kind, coalesce(p_value_kind, 'situacao'), p_directorate, p_validity_months, coalesce(p_remove_on_leave, false),
    (select coalesce(max(position), 0) + 1 from public.control_items where group_id = p_group_id and directorate = p_directorate))
  returning id into new_id;
  perform public.control_item_save_audiences(new_id, p_group_id, p_audiences);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'control_item.created', 'control_item', new_id::text, public.control_item_snapshot(new_id));
  return new_id;
end;
$$;

-- Edita o item; `p_active` e `p_value_kind` nulos mantêm. Mudar de diretoria leva o item para o fim da nova. Mudar públicos ou
-- valor inicial não mexe nas situações já gravadas.
create function public.control_item_update(p_item_id uuid, p_name text, p_kind public.control_item_kind, p_directorate public.directorate,
  p_audiences jsonb, p_validity_months int, p_remove_on_leave boolean, p_active boolean, p_value_kind public.control_value_kind default null)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.control_items%rowtype; before_state jsonb; clean_name text;
begin
  select * into item from public.control_items where id = p_item_id for update;
  if item.id is null or not public.can_manage_associates(item.group_id) then raise exception 'Item não encontrado ou sem permissão'; end if;
  clean_name := public.control_item_check(item.group_id, item.id, p_name, p_kind, p_directorate, p_audiences, p_validity_months);
  before_state := public.control_item_snapshot(item.id);
  update public.control_items set name = clean_name, kind = p_kind, value_kind = coalesce(p_value_kind, value_kind), directorate = p_directorate,
    validity_months = p_validity_months,
    remove_on_leave = coalesce(p_remove_on_leave, remove_on_leave), active = coalesce(p_active, active),
    position = case when p_directorate = item.directorate then position
      else (select coalesce(max(position), 0) + 1 from public.control_items where group_id = item.group_id and directorate = p_directorate) end,
    updated_at = now()
  where id = item.id;
  perform public.control_item_save_audiences(item.id, item.group_id, p_audiences);
  if p_directorate <> item.directorate then perform public.control_items_renumber(item.group_id, item.directorate); end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (item.group_id, auth.uid(), 'control_item.updated', 'control_item', item.id::text,
    jsonb_build_object('before', before_state, 'after', public.control_item_snapshot(item.id)));
end;
$$;

-- Reordena por arrastar: põe o item na posição `p_position` (1 = primeiro) da lista da sua diretoria
-- (ativos e inativos juntos); valores fora da faixa vão para o começo ou o fim.
create function public.control_item_place(p_item_id uuid, p_position int)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.control_items%rowtype; total int; target int;
begin
  select * into item from public.control_items where id = p_item_id for update;
  if item.id is null or not public.can_manage_associates(item.group_id) then raise exception 'Item não encontrado ou sem permissão'; end if;
  if p_position is null then raise exception 'Informe a posição'; end if;
  perform public.control_items_renumber(item.group_id, item.directorate);
  select position into item.position from public.control_items where id = item.id;
  select count(*) into total from public.control_items where group_id = item.group_id and directorate = item.directorate;
  target := least(greatest(p_position, 1), total);
  if target = item.position then return; end if;
  if target < item.position then
    update public.control_items set position = position + 1
    where group_id = item.group_id and directorate = item.directorate and position >= target and position < item.position;
  else
    update public.control_items set position = position - 1
    where group_id = item.group_id and directorate = item.directorate and position > item.position and position <= target;
  end if;
  update public.control_items set position = target, updated_at = now() where id = item.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (item.group_id, auth.uid(), 'control_item.placed', 'control_item', item.id::text,
    jsonb_build_object('from', item.position, 'to', target));
end;
$$;

-- Itens iniciais: as colunas do Doc 22 (Financeira começa vazia), valor inicial "pendente" em todo público que se aplica,
-- exceto nos itens que mostram um valor (ano-base e validade do registro), que começam sem registro.
-- Idempotente pelo nome (sem diferenciar maiúsculas); devolve quantos criou.
create function public.control_items_seed(p_group_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare created int;
begin
  with seed(directorate, ord, name, kind, audiences, validity_months, remove_on_leave) as (values
    ('metodos_educativos'::public.directorate, 1, 'Ficha de associação', 'documento'::public.control_item_kind, '{jovem,adulto}'::public.control_audience[], null::int, false),
    ('metodos_educativos', 2, 'Certificado de eleição/nomeação', 'documento', '{adulto}', null, false),
    ('metodos_educativos', 3, 'ATV', 'documento', '{adulto}', null, false),
    ('metodos_educativos', 4, 'PPF', 'documento', '{adulto}', 12, false),
    ('metodos_educativos', 5, 'Seções no Paxtu', 'sistema', '{adulto}', null, false),
    ('metodos_educativos', 6, 'Equipes no Paxtu', 'sistema', '{jovem}', null, false),
    ('metodos_educativos', 7, 'Ficha de aptidão', 'documento', '{adulto,responsavel}', null, false),
    ('metodos_educativos', 8, 'Google Drive', 'sistema', '{adulto}', null, true),
    ('metodos_educativos', 9, 'Calendário', 'sistema', '{adulto}', null, true),
    ('metodos_educativos', 10, 'Curso de brigadista', 'documento', '{adulto}', 24, false),
    ('metodos_educativos', 11, 'Promessa de adulto', 'etapa', '{adulto}', null, false),
    ('metodos_educativos', 12, 'Início do estágio', 'etapa', '{adulto}', null, false),
    ('metodos_educativos', 13, 'Integração', 'etapa', '{jovem,adulto}', null, false),
    ('metodos_educativos', 14, 'Palestra Vamos Falar de Escotismo', 'etapa', '{jovem,adulto}', null, false),
    ('administrativa', 1, 'Dados individuais no Paxtu', 'sistema', '{jovem,adulto,responsavel}', null, false),
    ('administrativa', 2, 'Ficha médica impressa', 'documento', '{jovem,adulto}', 12, false),
    ('administrativa', 3, 'Autorização de viagem (cartório)', 'documento', '{jovem}', null, false),
    ('administrativa', 4, 'Termo de consentimento', 'documento', '{jovem}', null, false),
    ('administrativa', 5, 'Login no Paxtu', 'sistema', '{adulto}', null, true),
    ('administrativa', 6, 'Ano-base do registro', 'documento', '{jovem,adulto}', null, false),
    ('administrativa', 7, 'Validade do registro', 'documento', '{jovem,adulto}', null, false),
    ('comunicacao', 1, 'Contatos no e-mail do GEAS', 'canal', '{jovem,adulto,responsavel}', null, true),
    ('comunicacao', 2, 'Lista de e-mails Adultos GEAS', 'canal', '{adulto}', null, true),
    ('comunicacao', 3, 'Instagram do GEAS', 'canal', '{jovem,adulto,responsavel}', null, true),
    ('comunicacao', 4, 'Twitter do GEAS', 'canal', '{jovem,adulto,responsavel}', null, true),
    ('comunicacao', 5, 'WhatsApp GEAS Brothers', 'canal', '{adulto}', null, true),
    ('comunicacao', 6, 'WhatsApp Só Avisos', 'canal', '{adulto,responsavel}', null, true),
    ('comunicacao', 7, 'Site', 'canal', '{adulto}', null, true)
  ), value_kinds(name, value_kind) as (values
    ('Ano-base do registro', 'ano'::public.control_value_kind),
    ('Validade do registro', 'data')
  ), missing as (
    select s.*, coalesce(v.value_kind, 'situacao') as value_kind from seed s left join value_kinds v on v.name = s.name
    where not exists (select 1 from public.control_items i where i.group_id = p_group_id and lower(i.name) = lower(s.name))
  ), ins as (
    insert into public.control_items(group_id, name, kind, value_kind, directorate, validity_months, remove_on_leave, position)
    select p_group_id, m.name, m.kind, m.value_kind, m.directorate, m.validity_months, m.remove_on_leave,
      coalesce((select max(position) from public.control_items i where i.group_id = p_group_id and i.directorate = m.directorate), 0)
        + row_number() over (partition by m.directorate order by m.ord)
    from missing m
    returning id, name, value_kind
  ), aud as (
    insert into public.control_item_audiences(item_id, group_id, audience, initial_status)
    select ins.id, p_group_id, a.audience, case when ins.value_kind = 'situacao' then 'pendente'::public.control_status end
    from ins join seed s on s.name = ins.name cross join unnest(s.audiences) a(audience)
    returning 1
  )
  select count(*) into created from ins;
  return created;
end;
$$;

create function public.associates_seed_control_items(p_group_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare created int;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para alterar itens de controle neste grupo'; end if;
  created := public.control_items_seed(p_group_id);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'control_items.seeded', 'control_item', p_group_id::text, jsonb_build_object('created', created));
  return created;
end;
$$;

-- Grupo novo já nasce com os itens iniciais.
create function public.groups_seed_control_items()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.control_items_seed(new.id);
  return null;
end;
$$;
create trigger groups_seed_control_items after insert on public.groups
  for each row execute function public.groups_seed_control_items();
revoke all on function public.groups_seed_control_items() from public, anon, authenticated;

-- Funções auditadas: situações -----------------------------------------------------------------

-- Público do associado: jovem pelo ramo, adulto pelo ramo.
create function public.associate_audience_of(p_associate_id uuid)
returns public.control_audience language sql stable security definer set search_path = '' as $$
  select audience from public.associate_audiences where associate_id = p_associate_id;
$$;

create function public.control_status_snapshot(p_associate_id uuid, p_item_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('item_id', s.item_id, 'status', s.status, 'status_date', s.status_date, 'valid_until', s.valid_until, 'value_year', s.value_year, 'note', s.note)
  from public.control_statuses s where s.associate_id = p_associate_id and s.item_id = p_item_id;
$$;

create function public.control_status_snapshot_relative(p_relative_id uuid, p_item_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('item_id', s.item_id, 'status', s.status, 'status_date', s.status_date, 'valid_until', s.valid_until, 'value_year', s.value_year, 'note', s.note)
  from public.control_statuses s where s.relative_id = p_relative_id and s.item_id = p_item_id;
$$;

-- Confere item e campos da situação; devolve a situação e a validade. Situação em branco só quando o item mostra um
-- valor e ele foi informado: vira ok. Ano só em item que mostra ano. Validade: ok sem validade num item que vence
-- recebe data (ou hoje) + meses do item; num item que mostra a data, a validade é o valor e pode ser passada.
create function public.control_status_check(p_group_id uuid, p_item_id uuid, p_audience public.control_audience, p_who text,
  p_status public.control_status, p_status_date date, p_valid_until date, p_note text, p_value_year int,
  out o_status public.control_status, out o_valid_until date)
language plpgsql stable security definer set search_path = '' as $$
declare item public.control_items%rowtype;
begin
  select * into item from public.control_items where id = p_item_id and group_id = p_group_id;
  if item.id is null then raise exception 'Item de controle não encontrado'; end if;
  if not item.active then raise exception 'O item % está desativado', item.name; end if;
  if p_audience is null or not public.control_item_applies(item.id, p_audience) then raise exception 'O item % não se aplica a este %', item.name, p_who; end if;
  if p_value_year is not null and item.value_kind <> 'ano' then raise exception 'O item % não guarda ano', item.name; end if;
  if p_value_year not between 1900 and 2100 then raise exception 'Ano: de 1900 a 2100'; end if;
  o_status := coalesce(p_status, case when (item.value_kind = 'ano' and p_value_year is not null)
    or (item.value_kind = 'data' and p_valid_until is not null) then 'ok'::public.control_status end);
  if o_status is null then
    raise exception '%', case item.value_kind when 'ano' then 'Informe o ano ou escolha a situação'
      when 'data' then 'Informe a data ou escolha a situação' else 'Escolha a situação' end;
  end if;
  if p_status_date > current_date then raise exception 'A data da situação não pode ser futura'; end if;
  if char_length(p_note) > 200 then raise exception 'Observação: no máximo 200 caracteres'; end if;
  o_valid_until := p_valid_until;
  if o_status = 'ok' and o_valid_until is null and item.validity_months is not null then
    o_valid_until := (coalesce(p_status_date, current_date) + make_interval(months => item.validity_months))::date;
  end if;
  if item.value_kind <> 'data' and o_valid_until < p_status_date then raise exception 'A validade não pode ser antes da data'; end if;
end;
$$;

-- Valor inicial dos itens ativos do público, para uma pessoa recém-cadastrada (associado ou responsável).
-- Sem auditoria própria: faz parte do cadastro. Devolve quantas situações gravou.
create function public.control_statuses_init(p_group_id uuid, p_associate_id uuid, p_relative_id uuid, p_audience public.control_audience)
returns int language plpgsql security definer set search_path = '' as $$
declare created int;
begin
  insert into public.control_statuses(group_id, associate_id, relative_id, item_id, status, status_date, valid_until, updated_by, updated_at)
  select p_group_id, p_associate_id, p_relative_id, i.id, a.initial_status, current_date,
    case when a.initial_status = 'ok' and i.validity_months is not null then (current_date + make_interval(months => i.validity_months))::date end,
    auth.uid(), now()
  from public.control_items i
  join public.control_item_audiences a on a.item_id = i.id and a.audience = p_audience
  where i.group_id = p_group_id and i.active and a.initial_status is not null
  on conflict do nothing;
  get diagnostics created = row_count;
  return created;
end;
$$;

-- Grava a situação do associado (upsert). `p_value_year`: ano do item que mostra ano.
create function public.control_status_set(p_associate_id uuid, p_item_id uuid, p_status public.control_status,
  p_status_date date, p_valid_until date, p_note text, p_value_year int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; before_state jsonb; checked record; clean_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into a from public.associates where id = p_associate_id;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  select * into checked from public.control_status_check(a.group_id, p_item_id, public.associate_audience_of(a.id), 'associado', p_status, p_status_date, p_valid_until, clean_note, p_value_year);
  before_state := public.control_status_snapshot(a.id, p_item_id);
  insert into public.control_statuses(group_id, associate_id, item_id, status, status_date, valid_until, value_year, note, updated_by, updated_at)
  values (a.group_id, a.id, p_item_id, checked.o_status, p_status_date, checked.o_valid_until, p_value_year, clean_note, auth.uid(), now())
  on conflict (associate_id, item_id) do update set status = excluded.status, status_date = excluded.status_date,
    valid_until = excluded.valid_until, value_year = excluded.value_year, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'control_status.set', 'associate', a.id::text,
    jsonb_build_object('before', before_state, 'after', public.control_status_snapshot(a.id, p_item_id)));
end;
$$;

-- Volta para "sem registro".
create function public.control_status_clear(p_associate_id uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare associate_group uuid; before_state jsonb;
begin
  select group_id into associate_group from public.associates where id = p_associate_id;
  if associate_group is null or not public.can_manage_associates(associate_group) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  before_state := public.control_status_snapshot(p_associate_id, p_item_id);
  if before_state is null then return; end if;
  delete from public.control_statuses where associate_id = p_associate_id and item_id = p_item_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (associate_group, auth.uid(), 'control_status.cleared', 'associate', p_associate_id::text, jsonb_build_object('before', before_state));
end;
$$;

-- As mesmas duas para o responsável (público responsavel).
create function public.control_status_set_relative(p_relative_id uuid, p_item_id uuid, p_status public.control_status,
  p_status_date date, p_valid_until date, p_note text, p_value_year int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.relatives%rowtype; before_state jsonb; checked record; clean_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into r from public.relatives where id = p_relative_id;
  if r.id is null or not public.can_manage_associates(r.group_id) then raise exception 'Responsável não encontrado ou sem permissão'; end if;
  select * into checked from public.control_status_check(r.group_id, p_item_id, 'responsavel', 'responsável', p_status, p_status_date, p_valid_until, clean_note, p_value_year);
  before_state := public.control_status_snapshot_relative(r.id, p_item_id);
  insert into public.control_statuses(group_id, relative_id, item_id, status, status_date, valid_until, value_year, note, updated_by, updated_at)
  values (r.group_id, r.id, p_item_id, checked.o_status, p_status_date, checked.o_valid_until, p_value_year, clean_note, auth.uid(), now())
  on conflict (relative_id, item_id) do update set status = excluded.status, status_date = excluded.status_date,
    valid_until = excluded.valid_until, value_year = excluded.value_year, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (r.group_id, auth.uid(), 'control_status.set', 'relative', r.id::text,
    jsonb_build_object('before', before_state, 'after', public.control_status_snapshot_relative(r.id, p_item_id)));
end;
$$;

create function public.control_status_clear_relative(p_relative_id uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare relative_group uuid; before_state jsonb;
begin
  select group_id into relative_group from public.relatives where id = p_relative_id;
  if relative_group is null or not public.can_manage_associates(relative_group) then raise exception 'Responsável não encontrado ou sem permissão'; end if;
  before_state := public.control_status_snapshot_relative(p_relative_id, p_item_id);
  if before_state is null then return; end if;
  delete from public.control_statuses where relative_id = p_relative_id and item_id = p_item_id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (relative_group, auth.uid(), 'control_status.cleared', 'relative', p_relative_id::text, jsonb_build_object('before', before_state));
end;
$$;

-- Cadastro (040) + valor inicial dos itens do público do associado.
create or replace function public.associates_create(p_group_id uuid, p_name text, p_branch public.scout_branch, p_section_id uuid, p_patrol_id uuid,
  p_birth_date date, p_promise_date date, p_joined_on date, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; clean_name text;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para cadastrar associados neste grupo'; end if;
  clean_name := public.associates_check_details(p_name, p_birth_date, p_promise_date, p_joined_on, p_notes);
  perform public.associates_check_placement(p_group_id, p_branch, p_section_id, p_patrol_id);
  insert into public.associates(group_id, name, branch, section_id, patrol_id, active, birth_date, promise_date, joined_on, notes)
  values (p_group_id, clean_name, p_branch, p_section_id, p_patrol_id, true, p_birth_date, p_promise_date, p_joined_on, nullif(trim(p_notes), ''))
  returning id into new_id;
  insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
  values (p_group_id, new_id, coalesce(p_joined_on, current_date), 'entrada', 'Cadastro', auth.uid());
  perform public.control_statuses_init(p_group_id, new_id, null, public.associate_audience_of(new_id));
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associate.created', 'associate', new_id::text, public.associate_snapshot(new_id));
  return new_id;
end;
$$;

-- Funções auditadas: responsáveis --------------------------------------------------------------

create function public.relative_link_snapshot(p_link_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('associate_id', l.associate_id, 'relative_id', l.relative_id, 'relative_name', r.name,
    'relative_associate_id', r.associate_id, 'kinship', l.kinship, 'kinship_note', l.kinship_note, 'legal', l.legal, 'financial', l.financial)
  from public.relative_links l join public.relatives r on r.id = l.relative_id where l.id = p_link_id;
$$;

-- Confere o jovem (do grupo, gerenciável, não adulto) e devolve o grupo.
create function public.relatives_check_associate(p_associate_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare a public.associates%rowtype;
begin
  select * into a from public.associates where id = p_associate_id;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if a.branch = 'adulto' then raise exception 'Só jovens têm responsáveis'; end if;
  return a.group_id;
end;
$$;

-- Confere o parentesco; devolve a descrição limpa (obrigatória quando "outro").
create function public.relatives_check_kinship(p_kinship public.relative_kinship, p_kinship_note text)
returns text language plpgsql immutable set search_path = '' as $$
declare clean_note text := nullif(regexp_replace(trim(coalesce(p_kinship_note, '')), '\s+', ' ', 'g'), '');
begin
  if p_kinship is null then raise exception 'Escolha o parentesco'; end if;
  if p_kinship = 'outro' and clean_note is null then raise exception 'Descreva o parentesco (ex.: irmã, avó)'; end if;
  if char_length(clean_note) > 40 then raise exception 'Parentesco: no máximo 40 caracteres'; end if;
  return clean_note;
end;
$$;

-- Confere nome, associado opcional e observações do responsável; devolve o nome limpo.
create function public.relatives_check_details(p_group_id uuid, p_name text, p_relative_associate_id uuid, p_notes text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare clean_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(clean_name) not between 2 and 120 then raise exception 'Informe um nome com 2 a 120 caracteres'; end if;
  if p_relative_associate_id is not null and not exists (select 1 from public.associates where id = p_relative_associate_id and group_id = p_group_id) then
    raise exception 'Associado do responsável não encontrado';
  end if;
  if char_length(trim(p_notes)) > 200 then raise exception 'Observações: no máximo 200 caracteres'; end if;
  return clean_name;
end;
$$;

-- Vincula (sem conferir permissão: uso interno); devolve o id do vínculo.
create function public.relatives_insert_link(p_group_id uuid, p_associate_id uuid, p_relative_id uuid, p_kinship public.relative_kinship,
  p_kinship_note text, p_legal boolean, p_financial boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if p_relative_id in (select id from public.relatives where associate_id = p_associate_id) then
    raise exception 'O jovem não pode ser responsável por si mesmo';
  end if;
  if exists (select 1 from public.relative_links where associate_id = p_associate_id and relative_id = p_relative_id) then
    raise exception 'Este responsável já está vinculado ao jovem';
  end if;
  insert into public.relative_links(group_id, associate_id, relative_id, kinship, kinship_note, legal, financial, position)
  values (p_group_id, p_associate_id, p_relative_id, p_kinship, p_kinship_note, coalesce(p_legal, false), coalesce(p_financial, false),
    (select coalesce(max(position), 0) + 1 from public.relative_links where associate_id = p_associate_id))
  returning id into new_id;
  return new_id;
end;
$$;

-- Cria o responsável, vincula ao jovem e grava o valor inicial dos itens do público responsavel (exceto se ele é
-- associado ativo: aí é controlado como adulto); devolve o id do responsável. Vincular a um associado depois
-- (relatives_rename) não mexe nas situações já gravadas.
create function public.relatives_create(p_associate_id uuid, p_name text, p_kinship public.relative_kinship, p_kinship_note text,
  p_legal boolean, p_financial boolean, p_relative_associate_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid; clean_name text; clean_note text; new_id uuid; link_id uuid;
begin
  gid := public.relatives_check_associate(p_associate_id);
  clean_name := public.relatives_check_details(gid, p_name, p_relative_associate_id, null);
  clean_note := public.relatives_check_kinship(p_kinship, p_kinship_note);
  if p_relative_associate_id = p_associate_id then raise exception 'O jovem não pode ser responsável por si mesmo'; end if;
  insert into public.relatives(group_id, name, associate_id) values (gid, clean_name, p_relative_associate_id) returning id into new_id;
  link_id := public.relatives_insert_link(gid, p_associate_id, new_id, p_kinship, clean_note, p_legal, p_financial);
  if not exists (select 1 from public.associates where id = p_relative_associate_id and active) then
    perform public.control_statuses_init(gid, null, new_id, 'responsavel');
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (gid, auth.uid(), 'relative.created', 'associate', p_associate_id::text, public.relative_link_snapshot(link_id));
  return new_id;
end;
$$;

-- Vincula um responsável já cadastrado (ex.: irmão); devolve o id do vínculo.
create function public.relatives_link(p_associate_id uuid, p_relative_id uuid, p_kinship public.relative_kinship, p_kinship_note text,
  p_legal boolean, p_financial boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid; clean_note text; link_id uuid;
begin
  gid := public.relatives_check_associate(p_associate_id);
  if not exists (select 1 from public.relatives where id = p_relative_id and group_id = gid) then raise exception 'Responsável não encontrado'; end if;
  clean_note := public.relatives_check_kinship(p_kinship, p_kinship_note);
  link_id := public.relatives_insert_link(gid, p_associate_id, p_relative_id, p_kinship, clean_note, p_legal, p_financial);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (gid, auth.uid(), 'relative.linked', 'associate', p_associate_id::text, public.relative_link_snapshot(link_id));
  return link_id;
end;
$$;

create function public.relatives_update_link(p_link_id uuid, p_kinship public.relative_kinship, p_kinship_note text, p_legal boolean, p_financial boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.relative_links%rowtype; clean_note text; before_state jsonb;
begin
  select * into l from public.relative_links where id = p_link_id for update;
  if l.id is null or not public.can_manage_associates(l.group_id) then raise exception 'Vínculo não encontrado ou sem permissão'; end if;
  clean_note := public.relatives_check_kinship(p_kinship, p_kinship_note);
  before_state := public.relative_link_snapshot(l.id);
  update public.relative_links set kinship = p_kinship, kinship_note = clean_note, legal = coalesce(p_legal, false), financial = coalesce(p_financial, false)
  where id = l.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (l.group_id, auth.uid(), 'relative.link_updated', 'associate', l.associate_id::text,
    jsonb_build_object('before', before_state, 'after', public.relative_link_snapshot(l.id)));
end;
$$;

-- Desvincula. O responsável é apagado se ficar sem vínculo e sem situações além do valor inicial
-- (as gravadas no cadastro, ainda iguais ao valor inicial do item e sem observação); senão fica no grupo.
create function public.relatives_unlink(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.relative_links%rowtype; before_state jsonb; removed boolean := false;
begin
  select * into l from public.relative_links where id = p_link_id for update;
  if l.id is null or not public.can_manage_associates(l.group_id) then raise exception 'Vínculo não encontrado ou sem permissão'; end if;
  before_state := public.relative_link_snapshot(l.id);
  delete from public.relative_links where id = l.id;
  if not exists (select 1 from public.relative_links where relative_id = l.relative_id)
     and not exists (select 1 from public.control_statuses s
                     left join public.control_item_audiences a on a.item_id = s.item_id and a.audience = 'responsavel'
                     where s.relative_id = l.relative_id and (s.note is not null or a.initial_status is distinct from s.status)) then
    delete from public.relatives where id = l.relative_id;
    removed := true;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (l.group_id, auth.uid(), 'relative.unlinked', 'associate', l.associate_id::text, before_state || jsonb_build_object('relative_deleted', removed));
end;
$$;

-- Nome, associado (quando o responsável também é associado) e observações; valem para todos os jovens ligados.
create function public.relatives_rename(p_relative_id uuid, p_name text, p_relative_associate_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.relatives%rowtype; clean_name text;
begin
  select * into r from public.relatives where id = p_relative_id for update;
  if r.id is null or not public.can_manage_associates(r.group_id) then raise exception 'Responsável não encontrado ou sem permissão'; end if;
  clean_name := public.relatives_check_details(r.group_id, p_name, p_relative_associate_id, p_notes);
  if exists (select 1 from public.relative_links where relative_id = r.id and associate_id = p_relative_associate_id) then
    raise exception 'O jovem não pode ser responsável por si mesmo';
  end if;
  update public.relatives set name = clean_name, associate_id = p_relative_associate_id, notes = nullif(trim(p_notes), ''), updated_at = now()
  where id = r.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (r.group_id, auth.uid(), 'relative.updated', 'relative', r.id::text,
    jsonb_build_object('before', jsonb_build_object('name', r.name, 'associate_id', r.associate_id, 'notes', r.notes),
      'after', jsonb_build_object('name', clean_name, 'associate_id', p_relative_associate_id, 'notes', nullif(trim(p_notes), ''))));
end;
$$;

-- Desligamento (040) + quantos itens o trigger da saída marcou "a remover" na auditoria ------------
create or replace function public.associates_leave(p_associate_id uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.associates%rowtype; last_entry date; to_remove int;
begin
  select * into a from public.associates where id = p_associate_id for update;
  if a.id is null or not public.can_manage_associates(a.group_id) then raise exception 'Associado não encontrado ou sem permissão'; end if;
  if not a.active then raise exception 'O associado já está desligado'; end if;
  if p_date is null then raise exception 'Informe a data do desligamento'; end if;
  if p_date > current_date then raise exception 'A data do desligamento não pode ser futura'; end if;
  if char_length(trim(p_reason)) > 120 then raise exception 'Motivo: no máximo 120 caracteres'; end if;
  select max(movement_date) into last_entry from public.associate_movements where associate_id = a.id and kind = 'entrada';
  if p_date < last_entry then raise exception 'O desligamento não pode ser antes da última entrada (%)', to_char(last_entry, 'DD/MM/YYYY'); end if;
  insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
  values (a.group_id, a.id, p_date, 'saida', nullif(trim(p_reason), ''), auth.uid());
  update public.associates set active = false, updated_at = now() where id = a.id;
  -- O trigger da saída já marcou "a remover"; conta o que ele marcou nesta transação.
  select count(*) into to_remove from public.control_statuses
  where (associate_id = a.id or relative_id in (select relative_id from public.relative_links where associate_id = a.id))
    and status = 'a_remover' and updated_at = now();
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.left', 'associate', a.id::text,
    jsonb_build_object('date', p_date, 'reason', nullif(trim(p_reason), ''), 'to_remove', to_remove));
end;
$$;

-- Importação (040): ao mudar `active` de um associado existente, grava a movimentação (hoje), e o
-- trigger mantém `active` coerente. Associado novo não ganha movimentação (como antes), mas ganha o
-- valor inicial dos itens de controle do seu público (como em associates_create).
create or replace function public.import_associates(p_group_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb;
  idx bigint;
  row_id uuid;
  row_name text;
  row_branch public.scout_branch;
  section_name text;
  patrol_name text;
  row_section uuid;
  row_patrol uuid;
  row_active boolean;
  old_active boolean;
  created int := 0;
  updated int := 0;
begin
  if not public.can_manage_associates(p_group_id) then raise exception 'Sem permissão para gerir associados neste grupo'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Nenhum associado para importar'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Importe no máximo 5.000 associados por vez'; end if;

  for row_data, idx in select value, ordinality from jsonb_array_elements(p_rows) with ordinality
  loop
    row_name := regexp_replace(trim(coalesce(row_data->>'name', '')), '\s+', ' ', 'g');
    if char_length(row_name) not between 2 and 120 then raise exception 'Linha %: nome com 2 a 120 caracteres', idx; end if;
    if not pg_input_is_valid(coalesce(row_data->>'branch', ''), 'public.scout_branch') then raise exception 'Linha %: ramo inválido', idx; end if;
    row_branch := (row_data->>'branch')::public.scout_branch;
    section_name := nullif(regexp_replace(trim(coalesce(row_data->>'section', '')), '\s+', ' ', 'g'), '');
    patrol_name := nullif(regexp_replace(trim(coalesce(row_data->>'patrol', '')), '\s+', ' ', 'g'), '');
    row_section := null;
    row_patrol := null;
    if section_name is not null then
      select id into row_section from public.sections
      where group_id = p_group_id and branch = row_branch and lower(name) = lower(section_name);
      if row_section is null then raise exception 'Linha %: seção "%" não cadastrada no ramo', idx, section_name; end if;
    end if;
    if patrol_name is not null then
      if row_section is null then raise exception 'Linha %: patrulha sem seção', idx; end if;
      select id into row_patrol from public.patrols where section_id = row_section and lower(name) = lower(patrol_name);
      if row_patrol is null then raise exception 'Linha %: patrulha "%" não cadastrada na seção', idx, patrol_name; end if;
    end if;
    row_active := coalesce((row_data->>'active')::boolean, true);
    row_id := nullif(row_data->>'id', '')::uuid;

    if row_id is null then
      insert into public.associates(group_id, name, branch, section_id, patrol_id, active)
      values (p_group_id, row_name, row_branch, row_section, row_patrol, row_active)
      returning id into row_id;
      perform public.control_statuses_init(p_group_id, row_id, null, public.associate_audience_of(row_id));
      created := created + 1;
    else
      select active into old_active from public.associates where id = row_id and group_id = p_group_id for update;
      if not found then raise exception 'Linha %: associado não encontrado', idx; end if;
      update public.associates set branch = row_branch, section_id = row_section, patrol_id = row_patrol, active = row_active, updated_at = now()
      where id = row_id;
      if old_active is distinct from row_active then
        insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason, created_by)
        values (p_group_id, row_id, current_date, case when row_active then 'entrada' else 'saida' end::public.associate_movement_kind, 'Importação', auth.uid());
      end if;
      updated := updated + 1;
    end if;
  end loop;

  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'associates.imported', 'associate', p_group_id::text,
    jsonb_build_object('created', created, 'updated', updated));
  return jsonb_build_object('created', created, 'updated', updated);
end;
$$;

-- Itens iniciais para os grupos que já existem.
select public.control_items_seed(id) from public.groups;

-- Permissões das funções -----------------------------------------------------------------------
revoke all on function public.associate_function_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.control_item_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.control_item_check(uuid, uuid, text, public.control_item_kind, public.directorate, jsonb, int) from public, anon, authenticated;
revoke all on function public.control_item_save_audiences(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.control_item_applies(uuid, public.control_audience) from public, anon, authenticated;
revoke all on function public.control_items_renumber(uuid, public.directorate) from public, anon, authenticated;
revoke all on function public.control_items_seed(uuid) from public, anon, authenticated;
revoke all on function public.associate_audience_of(uuid) from public, anon, authenticated;
revoke all on function public.control_status_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.control_status_snapshot_relative(uuid, uuid) from public, anon, authenticated;
revoke all on function public.control_status_check(uuid, uuid, public.control_audience, text, public.control_status, date, date, text, int) from public, anon, authenticated;
revoke all on function public.control_statuses_init(uuid, uuid, uuid, public.control_audience) from public, anon, authenticated;
revoke all on function public.relative_link_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.relatives_check_associate(uuid) from public, anon, authenticated;
revoke all on function public.relatives_check_kinship(public.relative_kinship, text) from public, anon, authenticated;
revoke all on function public.relatives_check_details(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.relatives_insert_link(uuid, uuid, uuid, public.relative_kinship, text, boolean, boolean) from public, anon, authenticated;

revoke all on function public.associates_add_function(uuid, public.associate_function_kind, text, date) from public, anon;
revoke all on function public.associates_end_function(uuid, date) from public, anon;
revoke all on function public.associates_delete_function(uuid) from public, anon;
revoke all on function public.control_item_create(uuid, text, public.control_item_kind, public.directorate, jsonb, int, boolean, public.control_value_kind) from public, anon;
revoke all on function public.control_item_update(uuid, text, public.control_item_kind, public.directorate, jsonb, int, boolean, boolean, public.control_value_kind) from public, anon;
revoke all on function public.control_item_place(uuid, int) from public, anon;
revoke all on function public.associates_seed_control_items(uuid) from public, anon;
revoke all on function public.control_status_set(uuid, uuid, public.control_status, date, date, text, int) from public, anon;
revoke all on function public.control_status_clear(uuid, uuid) from public, anon;
revoke all on function public.control_status_set_relative(uuid, uuid, public.control_status, date, date, text, int) from public, anon;
revoke all on function public.control_status_clear_relative(uuid, uuid) from public, anon;
revoke all on function public.relatives_create(uuid, text, public.relative_kinship, text, boolean, boolean, uuid) from public, anon;
revoke all on function public.relatives_link(uuid, uuid, public.relative_kinship, text, boolean, boolean) from public, anon;
revoke all on function public.relatives_update_link(uuid, public.relative_kinship, text, boolean, boolean) from public, anon;
revoke all on function public.relatives_unlink(uuid) from public, anon;
revoke all on function public.relatives_rename(uuid, text, uuid, text) from public, anon;

grant execute on function public.associates_add_function(uuid, public.associate_function_kind, text, date) to authenticated;
grant execute on function public.associates_end_function(uuid, date) to authenticated;
grant execute on function public.associates_delete_function(uuid) to authenticated;
grant execute on function public.control_item_create(uuid, text, public.control_item_kind, public.directorate, jsonb, int, boolean, public.control_value_kind) to authenticated;
grant execute on function public.control_item_update(uuid, text, public.control_item_kind, public.directorate, jsonb, int, boolean, boolean, public.control_value_kind) to authenticated;
grant execute on function public.control_item_place(uuid, int) to authenticated;
grant execute on function public.associates_seed_control_items(uuid) to authenticated;
grant execute on function public.control_status_set(uuid, uuid, public.control_status, date, date, text, int) to authenticated;
grant execute on function public.control_status_clear(uuid, uuid) to authenticated;
grant execute on function public.control_status_set_relative(uuid, uuid, public.control_status, date, date, text, int) to authenticated;
grant execute on function public.control_status_clear_relative(uuid, uuid) to authenticated;
grant execute on function public.relatives_create(uuid, text, public.relative_kinship, text, boolean, boolean, uuid) to authenticated;
grant execute on function public.relatives_link(uuid, uuid, public.relative_kinship, text, boolean, boolean) to authenticated;
grant execute on function public.relatives_update_link(uuid, public.relative_kinship, text, boolean, boolean) to authenticated;
grant execute on function public.relatives_unlink(uuid) to authenticated;
grant execute on function public.relatives_rename(uuid, text, uuid, text) to authenticated;
