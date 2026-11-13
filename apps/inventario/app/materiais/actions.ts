"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import type { Condition, Origin, Tracking, WriteOffReason } from "@/lib/inventory";
import { parseMoneyToCents } from "@/lib/money";
import { editorOrError } from "@/lib/session";

// Todas as escritas passam pelas funções SQL da migration 032 (auditadas; o chefe fica pendente de revisão).

const CONDITIONS: Condition[] = ["novo", "bom", "regular", "ruim", "manutencao", "inservivel"];
const ORIGINS: Origin[] = ["compra", "doacao", "fabricacao", "nao_informada"];
const REASONS: WriteOffReason[] = ["perda", "extravio", "descarte", "doacao", "consumo"];

class InputError extends Error {}

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;
const id = (data: FormData, key: string) => {
  const value = text(data, key);
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new InputError("Registro inválido. Recarregue a página.");
  return value;
};
const optionalId = (data: FormData, key: string) => (text(data, key) ? id(data, key) : null);
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
  const parsed = parseMoneyToCents(value);
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

/** Executa a ação para chefe/gestor/administrador; erros de validação e do banco viram mensagem. */
async function run(formData: FormData, action: (rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>) => Promise<string | void>): Promise<ActionResult> {
  const member = await editorOrError();
  if ("error" in member) return member;
  try {
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await member.supabase.rpc(fn, args);
      if (error) throw new InputError(error.message);
      return data;
    };
    const success = await action(rpc);
    const materialId = text(formData, "materialId");
    revalidatePath("/materiais");
    if (materialId) revalidatePath(`/materiais/${materialId}`);
    revalidatePath("/");
    return { success: success || "Registrado." };
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    throw error;
  }
}

/** Cadastro e edição do material; ao salvar, volta para o detalhe (onde se lançam lotes ou peças). */
export async function saveMaterial(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const member = await editorOrError();
  if ("error" in member) return member;
  let savedId: string;
  try {
    const tracking = oneOf<Tracking>(formData, "tracking", ["unit", "lot"]);
    if (!tracking) throw new InputError("Escolha se o material é controlado por peça ou por quantidade.");
    const existing = optionalId(formData, "id");
    const { data, error } = await member.supabase.rpc("inventory_save_material", {
      p_group_id: member.groupId,
      p_id: existing,
      p_family_id: optionalId(formData, "familyId"),
      p_name: text(formData, "name"),
      p_tracking: tracking,
      p_consumable: tracking === "lot" && formData.get("consumable") === "on",
      p_minimum_quantity: integer(formData, "minimum", "o estoque mínimo", false),
      p_description: optional(formData, "description"),
      p_active: formData.get("active") !== "off",
    });
    if (error) throw new InputError(error.message);
    savedId = data as string;
    revalidatePath("/materiais");
    revalidatePath(`/materiais/${savedId}`);
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    throw error;
  }
  redirect(`/materiais/${savedId}`);
}

const entryArgs = (formData: FormData) => ({
  p_unit_value_cents: cents(formData, "value"),
  p_acquired_on: date(formData, "acquiredOn"),
  p_origin: oneOf(formData, "origin", ORIGINS, "nao_informada"),
  p_supplier: optional(formData, "supplier"),
  p_invoice: optional(formData, "invoice"),
  p_notes: optional(formData, "notes"),
});

export async function addLot(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_add_lot", {
      p_material_id: id(formData, "materialId"),
      p_location_id: optionalId(formData, "locationId"),
      p_quantity: integer(formData, "quantity", "a quantidade"),
      p_condition: oneOf(formData, "condition", CONDITIONS),
      p_expires_on: date(formData, "expiresOn"),
      ...entryArgs(formData),
    });
    return "Lote adicionado.";
  });
}

export async function addUnit(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_add_unit", {
      p_material_id: id(formData, "materialId"),
      p_location_id: optionalId(formData, "locationId"),
      p_tag: optional(formData, "tag"),
      p_legacy_code: optional(formData, "legacyCode"),
      p_description: optional(formData, "description"),
      p_condition: oneOf(formData, "condition", CONDITIONS),
      ...entryArgs(formData),
    });
    return "Peça adicionada.";
  });
}

export async function transferLot(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_transfer_lot", {
      p_lot_id: id(formData, "lotId"), p_to_location_id: optionalId(formData, "locationId"),
      p_quantity: integer(formData, "quantity", "a quantidade"), p_notes: optional(formData, "notes"),
    });
    return "Lote transferido.";
  });
}

export async function transferUnit(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_transfer_unit", { p_unit_id: id(formData, "unitId"), p_to_location_id: optionalId(formData, "locationId"), p_notes: optional(formData, "notes") });
    return "Peça transferida.";
  });
}

export async function setLotCondition(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_set_lot_condition", {
      p_lot_id: id(formData, "lotId"), p_condition: oneOf(formData, "condition", CONDITIONS),
      p_quantity: integer(formData, "quantity", "a quantidade"), p_notes: optional(formData, "notes"),
    });
    return "Condição registrada.";
  });
}

export async function setUnitCondition(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_set_unit_condition", { p_unit_id: id(formData, "unitId"), p_condition: oneOf(formData, "condition", CONDITIONS), p_notes: optional(formData, "notes") });
    return "Condição registrada.";
  });
}

export async function adjustLot(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_adjust_lot", { p_lot_id: id(formData, "lotId"), p_quantity: integer(formData, "quantity", "a quantidade contada"), p_notes: optional(formData, "notes") });
    return "Contagem ajustada.";
  });
}

export async function writeOffLot(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    const reason = oneOf(formData, "reason", REASONS);
    if (!reason) throw new InputError("Escolha o motivo da baixa.");
    await rpc("inventory_write_off_lot", { p_lot_id: id(formData, "lotId"), p_quantity: integer(formData, "quantity", "a quantidade"), p_reason: reason, p_notes: optional(formData, "notes") });
    return "Baixa registrada.";
  });
}

export async function writeOffUnit(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    const reason = oneOf(formData, "reason", REASONS);
    if (!reason) throw new InputError("Escolha o motivo da baixa.");
    await rpc("inventory_write_off_unit", { p_unit_id: id(formData, "unitId"), p_reason: reason, p_notes: optional(formData, "notes") });
    return "Baixa registrada.";
  });
}

export async function updateLot(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_update_lot", { p_lot_id: id(formData, "lotId"), p_expires_on: date(formData, "expiresOn"), ...entryArgs(formData) });
    return "Dados do lote salvos.";
  });
}

export async function updateUnit(_previous: ActionResult, formData: FormData) {
  return run(formData, async (rpc) => {
    await rpc("inventory_update_unit", {
      p_unit_id: id(formData, "unitId"), p_tag: optional(formData, "tag"), p_legacy_code: optional(formData, "legacyCode"),
      p_description: optional(formData, "description"), ...entryArgs(formData),
    });
    return "Dados da peça salvos.";
  });
}
