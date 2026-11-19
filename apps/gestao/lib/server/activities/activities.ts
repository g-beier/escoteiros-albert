import type { ActivityDetail, ActivityRow, ActivityScheduleItem } from "@/lib/activities/model";
import { isActivitySection, type ActivityKind, type ActivitySection } from "@/lib/activities/vocabulary";
import { DataError, type Db } from "@/lib/server/db";
import type { Json } from "@/lib/server/supabase/database.types";
import { rowsOf, rpc, sb } from "@/lib/server/supabase/db";

/** Atividades do grupo que intersectam o intervalo (inclusive), inclusive multi-dia. */
export async function listInRange(db: Db, groupId: string, from: string, to: string): Promise<ActivityRow[]> {
  const rows = rowsOf(await sb(db).from("activities")
    .select("id, kind, title, starts_on, ends_on, start_time, end_time, branches, authorization_doc")
    .eq("group_id", groupId)
    .lte("starts_on", to)
    .or(`ends_on.is.null,ends_on.gte.${from}`)
    .order("starts_on", { ascending: true })
    .order("start_time", { ascending: true }));
  // `starts_on <= to` + (`ends_on` nulo ou `>= from`) ainda inclui quem começa depois do mês
  // se ends_on for null — filtramos no app: intersecta [from, to].
  const filtered = rows.filter((row) => {
    const end = row.ends_on && row.ends_on >= row.starts_on ? row.ends_on : row.starts_on;
    return row.starts_on <= to && end >= from;
  });
  return filtered.map((row) => ({
    id: row.id,
    kind: row.kind as ActivityKind,
    title: row.title,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    start_time: row.start_time,
    end_time: row.end_time,
    branches: sectionsOf(row.branches),
    venue_name: venueNameOf(row.authorization_doc),
  }));
}

function sectionsOf(value: unknown): ActivitySection[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ActivitySection => typeof item === "string" && isActivitySection(item));
}

function venueNameOf(doc: unknown): string | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const name = (doc as { venueName?: unknown }).venueName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export async function getById(db: Db, groupId: string, id: string): Promise<ActivityDetail | null> {
  const { data, error } = await sb(db).from("activities")
    .select("id, kind, title, starts_on, ends_on, start_time, end_time, branches, schedule, authorization_doc, attendance, plan_actions")
    .eq("group_id", groupId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DataError(error.message, error.code);
  if (!data) return null;
  return {
    id: data.id,
    kind: data.kind as ActivityKind,
    title: data.title,
    starts_on: data.starts_on,
    ends_on: data.ends_on,
    start_time: data.start_time,
    end_time: data.end_time,
    branches: sectionsOf(data.branches),
    venue_name: venueNameOf(data.authorization_doc),
    schedule: Array.isArray(data.schedule) ? data.schedule as ActivityScheduleItem[] : [],
    authorization: data.authorization_doc ?? null,
    attendance: data.attendance ?? [],
    plan_actions: data.plan_actions ?? [],
  };
}

export async function save(db: Db, groupId: string, input: {
  id?: string | null;
  kind: ActivityKind;
  title?: string | null;
  startsOn: string;
  endsOn?: string | null;
  startTime: string;
  endTime?: string | null;
  branches: ActivitySection[];
  schedule?: unknown;
  authorization?: unknown;
  attendance?: string[];
  planActions?: string[];
}) {
  return rpc(db, "activity_save", {
    p_group_id: groupId,
    p_id: input.id ?? null,
    p_kind: input.kind,
    p_title: input.title ?? null,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn ?? null,
    p_start_time: input.startTime,
    p_end_time: input.endTime ?? null,
    p_schedule: (input.schedule ?? []) as Json,
    p_authorization: (input.authorization ?? null) as Json | null,
    p_attendance: input.attendance ?? [],
    p_plan_actions: input.planActions ?? [],
    p_branches: input.branches,
  });
}

export async function remove(db: Db, id: string) {
  await rpc(db, "activity_delete", { p_id: id });
}
