import type { Condition, Tracking, WriteOffReason } from "@/lib/inventory/vocabulary";
import type { Db } from "@/lib/server/db";
import { rpc } from "@/lib/server/pg/db";
import type { Json } from "@/lib/server/pg/schema";

// Registro rápido (telas de celular, /rapido › Inventário): tudo passa por inventory_quick (045), que marca o movimento
// como 'rapido' e o deixa para revisar, mesmo do gestor. Os nomes dos argumentos (jsonb) ficam só aqui.

export type QuickAction =
  | { action: "write_off_lot"; lot_id: string; quantity: number; reason: WriteOffReason; notes: string | null }
  | { action: "write_off_unit"; unit_id: string; reason: WriteOffReason; notes: string | null }
  | { action: "add_lot"; material_id: string; location_id: string; quantity: number; condition: Condition | null; expires_on: string | null; variant: string | null; notes: string | null }
  | { action: "add_unit"; material_id: string; location_id: string; tag: string | null; condition: Condition | null; notes: string | null }
  | {
    action: "new_material"; group_id: string; name: string; tracking: Tracking; consumable: boolean; family_id: string | null;
    location_id: string; quantity: number; condition: Condition | null; expires_on: string | null; tag: string | null; notes: string | null;
  }
  | { action: "set_lot_condition"; lot_id: string; condition: Condition; quantity: number; notes: string | null }
  | { action: "set_unit_condition"; unit_id: string; condition: Condition; notes: string | null }
  | { action: "transfer_lot"; lot_id: string; to_location_id: string; quantity: number; notes: string | null }
  | { action: "transfer_unit"; unit_id: string; to_location_id: string; notes: string | null }
  | { action: "adjust_lot"; lot_id: string; quantity: number; notes: string };

/** Monta os argumentos de inventory_quick (sem os nulos). */
export function quickArgs({ action, ...args }: QuickAction): { p_action: string; p_args: Json } {
  return { p_action: action, p_args: Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null && value !== undefined)) as Json };
}

/** Grava pelo registro rápido; devolve o id criado (material, lote) quando houver. */
export async function record(db: Db, input: QuickAction): Promise<string | null> {
  const result = await rpc(db, "inventory_quick", quickArgs(input)) as { id?: string | null } | null;
  return result?.id ?? null;
}
