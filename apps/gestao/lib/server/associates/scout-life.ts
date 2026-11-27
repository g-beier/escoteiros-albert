import type { ScoutBranch } from "@/lib/associates/model";
import type {
  ExclusionReason,
  LifeEvent,
  LifeExclusion,
  LifePeriod,
  StarRecord,
  SuggestedPeriod,
} from "@/lib/associates/scout-life";
import type { Db } from "@/lib/server/db";
import { rows, rpc, run } from "@/lib/server/pg/db";

// Vida escoteira (004): leituras de `associate_life_periods`, `associate_stars`, `associate_life_events` e
// `associates.life_notes`; escritas pelas funções auditadas life_* (Editor do Associados).

const PERIOD_COLUMNS = "id, associate_id, branch, started_on, ended_on, place, source";

export type LifeData = {
  periods: LifePeriod[];
  stars: StarRecord[];
  events: LifeEvent[];
  exclusions: LifeExclusion[];
  notes: string | null;
};

/** Tudo da vida escoteira de um associado. */
export async function ofAssociate(db: Db, associateId: string): Promise<LifeData> {
  return run(db, async (sql) => {
    const [periods, stars, events, exclusions, notes] = await Promise.all([
      sql`select ${sql.unsafe(PERIOD_COLUMNS)} from public.associate_life_periods where associate_id = ${associateId} order by started_on`,
      sql`select star, branch, delivered_on from public.associate_stars where associate_id = ${associateId} order by star`,
      sql`select id, event_date, title, description from public.associate_life_events where associate_id = ${associateId} order by event_date, created_at`,
      sql`select id, started_on, ended_on, reason, note from public.associate_life_exclusions where associate_id = ${associateId} order by started_on`,
      sql`select life_notes from public.associates where id = ${associateId}`,
    ]);
    return {
      periods: [...periods] as unknown as LifePeriod[],
      stars: [...stars] as unknown as StarRecord[],
      events: [...events] as unknown as LifeEvent[],
      exclusions: [...exclusions] as unknown as LifeExclusion[],
      notes: (notes[0]?.life_notes as string | null) ?? null,
    };
  });
}

export type GroupLife = {
  periods: Map<string, LifePeriod[]>;
  stars: Map<string, StarRecord[]>;
  exclusions: Map<string, LifeExclusion[]>;
};

/** Períodos e estrelas de todos os associados do grupo, por associado. */
export async function ofGroup(db: Db, groupId: string): Promise<GroupLife> {
  return run(db, async (sql) => {
    const [periods, stars, exclusions] = await Promise.all([
      sql`select ${sql.unsafe(PERIOD_COLUMNS)} from public.associate_life_periods where group_id = ${groupId} order by associate_id, started_on limit 100000`,
      sql`select associate_id, star, branch, delivered_on from public.associate_stars where group_id = ${groupId} order by associate_id, star limit 100000`,
      sql`select id, associate_id, started_on, ended_on, reason, note from public.associate_life_exclusions where group_id = ${groupId} order by associate_id, started_on limit 100000`,
    ]);
    const byAssociate = <T>(list: readonly Record<string, unknown>[]) => {
      const map = new Map<string, T[]>();
      for (const row of list)
        map.set(row.associate_id as string, [...(map.get(row.associate_id as string) ?? []), row as T]);
      return map;
    };
    return {
      periods: byAssociate<LifePeriod>(periods),
      stars: byAssociate<StarRecord>(stars),
      exclusions: byAssociate<LifeExclusion>(exclusions),
    };
  });
}

/** Ids dos associados com eventos lançados (para o relatório). */
export async function withEvents(db: Db, groupId: string): Promise<Set<string>> {
  const list = await rows<{ associate_id: string }>(
    db,
    (sql) => sql`
    select distinct associate_id from public.associate_life_events where group_id = ${groupId} limit 100000`,
  );
  return new Set(list.map((row) => row.associate_id));
}

export type PeriodInput = {
  associateId: string;
  periodId: string | null;
  branch: ScoutBranch;
  startedOn: string;
  endedOn: string | null;
  place: string | null;
};

/** Inclui (sem `periodId`) ou corrige um período. */
export async function savePeriod(db: Db, input: PeriodInput): Promise<string> {
  return rpc(db, "life_period_save", {
    p_associate_id: input.associateId,
    p_period_id: input.periodId,
    p_branch: input.branch,
    p_started_on: input.startedOn,
    p_ended_on: input.endedOn,
    p_place: input.place,
  });
}

export async function deletePeriod(db: Db, periodId: string): Promise<void> {
  await rpc(db, "life_period_delete", { p_period_id: periodId });
}

/** Inclui vários períodos de uma vez (sugestão do cadastro ou planilha); tudo ou nada. */
export async function addPeriods(
  db: Db,
  associateId: string,
  periods: (SuggestedPeriod & { place?: string | null })[],
  source: "cadastro" | "planilha",
): Promise<number> {
  return rpc(db, "life_periods_add", { p_associate_id: associateId, p_periods: periods, p_source: source });
}

/** Encerra o vigente na data e, com `branch`, abre outro nela. */
export async function switchPeriod(
  db: Db,
  associateId: string,
  date: string,
  branch: ScoutBranch | null,
): Promise<void> {
  await rpc(db, "life_period_switch", { p_associate_id: associateId, p_date: date, p_branch: branch });
}

/** Certificado da estrela entregue (quita as anteriores); `null` desfaz. */
export async function deliverStar(db: Db, associateId: string, star: number, date: string | null): Promise<void> {
  await rpc(db, "life_star_deliver", { p_associate_id: associateId, p_star: star, p_date: date });
}

/** Ramo corrigido da estrela; `null` volta ao calculado. */
export async function setStarBranch(
  db: Db,
  associateId: string,
  star: number,
  branch: ScoutBranch | null,
): Promise<void> {
  await rpc(db, "life_star_set_branch", { p_associate_id: associateId, p_star: star, p_branch: branch });
}

export type EventInput = {
  associateId: string;
  eventId: string | null;
  date: string;
  title: string;
  description: string | null;
};

export async function saveEvent(db: Db, input: EventInput): Promise<string> {
  return rpc(db, "life_event_save", {
    p_associate_id: input.associateId,
    p_event_id: input.eventId,
    p_date: input.date,
    p_title: input.title,
    p_description: input.description,
  });
}

export async function deleteEvent(db: Db, eventId: string): Promise<void> {
  await rpc(db, "life_event_delete", { p_event_id: eventId });
}

export async function setNotes(db: Db, associateId: string, notes: string | null): Promise<void> {
  await rpc(db, "life_notes_set", { p_associate_id: associateId, p_notes: notes });
}

export type ExclusionInput = {
  associateId: string;
  exclusionId: string | null;
  startedOn: string;
  endedOn: string;
  reason: ExclusionReason;
  note: string | null;
};

/** Inclui (sem `exclusionId`) ou corrige um período não contabilizado (POR, Regra 173). */
export async function saveExclusion(db: Db, input: ExclusionInput): Promise<string> {
  return rpc(db, "life_exclusion_save", {
    p_associate_id: input.associateId,
    p_exclusion_id: input.exclusionId,
    p_started_on: input.startedOn,
    p_ended_on: input.endedOn,
    p_reason: input.reason,
    p_note: input.note,
  });
}

export async function deleteExclusion(db: Db, exclusionId: string): Promise<void> {
  await rpc(db, "life_exclusion_delete", { p_exclusion_id: exclusionId });
}
