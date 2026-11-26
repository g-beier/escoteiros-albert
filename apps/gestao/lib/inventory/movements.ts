import { formatCents } from "@/lib/format";
import type { Movement } from "./model";
import { CONDITION_LABELS, TRACKING_LABELS, WRITE_OFF_LABELS, type Condition, type Tracking } from "./vocabulary";

// Detalhe de um movimento (Movimentações e histórico do material): o que mudou, de → para, como nas condições.

export const EDIT_ACTIONS: Record<string, string> = {
  material_created: "Material cadastrado", material_updated: "Material editado", lot_updated: "Dados do lote editados", unit_updated: "Dados da peça editados",
  lot_sale: "Lojinha",
};

type Detailed = Pick<Movement, "kind" | "from_condition" | "to_condition" | "write_off_reason" | "details">;

const condition = (value: Condition | null) => (value ? CONDITION_LABELS[value] : "Sem condição");
const quantityOf = (value: unknown) => (typeof value === "number" ? value : null);
const text = (value: unknown) => (value == null || value === "" ? "—" : String(value));
const yesNo = (value: unknown) => (value ? "sim" : "não");
const price = (value: unknown) => (typeof value === "number" ? formatCents(value) : "—");

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

/**
 * Lançamento financeiro da venda (019): baixa com motivo venda ou devolução de venda guardam `details.entry_id`.
 * Para o link "ver lançamento" (só para quem lê o Financeiro).
 */
export function saleEntryId(row: Pick<Movement, "kind" | "write_off_reason" | "details">): string | null {
  const sale = (row.kind === "baixa" && row.write_off_reason === "venda") || (row.kind === "entrada" && row.details.sale_return === true);
  return sale && typeof row.details.entry_id === "string" ? row.details.entry_id : null;
}

/** Link da venda (019, 022): o lançamento, ou Devedores quando a venda ficou a pagar (`details.debt_id`). */
export function saleLink(row: Pick<Movement, "kind" | "write_off_reason" | "details">): { href: string; label: string } | null {
  const entryId = saleEntryId(row);
  if (entryId) return { href: `/financeiro/lancamentos/${entryId}`, label: "ver lançamento" };
  const sale = (row.kind === "baixa" && row.write_off_reason === "venda") || (row.kind === "entrada" && row.details.sale_return === true);
  return sale && typeof row.details.debt_id === "string" ? { href: "/financeiro/mensalidades/devedores", label: "ver em Devedores" } : null;
}

/** Lojinha (021): "à venda por R$ 25,00", "preço R$ 20,00 → R$ 25,00" ou "fora da venda". */
export function lotSale(details: Record<string, unknown>): string {
  const before = (details.before ?? {}) as Record<string, unknown>;
  const after = (details.after ?? {}) as Record<string, unknown>;
  if (!after.for_sale) return "fora da venda";
  if (before.for_sale) return `preço ${price(before.sale_price_cents)} → ${price(after.sale_price_cents)}`;
  return after.sale_price_cents == null ? "à venda, sem preço" : `à venda por ${price(after.sale_price_cents)}`;
}

/** O que mudou no movimento, sem a divisão (que tem coluna própria na lista). */
export function movementDetail(row: Detailed): string {
  switch (row.kind) {
    case "entrada": return row.details.sale_return ? "Devolução de venda (lançamento editado ou excluído)" : row.to_condition ? condition(row.to_condition) : "";
    case "transferencia": return "";
    case "condicao": return `${condition(row.from_condition)} → ${condition(row.to_condition)}`;
    case "ajuste": {
      const change = adjustment(row.details);
      return change ? `${change.from} → ${change.to}` : "";
    }
    case "baixa": return row.write_off_reason ? WRITE_OFF_LABELS[row.write_off_reason] : "";
    case "edicao": {
      const action = EDIT_ACTIONS[String(row.details.action)] ?? "Edição";
      if (row.details.action === "lot_sale") return `${action}: ${lotSale(row.details)}`;
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
