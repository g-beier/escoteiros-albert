import type { Movement, MovementFilters, MovementListRow } from "@/lib/inventory/model";
import type { Db } from "@/lib/server/db";
import { rowsOf, sb } from "@/lib/server/supabase/db";

// Histórico do inventário (inventory_movements): toda mudança, com o status de revisão.

const LIST_COLUMNS = "id, kind, quantity, from_location_id, to_location_id, from_condition, to_condition, write_off_reason, notes, review_status, created_at, material_id, inventory_materials(name)";

type ListRow = Omit<MovementListRow, "material_name"> & { inventory_materials: { name: string } | null };
const flatten = (rows: ListRow[]): MovementListRow[] =>
  rows.map(({ inventory_materials: material, ...row }) => ({ ...row, material_name: material?.name ?? "" }));

/** Movimentações do grupo, mais novas primeiro, com os filtros de revisão e tipo. */
export async function list(db: Db, groupId: string, filters: MovementFilters, limit: number): Promise<MovementListRow[]> {
  let query = sb(db).from("inventory_movements").select(LIST_COLUMNS).eq("group_id", groupId);
  if (filters.review) query = query.eq("review_status", filters.review);
  if (filters.kind) query = query.eq("kind", filters.kind);
  return flatten(rowsOf(await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit)) as unknown as ListRow[]);
}

/** Página do histórico: total filtrado + fatia ordenada (mais novas primeiro). */
export async function listPage(
  db: Db, groupId: string, filters: MovementFilters, page: number, pageSize: number,
): Promise<{ rows: MovementListRow[]; total: number }> {
  let countQ = sb(db).from("inventory_movements").select("id", { count: "exact", head: true }).eq("group_id", groupId);
  let listQ = sb(db).from("inventory_movements").select(LIST_COLUMNS).eq("group_id", groupId);
  if (filters.review) {
    countQ = countQ.eq("review_status", filters.review);
    listQ = listQ.eq("review_status", filters.review);
  }
  if (filters.kind) {
    countQ = countQ.eq("kind", filters.kind);
    listQ = listQ.eq("kind", filters.kind);
  }
  const from = Math.max(0, (page - 1) * pageSize);
  const [{ count }, listed] = await Promise.all([
    countQ,
    listQ.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + pageSize - 1),
  ]);
  return { rows: flatten(rowsOf(listed) as unknown as ListRow[]), total: count ?? 0 };
}

/** Histórico de um material. */
export async function forMaterial(db: Db, materialId: string, limit: number): Promise<Movement[]> {
  return rowsOf(await sb(db).from("inventory_movements")
    .select("id, kind, quantity, from_location_id, to_location_id, from_condition, to_condition, write_off_reason, notes, details, review_status, created_by, created_at, lot_id, unit_id")
    .eq("material_id", materialId).order("created_at", { ascending: false }).limit(limit)) as Movement[];
}

/** Quantos movimentos de chefes esperam a revisão do gestor. */
export async function pendingCount(db: Db, groupId: string): Promise<number> {
  const { count } = await sb(db).from("inventory_movements").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("review_status", "pendente");
  return count ?? 0;
}
