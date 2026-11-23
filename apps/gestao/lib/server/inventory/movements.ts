import type { Movement, MovementFilters, MovementListRow } from "@/lib/inventory/model";
import type { Db } from "@/lib/server/db";
import { count, rows, rpc } from "@/lib/server/pg/db";

// Histórico do inventário (inventory_movements): toda mudança, com o status de revisão.

const COLUMNS = "m.id, m.kind, m.quantity, m.from_location_id, m.to_location_id, m.from_condition, m.to_condition, m.write_off_reason, m.notes, m.details, m.review_status, m.review_notes, m.reviewed_by, m.reviewed_at, m.channel, m.created_by, m.created_at, m.lot_id, m.unit_id";

/** Movimentações do grupo, mais novas primeiro, com os filtros de revisão e tipo. */
export async function list(db: Db, groupId: string, filters: MovementFilters, limit: number): Promise<MovementListRow[]> {
  return rows<MovementListRow>(db, (sql) => sql`
    select ${sql.unsafe(COLUMNS)}, m.material_id, coalesce(mat.name, '') as material_name,
      coalesce(lot.location_id, unit.location_id) as item_location_id,
      case when unit.id is null then null else coalesce(unit.tag, unit.legacy_code, 'peça') end as unit_label
    from public.inventory_movements m
    left join public.inventory_materials mat on mat.id = m.material_id
    left join public.inventory_lots lot on lot.id = m.lot_id
    left join public.inventory_units unit on unit.id = m.unit_id
    where m.group_id = ${groupId}
      ${filters.review ? sql`and m.review_status = ${filters.review}` : sql``}
      ${filters.kind ? sql`and m.kind = ${filters.kind}` : sql``}
    order by m.created_at desc, m.id desc limit ${limit}`);
}

/** Histórico de um material. */
export async function forMaterial(db: Db, materialId: string, limit: number): Promise<Movement[]> {
  return rows<Movement>(db, (sql) => sql`
    select ${sql.unsafe(COLUMNS)} from public.inventory_movements m where m.material_id = ${materialId} order by m.created_at desc limit ${limit}`);
}

/** Quantos movimentos (dos chefes e do registro rápido) esperam a revisão do gestor. */
export async function pendingCount(db: Db, groupId: string): Promise<number> {
  return count(db, (sql) => sql`select count(*) from public.inventory_movements where group_id = ${groupId} and review_status = 'para_revisar'`);
}

/** Marca como revisados os movimentos escolhidos (só o gestor); devolve quantos foram marcados. */
export async function review(db: Db, groupId: string, ids: number[], notes: string | null): Promise<number> {
  return rpc(db, "inventory_review_movements", { p_group_id: groupId, p_ids: ids, p_notes: notes });
}
