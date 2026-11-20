import type { AssociateMove, AssociateMovement, AssociateProfile, ScoutBranch } from "@/lib/associates/model";
import type { ExistingAssociate } from "@/lib/associates/import";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb, unwrap } from "@/lib/server/supabase/db";

// Cadastro de associados (040): leituras de `associate_profile_rows`, `associate_moves` e `associate_movements`;
// escritas só pelas funções auditadas associates_* (conferem `can_manage_associates`).

const PROFILE_COLUMNS = "id, name, branch, active, section_id, section, patrol_id, patrol, birth_date, promise_date, joined_on, notes, left_on, review_status";

/** Associados do grupo (ativos e desligados), por nome. */
export async function list(db: Db, groupId: string): Promise<AssociateProfile[]> {
  return rowsOf(await sb(db).from("associate_profile_rows").select(PROFILE_COLUMNS).eq("group_id", groupId).order("name").limit(10000));
}

export async function get(db: Db, groupId: string, id: string): Promise<AssociateProfile | null> {
  return unwrap(await sb(db).from("associate_profile_rows").select(PROFILE_COLUMNS).eq("group_id", groupId).eq("id", id).maybeSingle());
}

/** Passagens e entradas/saídas do associado, da mais recente para a mais antiga. */
export async function history(db: Db, id: string): Promise<{ moves: AssociateMove[]; movements: AssociateMovement[] }> {
  const [moves, movements] = await Promise.all([
    sb(db).from("associate_moves").select("id, move_date, from_branch, to_branch, from_section_id, to_section_id, to_patrol_id, created_at")
      .eq("associate_id", id).order("move_date", { ascending: false }).order("created_at", { ascending: false }).then(rowsOf),
    sb(db).from("associate_movements").select("id, kind, movement_date, reason, created_at")
      .eq("associate_id", id).order("movement_date", { ascending: false }).order("created_at", { ascending: false }).then(rowsOf),
  ]);
  return { moves, movements };
}

/** Cadastrados, para a conferência da importação por CSV (nome, ramo, seção, equipe, situação). */
export async function existingForImport(db: Db, groupId: string): Promise<ExistingAssociate[]> {
  return rowsOf(await sb(db).from("associate_profile_rows").select("id, name, branch, section, patrol, active").eq("group_id", groupId).order("name").limit(10000));
}

export type Dates = { birthDate: string | null; promiseDate: string | null; joinedOn: string | null };
export type CreateInput = Dates & { name: string; branch: ScoutBranch; sectionId: string | null; patrolId: string | null; notes: string | null };
export type UpdateInput = Dates & { id: string; name: string; notes: string | null };
export type MoveInput = { id: string; date: string; branch: ScoutBranch; sectionId: string | null; patrolId: string | null };

/** Cadastra (com a entrada na data de entrada, ou hoje) e devolve o id. */
export async function create(db: Db, groupId: string, input: CreateInput): Promise<string> {
  return rpc(db, "associates_create", {
    p_group_id: groupId, p_name: input.name, p_branch: input.branch, p_section_id: input.sectionId, p_patrol_id: input.patrolId,
    p_birth_date: input.birthDate, p_promise_date: input.promiseDate, p_joined_on: input.joinedOn, p_notes: input.notes,
  });
}

/** Cadastro pelo registro rápido (049): o mesmo de `create`, para a Secretaria revisar. */
export async function createQuick(db: Db, groupId: string, input: CreateInput): Promise<string> {
  return rpc(db, "associates_create_quick", {
    p_group_id: groupId, p_name: input.name, p_branch: input.branch, p_section_id: input.sectionId, p_patrol_id: input.patrolId,
    p_birth_date: input.birthDate, p_promise_date: input.promiseDate, p_joined_on: input.joinedOn, p_notes: input.notes,
  });
}

/** Marca cadastros do registro rápido como revisados; devolve quantos estavam para revisar. */
export async function review(db: Db, groupId: string, ids: string[]): Promise<number> {
  return rpc(db, "associates_review", { p_group_id: groupId, p_associate_ids: ids });
}

/** Cadastros do registro rápido ainda não revisados. */
export async function countToReview(db: Db, groupId: string): Promise<number> {
  const { count } = await sb(db).from("associates").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("review_status", "para_revisar");
  return count ?? 0;
}

/** Nome, datas e observações; ramo, seção e equipe mudam só por passagem. */
export async function update(db: Db, input: UpdateInput): Promise<void> {
  await rpc(db, "associates_update", {
    p_associate_id: input.id, p_name: input.name, p_birth_date: input.birthDate, p_promise_date: input.promiseDate, p_joined_on: input.joinedOn, p_notes: input.notes,
  });
}

/** Passagem: muda ramo, seção ou equipe numa data. */
export async function move(db: Db, input: MoveInput): Promise<void> {
  await rpc(db, "associates_move", { p_associate_id: input.id, p_date: input.date, p_branch: input.branch, p_section_id: input.sectionId, p_patrol_id: input.patrolId });
}

export async function leave(db: Db, id: string, date: string, reason: string | null): Promise<void> {
  await rpc(db, "associates_leave", { p_associate_id: id, p_date: date, p_reason: reason });
}

export async function rejoin(db: Db, id: string, date: string, reason: string | null): Promise<void> {
  await rpc(db, "associates_rejoin", { p_associate_id: id, p_date: date, p_reason: reason });
}

export type ImportRow = { id?: string; name: string; branch: ScoutBranch; section?: string | null; patrol?: string | null; active: boolean };

/** Importação em massa (tudo ou nada): cadastra os novos e atualiza os com `id`. */
export async function importRows(db: Db, groupId: string, rows: ImportRow[]): Promise<{ created: number; updated: number }> {
  const data = await rpc(db, "import_associates", { p_group_id: groupId, p_rows: rows });
  const result = (data ?? {}) as { created?: number; updated?: number };
  return { created: Number(result.created ?? 0), updated: Number(result.updated ?? 0) };
}
