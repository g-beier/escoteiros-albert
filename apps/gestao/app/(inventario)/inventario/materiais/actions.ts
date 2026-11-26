"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { materialsBackHref, withBack } from "@/lib/inventory/material-list";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { DataError } from "@/lib/server/db";
import { BULK_ACTIONS, type BulkAction, type BulkTarget, type EntryInput } from "@/lib/inventory/model";
import type { Condition, Origin, Tracking, WriteOffReason } from "@/lib/inventory/vocabulary";
import { parseMoneyToCents } from "@/lib/money";
import * as materials from "@/lib/server/inventory/materials";
import { inventoryEditorOrError, inventoryWriterOrError } from "@/lib/server/session";

// Validação dos formulários aqui; as escritas são as funções inventory_* (lib/server/inventory/materials.ts),
// auditadas, e as do chefe ficam para revisar.

const CONDITIONS: Condition[] = ["novo", "bom", "regular", "ruim", "manutencao", "inservivel"];
const ORIGINS: Origin[] = ["compra", "doacao", "fabricacao", "nao_informada"];
const REASONS: WriteOffReason[] = ["perda", "extravio", "descarte", "doacao", "consumo"];

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;
const id = (data: FormData, key: string) => {
  const value = text(data, key);
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new InputError("Registro inválido. Recarregue a página.");
  return value;
};
const optionalId = (data: FormData, key: string) => (text(data, key) ? id(data, key) : null);
function integer(data: FormData, key: string, label: string): number;
function integer(data: FormData, key: string, label: string, required: false): number | null;
function integer(data: FormData, key: string, label: string, required = true) {
  const value = text(data, key);
  if (!value) {
    if (required) throw new InputError(`Informe ${label}.`);
    return null;
  }
  if (!/^\d+$/.test(value)) throw new InputError(`${label[0].toUpperCase()}${label.slice(1)} deve ser um número inteiro.`);
  return Number(value);
}
function cents(data: FormData, key: string) {
  const value = text(data, key);
  if (!value) return null;
  const parsed = parseMoneyToCents(value, { allowNegative: false });
  if (parsed === null) throw new InputError("Valor inválido. Use o formato 12,50.");
  return parsed;
}
function date(data: FormData, key: string) {
  const value = text(data, key);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError("Data inválida.");
  return value;
}
function oneOf<T extends string>(data: FormData, key: string, values: T[], fallback: T | null = null): T | null {
  const value = text(data, key);
  if (!value) return fallback;
  if (!values.includes(value as T)) throw new InputError("Opção inválida.");
  return value as T;
}
function reason(data: FormData) {
  const value = oneOf(data, "reason", REASONS);
  if (!value) throw new InputError("Escolha o motivo da baixa.");
  return value;
}

const entry = (data: FormData): EntryInput => ({
  unitValueCents: cents(data, "value"), acquiredOn: date(data, "acquiredOn"), origin: oneOf(data, "origin", ORIGINS, "nao_informada"),
  supplier: optional(data, "supplier"), invoice: optional(data, "invoice"), notes: optional(data, "notes"),
});

/** Registra para chefe, gestor ou administrador e atualiza a lista, o material e o resumo. */
function record(data: FormData, work: (db: Parameters<typeof materials.addLot>[0]) => Promise<string>) {
  return runAction(inventoryWriterOrError, async ({ db }) => {
    const message = await work(db);
    const materialId = text(data, "materialId");
    revalidatePath("/inventario/materiais");
    if (materialId) revalidatePath(`/inventario/materiais/${materialId}`);
    revalidatePath("/inventario");
    return message;
  });
}

/** Peças de uma vez no cadastro (entram sem etiqueta). */
const MAX_UNITS_ON_CREATE = 50;

/** Primeira entrada pedida no cadastro, já validada (antes de gravar o material). */
function firstEntry(formData: FormData, tracking: Tracking) {
  const locationId = optionalId(formData, "locationId");
  if (!locationId) throw new InputError("Escolha a divisão da primeira entrada.");
  const quantity = integer(formData, "quantity", "a quantidade");
  if (quantity < 1) throw new InputError("A quantidade deve ser pelo menos 1.");
  if (tracking === "unit" && quantity > MAX_UNITS_ON_CREATE) throw new InputError(`No cadastro, registre até ${MAX_UNITS_ON_CREATE} peças; as demais, no detalhe do material.`);
  return { locationId, quantity, condition: oneOf(formData, "condition", CONDITIONS), expiresOn: date(formData, "expiresOn"), ...entry(formData) };
}

/**
 * Cadastro e edição do material; ao salvar, volta para o detalhe (onde se lançam lotes ou peças).
 * No cadastro, com "Registrar a primeira entrada", grava também um lote (por quantidade) ou as peças (por peça).
 */
export async function saveMaterial(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  let savedId = "";
  const result = await runAction(inventoryWriterOrError, async ({ db, groupId }) => {
    const tracking = oneOf<Tracking>(formData, "tracking", ["unit", "lot"]);
    if (!tracking) throw new InputError("Escolha se o material é controlado por peça ou por quantidade.");
    const id = optionalId(formData, "id");
    const stock = !id && formData.get("withStock") === "on" ? firstEntry(formData, tracking) : null;
    savedId = await materials.save(db, groupId, {
      id, familyId: optionalId(formData, "familyId"), name: text(formData, "name"), tracking,
      consumable: tracking === "lot" && formData.get("consumable") === "on",
      minimumQuantity: integer(formData, "minimum", "o estoque mínimo", false), description: optional(formData, "description"),
      active: formData.get("active") !== "off",
    });
    // Lojinha: só o Editor vê estes campos (a função SQL confere de novo).
    if (formData.get("saleFields") === "on") {
      const forSale = tracking === "lot" && formData.get("forSale") === "on";
      await materials.setSale(db, savedId, forSale, forSale ? cents(formData, "salePrice") : null);
    }
    revalidatePath("/inventario/materiais");
    revalidatePath(`/inventario/materiais/${savedId}`);
    revalidatePath("/inventario");
    if (!stock) return;
    // O material já existe: uma falha aqui não o desfaz, só avisa (a entrada pode ser feita no detalhe).
    try {
      if (tracking === "lot") {
        await materials.addLot(db, { materialId: savedId, ...stock });
      } else {
        for (let i = 0; i < stock.quantity; i++) {
          await materials.addUnit(db, { materialId: savedId, ...stock, tag: null, legacyCode: null, description: null });
        }
      }
    } catch (error) {
      if (!(error instanceof DataError)) throw error;
      savedId = "";
      throw new DataError(`Material cadastrado, mas a primeira entrada falhou: ${error.message} Registre-a no detalhe do material.`);
    }
  });
  if (result.error || !savedId) return result;
  redirect(withBack(`/inventario/materiais/${savedId}`, materialsBackHref(formData.get("voltar")?.toString())));
}

export async function addLot(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    const { merged } = await materials.addLot(db, {
      materialId: id(formData, "materialId"), locationId: optionalId(formData, "locationId"), quantity: integer(formData, "quantity", "a quantidade"),
      condition: oneOf(formData, "condition", CONDITIONS), expiresOn: date(formData, "expiresOn"), variant: optional(formData, "variant"), ...entry(formData),
    });
    return merged ? "Somado ao lote igual que já existia." : "Lote adicionado.";
  });
}

export async function addUnit(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.addUnit(db, {
      materialId: id(formData, "materialId"), locationId: optionalId(formData, "locationId"), tag: optional(formData, "tag"),
      legacyCode: optional(formData, "legacyCode"), description: optional(formData, "description"), condition: oneOf(formData, "condition", CONDITIONS),
      ...entry(formData),
    });
    return "Peça adicionada.";
  });
}

export async function transferLot(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.transferLot(db, id(formData, "lotId"), optionalId(formData, "locationId"), integer(formData, "quantity", "a quantidade"), optional(formData, "notes"));
    return "Lote transferido.";
  });
}

export async function transferUnit(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.transferUnit(db, id(formData, "unitId"), optionalId(formData, "locationId"), optional(formData, "notes"));
    return "Peça transferida.";
  });
}

export async function setLotCondition(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.setLotCondition(db, id(formData, "lotId"), oneOf(formData, "condition", CONDITIONS), integer(formData, "quantity", "a quantidade"), optional(formData, "notes"));
    return "Condição registrada.";
  });
}

export async function setUnitCondition(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.setUnitCondition(db, id(formData, "unitId"), oneOf(formData, "condition", CONDITIONS), optional(formData, "notes"));
    return "Condição registrada.";
  });
}

export async function adjustLot(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.adjustLot(db, id(formData, "lotId"), integer(formData, "quantity", "a quantidade contada"), optional(formData, "notes"));
    return "Contagem ajustada.";
  });
}

/**
 * Edição em massa da lista de Materiais. `targets`: JSON com as linhas `"material|divisão"` (divisão vazia = sem
 * estoque). Ações de estoque (transferir, condição, baixa) mexem em tudo o que o material tem naquela divisão;
 * família e consumível valem para o material inteiro.
 */
export async function bulkEdit(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(inventoryWriterOrError, async ({ db, groupId }) => {
    const action = oneOf<BulkAction>(formData, "action", [...BULK_ACTIONS]);
    if (!action) throw new InputError("Escolha a ação.");
    let keys: unknown;
    try { keys = JSON.parse(text(formData, "targets") || "[]"); } catch { keys = null; }
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!Array.isArray(keys) || !keys.length) throw new InputError("Selecione pelo menos um material.");
    const targets: BulkTarget[] = keys.map((key) => {
      const [materialId = "", locationId = ""] = String(key).split("|");
      if (!uuid.test(materialId) || (locationId && !uuid.test(locationId))) throw new InputError("Seleção inválida. Recarregue a página.");
      return { materialId, locationId: locationId || null };
    });
    const stock = action === "transferir" || action === "condicao" || action === "baixa";
    if (stock && !targets.some((t) => t.locationId)) throw new InputError("As linhas escolhidas não têm estoque.");
    const args: Record<string, string | boolean | null> =
      action === "transferir" ? { to_location_id: id(formData, "locationId") }
      : action === "condicao" ? { condition: oneOf(formData, "condition", CONDITIONS) ?? (() => { throw new InputError("Escolha a condição."); })() }
      : action === "baixa" ? { reason: reason(formData) }
      : action === "familia" ? { family_id: optionalId(formData, "familyId") }
      : { value: (() => { const v = text(formData, "consumable"); if (v !== "sim" && v !== "nao") throw new InputError("Escolha consumível ou não."); return v === "sim"; })() };
    const changed = await materials.bulk(db, groupId, action, targets, args, optional(formData, "notes"));
    revalidatePath("/inventario/materiais");
    revalidatePath("/inventario");
    const what = stock ? (changed === 1 ? "lote ou peça" : "lotes ou peças") : changed === 1 ? "material" : "materiais";
    return changed ? `${BULK_DONE[action]}: ${changed} ${what}.` : "Nada mudou: as linhas escolhidas já estavam assim.";
  });
}

const BULK_DONE: Record<BulkAction, string> = {
  transferir: "Transferido", condicao: "Condição registrada", baixa: "Baixa registrada", familia: "Família alterada", consumivel: "Cadastro alterado",
};

/**
 * Lotes de um material numa divisão, para o diálogo ± da lista (a lista não leva os lotes de cada linha no HTML).
 * Leitura: devolve os lotes ou a mensagem de erro.
 */
export async function loadRowLots(materialId: unknown, locationId: unknown): Promise<{ lots: Awaited<ReturnType<typeof materials.openLotsAt>> } | { error: string }> {
  const member = await inventoryWriterOrError();
  if ("error" in member) return member;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (typeof materialId !== "string" || typeof locationId !== "string" || !uuid.test(materialId) || !uuid.test(locationId)) return { error: "Registro inválido. Recarregue a página." };
  try {
    return { lots: await materials.openLotsAt(member.db, materialId, locationId) };
  } catch (error) {
    return { error: error instanceof DataError ? error.message : "Não foi possível carregar os lotes." };
  }
}

export async function writeOffLot(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.writeOffLot(db, id(formData, "lotId"), integer(formData, "quantity", "a quantidade"), reason(formData), optional(formData, "notes"));
    return "Baixa registrada.";
  });
}

export async function writeOffUnit(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.writeOffUnit(db, id(formData, "unitId"), reason(formData), optional(formData, "notes"));
    return "Baixa registrada.";
  });
}

export async function updateLot(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.updateLot(db, { lotId: id(formData, "lotId"), expiresOn: date(formData, "expiresOn"), variant: optional(formData, "variant"), ...entry(formData) });
    return "Dados do lote salvos.";
  });
}

export async function updateUnit(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.updateUnit(db, {
      unitId: id(formData, "unitId"), tag: optional(formData, "tag"), legacyCode: optional(formData, "legacyCode"),
      description: optional(formData, "description"), ...entry(formData),
    });
    return "Dados da peça salvos.";
  });
}

/** Ordem dos materiais de uma divisão (tela Ordenar): a lista inteira, na ordem da tela. Só Editor. */
export async function orderMaterials(locationId: string, materialIds: string[]): Promise<ActionResult> {
  return runAction(() => inventoryEditorOrError("Apenas editores do Inventário ordenam os materiais."), async ({ db }) => {
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!uuid.test(locationId) || !materialIds.every((value) => uuid.test(value))) throw new InputError("Registro inválido. Recarregue a página.");
    await materials.orderMaterials(db, locationId, materialIds);
    revalidatePath("/inventario/materiais");
    return "Ordem salva.";
  });
}
