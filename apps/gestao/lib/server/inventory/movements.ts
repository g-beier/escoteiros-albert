import type { Movement, MovementFilters, MovementListRow } from "@/lib/inventory/model";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb } from "@/lib/server/supabase/db";

// Histórico do inventário (inventory_movements): toda mudança, com o status de revisão.

const LIST_COLUMNS = "id, kind, quantity, from_location_id, to_location_id, from_condition, to_condition, write_off_reason, notes, review_status, review_notes, reviewed_by, reviewed_at, channel, created_by, created_at, details, lot_id, unit_id, material_id, inventory_materials(name), inventory_lots(location_id), inventory_units(location_id, tag, legacy_code)";

type ListRow = Omit<MovementListRow, "material_name" | "item_location_id" | "unit_label"> & {
  inventory_materials: { name: string } | null;
  inventory_lots: { location_id: string } | null;
  inventory_units: { location_id: string; tag: string | null; legacy_code: string | null } | null;
};
const flatten = (rows: ListRow[]): MovementListRow[] =>
  rows.map(({ inventory_materials: material, inventory_lots: lot, inventory_units: unit, ...row }) => ({
    ...row, material_name: material?.name ?? "",
    item_location_id: lot?.location_id ?? unit?.location_id ?? null,
    unit_label: unit ? unit.tag ?? unit.legacy_code ?? "peça" : null,
  }));

/** Movimentações do grupo, mais novas primeiro, com os filtros de revisão e tipo. */
export async function list(db: Db, groupId: string, filters: MovementFilters, limit: number): Promise<MovementListRow[]> {
  let query = sb(db).from("inventory_movements").select(LIST_COLUMNS).eq("group_id", groupId);
  if (filters.review) query = query.eq("review_status", filters.review);
  if (filters.kind) query = query.eq("kind", filters.kind);
  return flatten(rowsOf(await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit)) as unknown as ListRow[]);
}

/** Histórico de um material. */
export async function forMaterial(db: Db, materialId: string, limit: number): Promise<Movement[]> {
  return rowsOf(await sb(db).from("inventory_movements")
    .select("id, kind, quantity, from_location_id, to_location_id, from_condition, to_condition, write_off_reason, notes, details, review_status, review_notes, reviewed_by, reviewed_at, channel, created_by, created_at, lot_id, unit_id")
    .eq("material_id", materialId).order("created_at", { ascending: false }).limit(limit)) as Movement[];
}

/** Quantos movimentos (dos chefes e do registro rápido) esperam a revisão do gestor. */
export async function pendingCount(db: Db, groupId: string): Promise<number> {
  const { count } = await sb(db).from("inventory_movements").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("review_status", "para_revisar");
  return count ?? 0;
}

/** Marca como revisados os movimentos escolhidos (só o gestor); devolve quantos foram marcados. */
export async function review(db: Db, groupId: string, ids: number[], notes: string | null): Promise<number> {
  return rpc(db, "inventory_review_movements", { p_group_id: groupId, p_ids: ids, p_notes: notes });
}
