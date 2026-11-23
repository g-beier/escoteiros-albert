import type {
  EntryInput, ExpiringLot, Lot, Material, MaterialDefaults, MaterialInput, MaterialRow, MaterialSummary, StockRow, Unit,
} from "@/lib/inventory/model";
import { searchTerms } from "@/lib/inventory/search";
import type { Condition, WriteOffReason } from "@/lib/inventory/vocabulary";
import type { Db } from "@/lib/server/db";
import { one, rows, rpc, value } from "@/lib/server/pg/db";

// Materiais, lotes (por quantidade) e peças (por unidade). Escritas pelas funções inventory_* (032): o chefe
// grava na hora e o movimento fica para revisar.

// Leituras ---------------------------------------------------------------------------------------

export type MaterialFilters = { includeInactive: boolean; familyId?: string; search?: string };

/** Materiais com os totais de todas as divisões. */
export async function list(db: Db, groupId: string, filters: MaterialFilters): Promise<MaterialRow[]> {
  // Busca ampliada (043): cada palavra precisa aparecer em algum campo (nome, descrição, família, lotes, peças).
  const patterns = searchTerms(filters.search).map((term) => `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  return rows<MaterialRow>(db, (sql) => sql`
    select id, name, tracking, consumable, minimum_quantity, active, quantity, next_expiry, below_minimum
    from public.inventory_material_rows where group_id = ${groupId}
      ${filters.includeInactive ? sql`` : sql`and active`}
      ${filters.familyId ? sql`and family_id = ${filters.familyId}` : sql``}
      ${patterns.length ? sql`and ${sql`and`.join(patterns.map((pattern) => sql`search_text ilike ${pattern}`))}` : sql``}`);
}

/** Quantidade, valor e validade de cada material em cada divisão. */
export async function stockByLocation(db: Db, groupId: string): Promise<StockRow[]> {
  return rows<StockRow>(db, (sql) => sql`
    select material_id, location_id, quantity, value_cents, next_expiry, worst_condition, conditions, min_unit_cents, max_unit_cents
    from public.inventory_stock_by_location where group_id = ${groupId}`);
}

/** Contagens de alguns anos (conferência / planilha): ano → `material|divisão` → quantidade. */
export async function countsOfYears(db: Db, groupId: string, years: number[]): Promise<Map<number, Map<string, number>>> {
  const list = await rows<{ year: number; material_id: string; location_id: string; quantity: number }>(db, (sql) => sql`
    select year, material_id, location_id, quantity from public.inventory_counts where group_id = ${groupId} and year = any(${years}::int[])`);
  const byYear = new Map(years.map((year) => [year, new Map<string, number>()]));
  for (const row of list) byYear.get(row.year)?.set(`${row.material_id}|${row.location_id}`, row.quantity);
  return byYear;
}

export async function get(db: Db, groupId: string, id: string): Promise<Material | null> {
  return one<Material>(db, (sql) => sql`
    select id, name, tracking, consumable, minimum_quantity, description, active, family_id, family_name, family_code, quantity,
      estimated_value_cents, next_expiry, below_minimum
    from public.inventory_material_rows where id = ${id} and group_id = ${groupId}`);
}

/** Campos editáveis e se já há lotes ou peças (o controle não muda depois disso). */
export async function getForEdit(db: Db, groupId: string, id: string): Promise<{ material: MaterialDefaults; hasStock: boolean } | null> {
  const material = await one<MaterialDefaults & { has_stock: boolean }>(db, (sql) => sql`
    select m.id, m.name, m.family_id, m.tracking, m.consumable, m.minimum_quantity, m.description, m.active,
      exists (select 1 from public.inventory_lots l where l.material_id = m.id)
        or exists (select 1 from public.inventory_units u where u.material_id = m.id) as has_stock
    from public.inventory_materials m where m.id = ${id} and m.group_id = ${groupId}`);
  if (!material) return null;
  const { has_stock: hasStock, ...defaults } = material;
  return { material: defaults as MaterialDefaults, hasStock };
}

/** Lotes com saldo, na ordem de entrada. */
export async function lots(db: Db, materialId: string): Promise<Lot[]> {
  return rows<Lot>(db, (sql) => sql`
    select id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes, variant
    from public.inventory_lots where material_id = ${materialId} and quantity > 0 order by created_at`);
}

/** Lotes com saldo do grupo (botões de saída e entrada da lista de Materiais). */
export async function openLots(db: Db, groupId: string): Promise<(Pick<Lot, "id" | "location_id" | "quantity" | "condition" | "expires_on" | "variant"> & { material_id: string })[]> {
  return rows(db, (sql) => sql`
    select id, material_id, location_id, quantity, condition, expires_on, variant from public.inventory_lots where group_id = ${groupId} and quantity > 0`);
}

/** Lotes com saldo de um material numa divisão (diálogo ± da lista de Materiais, carregado ao abrir). */
export async function openLotsAt(db: Db, materialId: string, locationId: string): Promise<Pick<Lot, "id" | "location_id" | "quantity" | "condition" | "expires_on" | "variant">[]> {
  return rows(db, (sql) => sql`
    select id, location_id, quantity, condition, expires_on, variant from public.inventory_lots
    where material_id = ${materialId} and location_id = ${locationId} and quantity > 0`);
}

/** Peças, inclusive as baixadas, pela etiqueta. */
export async function units(db: Db, materialId: string): Promise<Unit[]> {
  return rows<Unit>(db, (sql) => sql`
    select id, location_id, tag, legacy_code, description, condition, unit_value_cents, acquired_on, origin, supplier, invoice, notes, written_off_at, write_off_reason
    from public.inventory_units where material_id = ${materialId} order by tag nulls last, created_at`);
}

/** Próxima etiqueta livre da família (GEAS-000-0000), se ela tiver código. */
export async function nextTag(db: Db, familyId: string): Promise<string | null> {
  return (await rpc(db, "inventory_next_tag", { p_family_id: familyId })) ?? null;
}

/** Resumo: materiais ativos com quantidade, mínimo e valor. */
export async function summary(db: Db, groupId: string): Promise<MaterialSummary[]> {
  return rows<MaterialSummary>(db, (sql) => sql`
    select id, name, quantity, minimum_quantity, estimated_value_cents, below_minimum
    from public.inventory_material_rows where group_id = ${groupId} and active order by name`);
}

/** Lotes com saldo vencidos ou vencendo até `until` (yyyy-mm-dd), do mais próximo ao mais distante. */
export async function expiringLots(db: Db, groupId: string, until: string, limit = 100): Promise<ExpiringLot[]> {
  return rows<ExpiringLot>(db, (sql) => sql`
    select l.id, l.quantity, l.expires_on, l.location_id, l.material_id, coalesce(m.name, '') as material_name
    from public.inventory_lots l left join public.inventory_materials m on m.id = l.material_id
    where l.group_id = ${groupId} and l.quantity > 0 and l.expires_on is not null and l.expires_on <= ${until}
    order by l.expires_on limit ${limit}`);
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

/**
 * Entrada por quantidade: soma num lote igual (mesma divisão, condição, validade e variação) ou cria um (046).
 * Devolve se somou num lote que já tinha saldo.
 */
export async function addLot(db: Db, input: EntryInput & {
  materialId: string; locationId: string | null; quantity: number; condition: Condition | null; expiresOn: string | null; variant?: string | null;
}): Promise<{ merged: boolean }> {
  const lotId = await rpc(db, "inventory_add_lot", {
    p_material_id: input.materialId, p_location_id: input.locationId, p_quantity: input.quantity, p_condition: input.condition, p_expires_on: input.expiresOn,
    p_variant: input.variant ?? null, ...entry(input),
  });
  const quantity = await value<number>(db, (sql) => sql`select quantity from public.inventory_lots where id = ${lotId}`);
  return { merged: (quantity ?? 0) > input.quantity };
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

export async function updateLot(db: Db, input: EntryInput & { lotId: string; expiresOn: string | null; variant: string | null }) {
  await rpc(db, "inventory_update_lot", { p_lot_id: input.lotId, p_expires_on: input.expiresOn, p_variant: input.variant, ...entry(input) });
}

export async function updateUnit(db: Db, input: EntryInput & { unitId: string; tag: string | null; legacyCode: string | null; description: string | null }) {
  await rpc(db, "inventory_update_unit", {
    p_unit_id: input.unitId, p_tag: input.tag, p_legacy_code: input.legacyCode, p_description: input.description, ...entry(input),
  });
}
