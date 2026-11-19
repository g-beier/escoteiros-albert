import type { Movement } from "./model";
import { CONDITION_LABELS, TRACKING_LABELS, WRITE_OFF_LABELS, type Condition, type Tracking } from "./vocabulary";

// Detalhe de um movimento (Movimentações e histórico do material): o que mudou, de → para, como nas condições.

export const EDIT_ACTIONS: Record<string, string> = {
  material_created: "Material cadastrado", material_updated: "Material editado", lot_updated: "Dados do lote editados", unit_updated: "Dados da peça editados",
};

type Detailed = Pick<Movement, "kind" | "from_condition" | "to_condition" | "write_off_reason" | "details">;

const condition = (value: Condition | null) => (value ? CONDITION_LABELS[value] : "Sem condição");
const quantityOf = (value: unknown) => (typeof value === "number" ? value : null);
const text = (value: unknown) => (value == null || value === "" ? "—" : String(value));
const yesNo = (value: unknown) => (value ? "sim" : "não");

/** Ajuste: quantidade antes e depois (gravadas em `details.from` / `details.to`). */
export function adjustment(details: Record<string, unknown>) {
  const from = quantityOf(details.from);
  const to = quantityOf(details.to);
  return from == null || to == null ? null : { from, to, delta: to - from };
}

/** Campos do material que mudaram numa edição (`before` × `after` de inventory_save_material). */
export function materialChanges(details: Record<string, unknown>): string[] {
  const before = (details.before ?? {}) as Record<string, unknown>;
  const after = (details.after ?? {}) as Record<string, unknown>;
  const changes: string[] = [];
  const changed = (key: string) => key in after && (before[key] ?? null) !== (after[key] ?? null);
  if (changed("name")) changes.push(`Nome: ${text(before.name)} → ${text(after.name)}`);
  if (changed("minimum_quantity")) changes.push(`Mínimo: ${text(before.minimum_quantity)} → ${text(after.minimum_quantity)}`);
  if (changed("family_id")) changes.push("Família trocada");
  if (changed("tracking")) changes.push(`Controle: ${TRACKING_LABELS[before.tracking as Tracking] ?? "—"} → ${TRACKING_LABELS[after.tracking as Tracking] ?? "—"}`);
  if (changed("consumable")) changes.push(`Consumível: ${yesNo(before.consumable)} → ${yesNo(after.consumable)}`);
  if (changed("active")) changes.push(after.active ? "Reativado" : "Inativado");
  return changes;
}

/** O que mudou no movimento, sem a divisão (que tem coluna própria na lista). */
export function movementDetail(row: Detailed): string {
  switch (row.kind) {
    case "entrada": return row.to_condition ? condition(row.to_condition) : "";
    case "transferencia": return "";
    case "condicao": return `${condition(row.from_condition)} → ${condition(row.to_condition)}`;
    case "ajuste": {
      const change = adjustment(row.details);
      return change ? `${change.from} → ${change.to}` : "";
    }
    case "baixa": return row.write_off_reason ? WRITE_OFF_LABELS[row.write_off_reason] : "";
    case "edicao": {
      const action = EDIT_ACTIONS[String(row.details.action)] ?? "Edição";
      const changes = row.details.action === "material_updated" ? materialChanges(row.details) : [];
      return changes.length ? `${action}: ${changes.join(" · ")}` : action;
    }
  }
}

/** Quantidade com sinal no ajuste (+5 / −3); nos outros, a quantidade movimentada. */
export function signedQuantity(row: Pick<Movement, "kind" | "quantity" | "details">): string | null {
  const change = row.kind === "ajuste" ? adjustment(row.details) : null;
  if (change) return change.delta > 0 ? `+${change.delta}` : change.delta < 0 ? `−${Math.abs(change.delta)}` : "0";
  return row.quantity == null ? null : String(row.quantity);
}
