"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { DataError } from "@/lib/server/db";
import type { EntryInput } from "@/lib/inventory/model";
import type { Condition, Origin, Tracking, WriteOffReason } from "@/lib/inventory/vocabulary";
import { parseMoneyToCents } from "@/lib/money";
import * as materials from "@/lib/server/inventory/materials";
import { inventoryEditorOrError } from "@/lib/server/session";

// Validação dos formulários aqui; as escritas são as funções inventory_* (lib/server/inventory/materials.ts),
// auditadas, e as do chefe ficam pendentes de revisão.

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
  return runAction(inventoryEditorOrError, async ({ db }) => {
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
  if (!locationId) throw new InputError("Escolha a divisão.");
  const condition = oneOf(formData, "condition", CONDITIONS);
  if (!condition) throw new InputError("Escolha o estado.");
  const quantity = integer(formData, "quantity", "a quantidade", false) ?? 1;
  if (quantity < 1) throw new InputError("A quantidade deve ser pelo menos 1.");
  if (quantity > MAX_UNITS_ON_CREATE) throw new InputError(`No cadastro, a quantidade máxima é ${MAX_UNITS_ON_CREATE}.`);
  return { locationId, quantity, condition, expiresOn: date(formData, "expiresOn"), ...entry(formData) };
}

/**
 * Cadastro e edição do material; ao salvar, volta para o detalhe (onde se lançam lotes ou peças).
 * No cadastro, com "Registrar a primeira entrada", grava também um lote (por quantidade) ou as peças (por peça).
 */
export async function saveMaterial(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  let savedId = "";
  const result = await runAction(inventoryEditorOrError, async ({ db, groupId }) => {
    const tracking = oneOf<Tracking>(formData, "tracking", ["unit", "lot"]);
    if (!tracking) throw new InputError("Escolha se o material é controlado por peça ou por quantidade.");
    const id = optionalId(formData, "id");
    const familyId = optionalId(formData, "familyId");
    if (!familyId) throw new InputError("Escolha a categoria.");
    const stock = !id && formData.get("withStock") === "on" ? firstEntry(formData, tracking) : null;
    savedId = await materials.save(db, groupId, {
      id, familyId, name: text(formData, "name"), tracking,
      consumable: tracking === "lot" && formData.get("consumable") === "on",
      minimumQuantity: integer(formData, "minimum", "o estoque mínimo", false), description: optional(formData, "description"),
      active: formData.get("active") !== "off",
    });
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
  redirect(`/inventario/materiais/${savedId}`);
}

export async function addLot(_previous: ActionResult, formData: FormData) {
  return record(formData, async (db) => {
    await materials.addLot(db, {
      materialId: id(formData, "materialId"), locationId: optionalId(formData, "locationId"), quantity: integer(formData, "quantity", "a quantidade"),
      condition: oneOf(formData, "condition", CONDITIONS), expiresOn: date(formData, "expiresOn"), ...entry(formData),
    });
    return "Lote adicionado.";
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
    await materials.updateLot(db, { lotId: id(formData, "lotId"), expiresOn: date(formData, "expiresOn"), ...entry(formData) });
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
