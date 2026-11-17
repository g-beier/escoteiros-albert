import type {
  EntryInput, ExpiringLot, Lot, Material, MaterialDefaults, MaterialInput, MaterialRow, MaterialSummary, StockRow, Unit,
} from "@/lib/inventory/model";
import type { Condition, WriteOffReason } from "@/lib/inventory/vocabulary";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb, unwrap } from "@/lib/server/supabase/db";

// Materiais, lotes (por quantidade) e peças (por unidade). Escritas pelas funções inventory_* (032): o chefe
// grava na hora e o movimento fica pendente de revisão.

// Leituras ---------------------------------------------------------------------------------------

export type MaterialFilters = { includeInactive: boolean; familyId?: string; search?: string };

/** Materiais com os totais de todas as divisões. */
export async function list(db: Db, groupId: string, filters: MaterialFilters): Promise<MaterialRow[]> {
  let query = sb(db).from("inventory_material_rows")
    .select("id, name, consumable, minimum_quantity, active, quantity, next_expiry, below_minimum")
    .eq("group_id", groupId);
  if (!filters.includeInactive) query = query.eq("active", true);
  if (filters.familyId) query = query.eq("family_id", filters.familyId);
  if (filters.search?.trim()) query = query.ilike("name", `%${filters.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  return rowsOf(await query) as MaterialRow[];
}

/** Quantidade, valor e validade de cada material em cada divisão. */
export async function stockByLocation(db: Db, groupId: string): Promise<StockRow[]> {
  return rowsOf(await sb(db).from("inventory_stock_by_location").select("material_id, location_id, quantity, value_cents, next_expiry").eq("group_id", groupId)) as StockRow[];
}

/** Contagem de um ano (conferência / planilha), por `material|divisão`. */
export async function countsOfYear(db: Db, groupId: string, year: number): Promise<Map<string, number>> {
  const rows = rowsOf(await sb(db).from("inventory_counts").select("material_id, location_id, quantity").eq("group_id", groupId).eq("year", year));
  return new Map(rows.map((row) => [`${row.material_id}|${row.location_id}`, row.quantity]));
}

export async function get(db: Db, groupId: string, id: string): Promise<Material | null> {
  return unwrap(await sb(db).from("inventory_material_rows")
    .select("id, name, tracking, consumable, minimum_quantity, description, active, family_id, family_name, family_code, quantity, estimated_value_cents, next_expiry, below_minimum")
    .eq("id", id).eq("group_id", groupId).maybeSingle()) as Material | null;
}

/** Campos editáveis e se já há lotes ou peças (o controle não muda depois disso). */
export async function getForEdit(db: Db, groupId: string, id: string): Promise<{ material: MaterialDefaults; hasStock: boolean } | null> {
  const [material, lots, units] = await Promise.all([
    sb(db).from("inventory_materials").select("id, name, family_id, tracking, consumable, minimum_quantity, description, active").eq("id", id).eq("group_id", groupId).maybeSingle().then(unwrap),
    sb(db).from("inventory_lots").select("id", { count: "exact", head: true }).eq("material_id", id),
    sb(db).from("inventory_units").select("id", { count: "exact", head: true }).eq("material_id", id),
  ]);
  if (!material) return null;
  return { material: material as MaterialDefaults, hasStock: (lots.count ?? 0) + (units.count ?? 0) > 0 };
}

/** Lotes com saldo, na ordem de entrada. */
export async function lots(db: Db, materialId: string): Promise<Lot[]> {
  return rowsOf(await sb(db).from("inventory_lots")
    .select("id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes")
    .eq("material_id", materialId).gt("quantity", 0).order("created_at")) as Lot[];
}

/** Peças, inclusive as baixadas, pela etiqueta. */
export async function units(db: Db, materialId: string): Promise<Unit[]> {
  return rowsOf(await sb(db).from("inventory_units")
    .select("id, location_id, tag, legacy_code, description, condition, unit_value_cents, acquired_on, origin, supplier, invoice, notes, written_off_at, write_off_reason")
    .eq("material_id", materialId).order("tag", { nullsFirst: false }).order("created_at")) as Unit[];
}

/** Próxima etiqueta livre da família (GEAS-000-0000), se ela tiver código. */
export async function nextTag(db: Db, familyId: string): Promise<string | null> {
  return (await rpc(db, "inventory_next_tag", { p_family_id: familyId })) ?? null;
}

/** Resumo: materiais ativos com quantidade, mínimo e valor. */
export async function summary(db: Db, groupId: string): Promise<MaterialSummary[]> {
  return rowsOf(await sb(db).from("inventory_material_rows")
    .select("id, name, quantity, minimum_quantity, estimated_value_cents, below_minimum")
    .eq("group_id", groupId).eq("active", true).order("name")) as MaterialSummary[];
}

/** Lotes com saldo vencidos ou vencendo até `until` (yyyy-mm-dd), do mais próximo ao mais distante. */
export async function expiringLots(db: Db, groupId: string, until: string, limit = 100): Promise<ExpiringLot[]> {
  const rows = rowsOf(await sb(db).from("inventory_lots").select("id, quantity, expires_on, location_id, material_id, inventory_materials(name)")
    .eq("group_id", groupId).gt("quantity", 0).not("expires_on", "is", null).lte("expires_on", until).order("expires_on").limit(limit));
  return rows.map(({ inventory_materials: material, ...row }) => ({ ...row, expires_on: row.expires_on!, material_name: material?.name ?? "" }));
}

// Escritas --------------------------------------------------------------------------------------

const entry = (input: EntryInput) => ({
  p_unit_value_cents: input.unitValueCents, p_acquired_on: input.acquiredOn, p_origin: input.origin ?? "nao_informada",
  p_supplier: input.supplier, p_invoice: input.invoice, p_notes: input.notes,
});

/** Cadastra ou edita o material; devolve o id. */
export async function save(db: Db, groupId: string, input: MaterialInput): Promise<string> {
  return rpc(db, "inventory_save_material", {
    p_group_id: groupId, p_id: input.id, p_family_id: input.familyId, p_name: input.name, p_tracking: input.tracking,
    p_consumable: input.consumable, p_minimum_quantity: input.minimumQuantity, p_description: input.description, p_active: input.active,
  });
}

export async function addLot(db: Db, input: EntryInput & { materialId: string; locationId: string | null; quantity: number; condition: Condition | null; expiresOn: string | null }) {
  await rpc(db, "inventory_add_lot", {
    p_material_id: input.materialId, p_location_id: input.locationId, p_quantity: input.quantity, p_condition: input.condition, p_expires_on: input.expiresOn, ...entry(input),
  });
}

export async function addUnit(db: Db, input: EntryInput & { materialId: string; locationId: string | null; tag: string | null; legacyCode: string | null; description: string | null; condition: Condition | null }) {
  await rpc(db, "inventory_add_unit", {
    p_material_id: input.materialId, p_location_id: input.locationId, p_tag: input.tag, p_legacy_code: input.legacyCode,
    p_description: input.description, p_condition: input.condition, ...entry(input),
  });
}

export async function transferLot(db: Db, lotId: string, toLocationId: string | null, quantity: number, notes: string | null) {
  await rpc(db, "inventory_transfer_lot", { p_lot_id: lotId, p_to_location_id: toLocationId, p_quantity: quantity, p_notes: notes });
}

export async function transferUnit(db: Db, unitId: string, toLocationId: string | null, notes: string | null) {
  await rpc(db, "inventory_transfer_unit", { p_unit_id: unitId, p_to_location_id: toLocationId, p_notes: notes });
}

export async function setLotCondition(db: Db, lotId: string, condition: Condition | null, quantity: number, notes: string | null) {
  await rpc(db, "inventory_set_lot_condition", { p_lot_id: lotId, p_condition: condition, p_quantity: quantity, p_notes: notes });
}

export async function setUnitCondition(db: Db, unitId: string, condition: Condition | null, notes: string | null) {
  await rpc(db, "inventory_set_unit_condition", { p_unit_id: unitId, p_condition: condition, p_notes: notes });
}

/** Contagem que não bate: grava a quantidade contada. */
export async function adjustLot(db: Db, lotId: string, counted: number, notes: string | null) {
  await rpc(db, "inventory_adjust_lot", { p_lot_id: lotId, p_quantity: counted, p_notes: notes });
}

export async function writeOffLot(db: Db, lotId: string, quantity: number, reason: WriteOffReason, notes: string | null) {
  await rpc(db, "inventory_write_off_lot", { p_lot_id: lotId, p_quantity: quantity, p_reason: reason, p_notes: notes });
}

export async function writeOffUnit(db: Db, unitId: string, reason: WriteOffReason, notes: string | null) {
  await rpc(db, "inventory_write_off_unit", { p_unit_id: unitId, p_reason: reason, p_notes: notes });
}

export async function updateLot(db: Db, input: EntryInput & { lotId: string; expiresOn: string | null }) {
  await rpc(db, "inventory_update_lot", { p_lot_id: input.lotId, p_expires_on: input.expiresOn, ...entry(input) });
}

export async function updateUnit(db: Db, input: EntryInput & { unitId: string; tag: string | null; legacyCode: string | null; description: string | null }) {
  await rpc(db, "inventory_update_unit", {
    p_unit_id: input.unitId, p_tag: input.tag, p_legacy_code: input.legacyCode, p_description: input.description, ...entry(input),
  });
}
