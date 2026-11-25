import { countSheet, type CountSheet, type UnitTag } from "@/lib/inventory/report";
import type { Db } from "@/lib/server/db";
import { rows } from "@/lib/server/pg/db";
import * as locations from "./locations";
import * as materials from "./materials";

/** Dados do PDF de conferência: divisões, estoque, ordem escolhida e etiquetas das peças (sem as baixadas). */
export async function countSheetData(db: Db, groupId: string, scopeId?: string): Promise<CountSheet> {
  const [paths, stock, materialList, positions, units] = await Promise.all([
    locations.listPaths(db, groupId),
    materials.stockByLocation(db, groupId),
    materials.list(db, groupId, { includeInactive: false }),
    materials.positions(db, groupId),
    rows<UnitTag>(db, (sql) => sql`
      select material_id, location_id, tag from public.inventory_units where group_id = ${groupId} and written_off_at is null`),
  ]);
  return countSheet({ paths, stock, materials: materialList, positions, units, scopeId });
}
