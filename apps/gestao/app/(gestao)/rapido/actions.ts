"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { z } from "zod";
import { InputError, runAction } from "@/lib/action";
import { isScoutBranch } from "@/lib/associates/model";
import { QUICK_DONE, type QuickKind } from "@/lib/inventory/quick";
import { quickDoneHref } from "@/lib/quick";
import {
  CONDITION_LABELS,
  MANUAL_WRITE_OFF_LABELS,
  type Condition,
  type Tracking,
  type WriteOffReason,
} from "@/lib/inventory/vocabulary";
import * as associates from "@/lib/server/associates/associates";
import * as entries from "@/lib/server/finance/entries";
import * as quick from "@/lib/server/inventory/quick";
import { associatesWriterOrError, financeWriterOrError, inventoryWriterOrError } from "@/lib/server/session";

// Registro rápido comum (/rapido, celular): validação aqui; gravação por inventory_quick (045),
// create_quick_ledger_entry e associates_create_quick (049). Tudo fica para revisar, mesmo do gestor ou do
// administrador. Depois de gravar, volta para o registro rápido com a confirmação.

const UUID = /^[0-9a-f-]{36}$/i;
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;
function id(data: FormData, key: string, message: string) {
  const value = text(data, key);
  if (!UUID.test(value)) throw new InputError(message);
  return value;
}
function quantity(data: FormData, key = "quantity", min = 1) {
  const value = text(data, key);
  if (!/^\d+$/.test(value) || Number(value) < min)
    throw new InputError(min === 0 ? "Informe a quantidade contada." : "Informe uma quantidade de pelo menos 1.");
  return Number(value);
}
function oneOf<T extends string>(data: FormData, key: string, labels: Record<T, string>, message: string): T {
  const value = text(data, key);
  if (!(value in labels)) throw new InputError(message);
  return value as T;
}
const optionalCondition = (data: FormData) =>
  text(data, "condition") ? oneOf<Condition>(data, "condition", CONDITION_LABELS, "Condição inválida.") : null;
function date(data: FormData, key: string) {
  const value = text(data, key);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError("Data inválida.");
  return value;
}

/** Item escolhido: `lot:<id>` ou `unit:<id>`. */
function item(data: FormData) {
  const [kind, value] = text(data, "item").split(":");
  if ((kind !== "lot" && kind !== "unit") || !UUID.test(value ?? "")) throw new InputError("Escolha o lote ou a peça.");
  return { kind, id: value } as const;
}

function build(kind: QuickKind, data: FormData, groupId: string): quick.QuickAction {
  const notes = optional(data, "notes");
  switch (kind) {
    case "retirar": {
      const target = item(data);
      const reason = oneOf<Exclude<WriteOffReason, "venda">>(
        data,
        "reason",
        MANUAL_WRITE_OFF_LABELS,
        "Escolha o motivo da retirada.",
      );
      return target.kind === "lot"
        ? { action: "write_off_lot", lot_id: target.id, quantity: quantity(data), reason, notes }
        : { action: "write_off_unit", unit_id: target.id, reason, notes };
    }
    case "entrada": {
      const materialId = id(data, "materialId", "Material inválido. Recarregue a página.");
      const locationId = id(data, "locationId", "Escolha a divisão.");
      return text(data, "tracking") === "unit"
        ? {
            action: "add_unit",
            material_id: materialId,
            location_id: locationId,
            tag: optional(data, "tag"),
            condition: optionalCondition(data),
            notes,
          }
        : {
            action: "add_lot",
            material_id: materialId,
            location_id: locationId,
            quantity: quantity(data),
            condition: optionalCondition(data),
            expires_on: date(data, "expiresOn"),
            variant: optional(data, "variant"),
            notes,
          };
    }
    case "condicao": {
      const target = item(data);
      const condition = oneOf<Condition>(data, "condition", CONDITION_LABELS, "Escolha a nova condição.");
      return target.kind === "lot"
        ? { action: "set_lot_condition", lot_id: target.id, condition, quantity: quantity(data), notes }
        : { action: "set_unit_condition", unit_id: target.id, condition, notes };
    }
    case "transferir": {
      const target = item(data);
      const to = id(data, "locationId", "Escolha a divisão de destino.");
      return target.kind === "lot"
        ? { action: "transfer_lot", lot_id: target.id, to_location_id: to, quantity: quantity(data), notes }
        : { action: "transfer_unit", unit_id: target.id, to_location_id: to, notes };
    }
    case "ajustar": {
      const target = item(data);
      if (target.kind !== "lot") throw new InputError("Peças não têm contagem: use retirar ou mudar condição.");
      if (!notes) throw new InputError("Explique o ajuste na observação.");
      return { action: "adjust_lot", lot_id: target.id, quantity: quantity(data, "quantity", 0), notes };
    }
    case "novo": {
      const tracking = text(data, "tracking") === "unit" ? "unit" : ("lot" satisfies Tracking);
      const familyId = optional(data, "familyId");
      if (familyId && !UUID.test(familyId)) throw new InputError("Família inválida.");
      const count = tracking === "unit" ? 1 : quantity(data);
      return {
        action: "new_material",
        group_id: groupId,
        name: text(data, "name"),
        tracking,
        consumable: tracking === "lot" && data.get("consumable") === "on",
        family_id: familyId,
        location_id: id(data, "locationId", "Escolha a divisão."),
        quantity: count,
        condition: optionalCondition(data),
        expires_on: tracking === "lot" ? date(data, "expiresOn") : null,
        tag: tracking === "unit" ? optional(data, "tag") : null,
        notes,
      };
    }
  }
}

/** Inventário: grava a ação (`kind` no campo oculto) e volta para o registro rápido com a confirmação. */
export async function quickRecord(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const kind = text(formData, "kind") as QuickKind;
  if (!(kind in QUICK_DONE)) return { error: "Ação inválida. Recarregue a página." };
  let materialId = text(formData, "materialId");
  const result = await runAction(
    () => inventoryWriterOrError(),
    async ({ db, groupId }) => {
      const created = await quick.record(db, build(kind, formData, groupId));
      if (kind === "novo" && created) materialId = created;
      revalidatePath("/inventario", "layout");
      revalidatePath("/");
    },
  );
  if (result.error) return result;
  redirect(quickDoneHref(kind, materialId));
}

const quickEntrySchema = z.object({
  date: z.iso.date("Informe a data."),
  name: z
    .string()
    .trim()
    .min(2, "Informe o histórico (quem pagou ou recebeu).")
    .max(200, "Histórico: no máximo 200 caracteres."),
  paymentMethodId: z.uuid("Escolha a forma de pagamento."),
  totalCents: z
    .number()
    .int()
    .refine((value) => value !== 0, "Informe o valor."),
  description: z.string().trim().max(200, "Descrição: no máximo 200 caracteres.").nullable(),
  notes: z.string().trim().max(2000, "Observações: no máximo 2.000 caracteres.").nullable(),
});

/**
 * Financeiro: lançamento só como receita ou despesa (rubrica raiz pelo sinal do valor; quem revisa classifica); a conta é
 * a padrão da forma de pagamento (ou "A definir"). Devolve o id para o navegador anexar o comprovante antes de voltar.
 */
export async function quickEntry(payload: unknown): Promise<{ error?: string; id?: string }> {
  const parsed = quickEntrySchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  let id = "";
  const result = await runAction(
    () => financeWriterOrError("Sem permissão para registrar lançamentos."),
    async ({ db, groupId }) => {
      const input = parsed.data;
      const kind = input.totalCents > 0 ? "receita" : "despesa";
      const categoryId = await entries.rootCategory(db, groupId, kind);
      if (!categoryId)
        throw new InputError(
          `A rubrica ${kind === "receita" ? "1 Receitas" : "2 Despesas"} não está ativa: fale com o administrador do Financeiro.`,
        );
      id = await entries.createQuick(db, groupId, {
        ...input,
        categoryId,
        description: input.description || null,
        notes: input.notes || null,
      });
      revalidatePath("/", "layout");
    },
  );
  return result.error ? { error: result.error } : { id };
}

/** Associados: o cadastro do formulário normal, para a Diretoria revisar. */
export async function quickAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  let savedId = "";
  const result = await runAction(associatesWriterOrError, async ({ db, groupId }) => {
    const name = text(formData, "name");
    if (name.length < 2 || name.length > 120) throw new InputError("Informe o nome (2 a 120 caracteres).");
    const branch = text(formData, "branch");
    if (!isScoutBranch(branch)) throw new InputError("Escolha o ramo, a seção ou a equipe.");
    const optionalId = (key: string) => {
      const value = optional(formData, key);
      if (value && !UUID.test(value)) throw new InputError("Registro inválido. Recarregue a página.");
      return value;
    };
    const notes = optional(formData, "notes");
    if (notes && notes.length > 500) throw new InputError("Use no máximo 500 caracteres.");
    savedId = await associates.createQuick(db, groupId, {
      name,
      branch,
      sectionId: optionalId("sectionId"),
      patrolId: optionalId("patrolId"),
      notes,
      birthDate: date(formData, "birthDate"),
      promiseDate: date(formData, "promiseDate"),
      joinedOn: date(formData, "joinedOn"),
    });
    revalidatePath("/associados", "layout");
    revalidatePath("/");
  });
  if (result.error || !savedId) return result;
  redirect(quickDoneHref("associado", savedId));
}
