-- 026 — Estrelas de atividade para os chefes no Início; `associates` só se escreve pelas funções auditadas.
--
-- * O chefe sem acesso ao Associados (só Inventário, ligado ao associado adulto em /usuarios) já via no Início os
--   aniversários, promessas e transições dos jovens das seções em que é escotista (`associates_section_alert_rows`,
--   002). Agora vê também as estrelas de atividade a entregar desses jovens: `associates_section_star_rows` devolve só
--   o que a conta das estrelas usa (períodos, estrelas registradas, períodos não contabilizados), para os mesmos
--   jovens; a promessa já vem nas linhas dos avisos. A conta continua no TS (lib/associates/scout-life.ts).
-- * Os avisos por seção deixam de fora quem está em quarentena de exclusão (018), como as telas do Associados.
-- * A política "editors manage associates" (001, 018) deixava o Editor do Financeiro fazer INSERT/UPDATE/DELETE direto
--   em `associates`, sem auditoria. Todas as escritas do app passam pelas funções `associates_*`/`life_*`/`import_*`
--   (security definer): a política vira só leitura, para quem ela cobria (Editor do Financeiro), com a mesma regra da
--   quarentena.

-- Avisos por seção: sem quem está em quarentena ---------------------------------------------------------------------

create or replace function public.associates_section_alert_rows(p_group_id uuid)
  returns table(id uuid, name text, active boolean, branch public.scout_branch, birth_date date, promise_date date,
    transition_started_on date)
  language sql stable security definer set search_path to '' as $$
  with my_sections as (
    select distinct f.section_id
    from public.memberships m
    join public.associates me on me.id = m.associate_id and me.active
    join public.associate_functions f on f.associate_id = me.id
    where m.group_id = p_group_id and m.user_id = auth.uid()
      and f.kind = 'escotista' and f.section_id is not null
      and (f.started_on is null or f.started_on <= current_date)
      and (f.ended_on is null or f.ended_on >= current_date)
  )
  select a.id, a.name, a.active, a.branch, a.birth_date, a.promise_date, a.transition_started_on
  from public.associates a
  where a.group_id = p_group_id and a.active and a.branch <> 'adulto' and a.deletion_due_on is null
    and a.section_id in (select section_id from my_sections)
  order by a.name;
$$;

-- Estrelas por seção ---------------------------------------------------------------------------------------------------

/**
 * Vida escoteira dos mesmos jovens de `associates_section_alert_rows` (seções em que quem está logado é escotista hoje),
 * só com o que a conta das estrelas de atividade usa: períodos (ramo, início, fim), estrelas registradas (número, ramo
 * corrigido, entrega) e períodos não contabilizados (início, fim). Sem lugar, origem, motivo nem observações.
 */
create function public.associates_section_star_rows(p_group_id uuid)
  returns table(associate_id uuid, periods jsonb, stars jsonb, exclusions jsonb)
  language sql stable security definer set search_path to '' as $$
  select y.id,
    coalesce((select jsonb_agg(jsonb_build_object('branch', p.branch, 'started_on', p.started_on, 'ended_on', p.ended_on)
        order by p.started_on)
      from public.associate_life_periods p where p.associate_id = y.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('star', s.star, 'branch', s.branch, 'delivered_on', s.delivered_on)
        order by s.star)
      from public.associate_stars s where s.associate_id = y.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('started_on', e.started_on, 'ended_on', e.ended_on) order by e.started_on)
      from public.associate_life_exclusions e where e.associate_id = y.id), '[]'::jsonb)
  from public.associates_section_alert_rows(p_group_id) y;
$$;

revoke all on function public.associates_section_star_rows(uuid) from public;
grant execute on function public.associates_section_star_rows(uuid) to authenticated;

-- associates: sem escrita direta ---------------------------------------------------------------------------------------

drop policy "editors manage associates" on public.associates;
create policy "finance editors read associates" on public.associates for select
  using (public.can_edit_group(group_id) and deletion_due_on is null);
