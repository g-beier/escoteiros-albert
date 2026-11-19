import type { PatrolItem, ScoutBranch, SectionItem } from "@/lib/associates/model";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb } from "@/lib/server/supabase/db";

// Seções e equipes (028–030): gravadas pelas funções auditadas, que conferem `can_manage_associates` (040).

export type Catalog = { sections: SectionItem[]; patrols: PatrolItem[] };

/** Seções e equipes do grupo (ativas e inativas), por nome. */
export async function catalog(db: Db, groupId: string): Promise<Catalog> {
  const [sections, patrols] = await Promise.all([
    sb(db).from("sections").select("id, branch, name, active").eq("group_id", groupId).order("name").then(rowsOf),
    sb(db).from("patrols").select("id, section_id, name, active").eq("group_id", groupId).order("name").then(rowsOf),
  ]);
  return {
    sections: sections.map((s): SectionItem => ({ id: s.id, branch: s.branch, name: s.name, active: s.active })),
    patrols: patrols.map((p): PatrolItem => ({ id: p.id, sectionId: p.section_id, name: p.name, active: p.active })),
  };
}

/** Associados ativos por seção e por equipe (id → quantidade). */
export async function activeCounts(db: Db, groupId: string): Promise<Record<string, number>> {
  const rows = rowsOf(await sb(db).from("associates").select("section_id, patrol_id").eq("group_id", groupId).eq("active", true).limit(10000));
  const counts: Record<string, number> = {};
  for (const row of rows) for (const key of [row.section_id, row.patrol_id]) if (key) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}

export async function createSection(db: Db, groupId: string, branch: ScoutBranch, name: string) {
  await rpc(db, "create_section", { p_group_id: groupId, p_branch: branch, p_name: name });
}
/** Renomeia e, com `active` (não nulo), ativa ou inativa. */
export async function updateSection(db: Db, id: string, name: string, active: boolean | null) {
  await rpc(db, "update_section", { p_section_id: id, p_name: name, p_active: active });
}
export async function createPatrol(db: Db, sectionId: string, name: string) {
  await rpc(db, "create_patrol", { p_section_id: sectionId, p_name: name });
}
export async function updatePatrol(db: Db, id: string, name: string, active: boolean | null) {
  await rpc(db, "update_patrol", { p_patrol_id: id, p_name: name, p_active: active });
}
