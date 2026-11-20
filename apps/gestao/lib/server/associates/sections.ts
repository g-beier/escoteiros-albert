import { scouterCounts, type AssociateFunction } from "@/lib/associates/controls";
import { todayISO, type PatrolItem, type ScoutBranch, type SectionItem } from "@/lib/associates/model";
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

export type SectionCounts = {
  /** Jovens ativos por seção e por equipe (id → quantidade). */
  youth: Record<string, number>;
  /** Escotistas ativos (com função de escotista ativa) por seção (052). */
  scouters: Record<string, number>;
};

/** Efetivo de cada seção: jovens (e por equipe) e escotistas. */
export async function activeCounts(db: Db, groupId: string): Promise<SectionCounts> {
  const [rows, functions] = await Promise.all([
    sb(db).from("associates").select("id, section_id, patrol_id").eq("group_id", groupId).eq("active", true).limit(10000).then(rowsOf),
    sb(db).from("associate_function_rows").select("id, associate_id, kind, title, started_on, ended_on, section_id, section, elected")
      .eq("group_id", groupId).eq("kind", "escotista").not("section_id", "is", null).limit(10000).then(rowsOf),
  ]);
  const youth: Record<string, number> = {};
  for (const row of rows) for (const key of [row.section_id, row.patrol_id]) if (key) youth[key] = (youth[key] ?? 0) + 1;
  return { youth, scouters: scouterCounts(functions as AssociateFunction[], new Set(rows.map((row) => row.id)), todayISO()) };
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
