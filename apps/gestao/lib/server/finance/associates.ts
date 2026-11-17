import type { AssociateItem } from "@/components/finance/new-associate";
import type { PatrolItem, ScoutBranch, SectionItem } from "@/lib/finance/associates";
import { DataError, type Db } from "@/lib/server/db";
import { rowsOf, rpc, untyped } from "@/lib/server/supabase/db";

// Associados, seções e equipes (004, 028–030). Associados são gravados direto na tabela (política por grupo);
// seções e equipes, pelas funções auditadas.

/** Associados do grupo (ativos primeiro), seções e equipes. */
export async function listWithCatalog(db: Db, groupId: string) {
  const supabase = untyped(db);
  const [associates, sections, patrols] = await Promise.all([
    supabase.from("associate_rows").select("id, name, branch, section_id, section, patrol_id, patrol, active")
      .eq("group_id", groupId).order("active", { ascending: false }).order("name").then(rowsOf),
    supabase.from("sections").select("id, branch, name, active").eq("group_id", groupId).order("name").then(rowsOf),
    supabase.from("patrols").select("id, section_id, name, active").eq("group_id", groupId).order("name").then(rowsOf),
  ]);
  return {
    associates: associates as AssociateItem[],
    catalog: {
      sections: sections as SectionItem[],
      patrols: (patrols as { id: string; section_id: string; name: string; active: boolean }[])
        .map((p): PatrolItem => ({ id: p.id, sectionId: p.section_id, name: p.name, active: p.active })),
    },
  };
}

/** Associados para os seletores (Devedores): nome, seção e se está ativo. */
export async function listForPicker(db: Db, groupId: string) {
  return rowsOf(await untyped(db).from("associate_rows").select("id, name, section, active").eq("group_id", groupId).order("name").limit(5000)) as
    { id: string; name: string; section: string | null; active: boolean }[];
}

export type AssociateInput = { name: string; branch: ScoutBranch; section_id: string | null; patrol_id: string | null };

/** Chaves compostas de 028: seção de outro ramo ou equipe de outra seção. */
function writeError(error: { code?: string; message: string }): never {
  if (error.code === "23503" || error.code === "23514") throw new DataError("A seção precisa ser do ramo do associado, e a equipe, da seção escolhida.", error.code);
  throw new DataError(error.message, error.code);
}

export async function createAssociate(db: Db, groupId: string, input: AssociateInput) {
  const { error } = await untyped(db).from("associates").insert({ group_id: groupId, ...input });
  if (error) writeError(error);
}

/** Edita nome e divisão, ou só ativa/inativa (`{ active }`). */
export async function updateAssociate(db: Db, groupId: string, id: string, patch: AssociateInput | { active: boolean }) {
  const { error } = await untyped(db).from("associates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("group_id", groupId);
  if (error) writeError(error);
}

export type AssociateImportRow = { id?: string; name: string; branch: ScoutBranch; section?: string | null; patrol?: string | null; active: boolean };

/** Importação em massa (tudo ou nada): cadastra os novos e atualiza os com `id`. */
export async function importAssociates(db: Db, groupId: string, rows: AssociateImportRow[]): Promise<{ created: number; updated: number }> {
  const data = await rpc(db, "import_associates", { p_group_id: groupId, p_rows: rows });
  const result = (data ?? {}) as { created?: number; updated?: number };
  return { created: Number(result.created ?? 0), updated: Number(result.updated ?? 0) };
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
