-- 005 — Vida escoteira: períodos não contabilizados (POR, Regra 173, II b e c).
--
-- Tempo em que a pessoa esteve no grupo, mas que não conta para as estrelas de atividade: frequência de até 70% das
-- reuniões e atividades nos doze meses, licença superior a 60 dias ou suspensão por medida disciplinar (ou outro motivo,
-- com observação). Fica por cima dos períodos de atividade (`associate_life_periods`), que não mudam: a contagem
-- (lib/associates/scout-life.ts) desconta esses trechos como lacunas e a barra os mostra listrados.
--
-- Escrita só pelas funções auditadas, para Editor do Associados.

create table public.associate_life_exclusions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  associate_id uuid not null references public.associates(id) on delete cascade,
  started_on date not null,
  ended_on date not null,
  reason text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  constraint associate_life_exclusions_dates check (ended_on > started_on),
  constraint associate_life_exclusions_reason check (reason in ('frequencia', 'licenca', 'suspensao', 'outro')),
  constraint associate_life_exclusions_note check (char_length(note) between 1 and 500),
  constraint associate_life_exclusions_other_note check (reason <> 'outro' or note is not null)
);
create index associate_life_exclusions_associate_idx on public.associate_life_exclusions(associate_id, started_on);
create index associate_life_exclusions_group_idx on public.associate_life_exclusions(group_id);

alter table public.associate_life_exclusions enable row level security;
create policy "associates readers read life exclusions" on public.associate_life_exclusions for select using (public.can_read_associates(group_id));
grant select on public.associate_life_exclusions to authenticated;

/**
 * Inclui (sem `p_exclusion_id`) ou corrige um período não contabilizado; devolve o id. Intervalo [início, fim), sem
 * sobrepor outro; licença só acima de 60 dias (as mais curtas contam, pela regra); "outro" pede observação.
 */
create function public.life_exclusion_save(p_associate_id uuid, p_exclusion_id uuid, p_started_on date, p_ended_on date,
  p_reason text, p_note text) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare a public.associates%rowtype; saved uuid; clash record; clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  a := public.life_associate_for_edit(p_associate_id);
  if p_started_on is null or p_ended_on is null then raise exception 'Informe o início e o fim'; end if;
  if p_ended_on <= p_started_on then raise exception 'O fim deve ser depois do início'; end if;
  if p_started_on > public.life_today() then raise exception 'O início não pode ser futuro'; end if;
  if p_reason is null or p_reason not in ('frequencia', 'licenca', 'suspensao', 'outro') then raise exception 'Escolha o motivo'; end if;
  if p_reason = 'licenca' and p_ended_on - p_started_on <= 60 then
    raise exception 'Licença de até 60 dias conta como atividade (POR, Regra 173): não precisa ser lançada';
  end if;
  if p_reason = 'outro' and clean_note is null then raise exception 'Descreva o motivo na observação'; end if;
  if char_length(clean_note) > 500 then raise exception 'Observação: no máximo 500 caracteres'; end if;
  select started_on, ended_on into clash from public.associate_life_exclusions
  where associate_id = a.id and id is distinct from p_exclusion_id
    and daterange(started_on, ended_on, '[)') && daterange(p_started_on, p_ended_on, '[)')
  order by started_on limit 1;
  if found then
    raise exception 'Sobrepõe outro período não contabilizado (% a %)', to_char(clash.started_on, 'DD/MM/YYYY'), to_char(clash.ended_on, 'DD/MM/YYYY');
  end if;
  if p_exclusion_id is null then
    insert into public.associate_life_exclusions(group_id, associate_id, started_on, ended_on, reason, note, created_by)
    values (a.group_id, a.id, p_started_on, p_ended_on, p_reason, clean_note, auth.uid())
    returning id into saved;
  else
    update public.associate_life_exclusions set started_on = p_started_on, ended_on = p_ended_on, reason = p_reason, note = clean_note
    where id = p_exclusion_id and associate_id = a.id returning id into saved;
    if saved is null then raise exception 'Período não encontrado'; end if;
  end if;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), case when p_exclusion_id is null then 'associate.life_exclusion_added' else 'associate.life_exclusion_updated' end,
    'associate', a.id::text, jsonb_build_object('exclusion_id', saved, 'started_on', p_started_on, 'ended_on', p_ended_on, 'reason', p_reason));
  return saved;
end;
$$;

create function public.life_exclusion_delete(p_exclusion_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare e public.associate_life_exclusions%rowtype; a public.associates%rowtype;
begin
  select * into e from public.associate_life_exclusions where id = p_exclusion_id;
  if e.id is null then raise exception 'Período não encontrado'; end if;
  a := public.life_associate_for_edit(e.associate_id);
  delete from public.associate_life_exclusions where id = e.id;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (a.group_id, auth.uid(), 'associate.life_exclusion_deleted', 'associate', a.id::text,
    jsonb_build_object('exclusion_id', e.id, 'started_on', e.started_on, 'ended_on', e.ended_on, 'reason', e.reason));
end;
$$;

revoke all on function public.life_exclusion_save(uuid, uuid, date, date, text, text) from public;
grant execute on function public.life_exclusion_save(uuid, uuid, date, date, text, text) to authenticated;
revoke all on function public.life_exclusion_delete(uuid) from public;
grant execute on function public.life_exclusion_delete(uuid) to authenticated;
