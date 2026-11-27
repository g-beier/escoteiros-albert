"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import {
  CONTROL_AUDIENCES,
  isControlStatus,
  isDirectorate,
  isItemKind,
  isValueKind,
  type ItemAudience,
} from "@/lib/associates/controls";
import * as controls from "@/lib/server/associates/controls";
import { associatesEditorOrError } from "@/lib/server/session";
import { id, text } from "../../form-data";

// Itens de controle (041): nunca se apagam, só se desativam. Nome único no grupo: conferido na função SQL.

const editor = () => associatesEditorOrError("Sem permissão para configurar os itens de controle.");

function itemInput(data: FormData): controls.ItemInput {
  const name = text(data, "name");
  if (name.length < 2 || name.length > 80) throw new InputError("Informe o nome do item (2 a 80 caracteres).");
  const kind = text(data, "kind");
  if (!isItemKind(kind)) throw new InputError("Escolha o tipo do item.");
  const valueKind = text(data, "valueKind") || "situacao";
  if (!isValueKind(valueKind)) throw new InputError("Escolha o que a célula mostra.");
  const directorate = text(data, "directorate");
  if (!isDirectorate(directorate)) throw new InputError("Escolha a diretoria.");
  // por público: `applies-<público>` = on e `initial-<público>` = situação inicial (vazio = sem registro)
  const audiences: ItemAudience[] = CONTROL_AUDIENCES.filter((a) => data.get(`applies-${a}`) === "on").map(
    (audience) => {
      const initial = text(data, `initial-${audience}`);
      if (initial && !isControlStatus(initial)) throw new InputError("Valor inicial inválido.");
      return { audience, initial_status: initial && isControlStatus(initial) ? initial : null };
    },
  );
  if (!audiences.length) throw new InputError("Marque a quem o item se aplica.");
  const months = text(data, "validityMonths");
  const validityMonths = months ? Number(months) : null;
  if (validityMonths !== null && (!Number.isInteger(validityMonths) || validityMonths < 1 || validityMonths > 120)) {
    throw new InputError("Validade: de 1 a 120 meses, ou em branco se não vence.");
  }
  return {
    name,
    kind,
    valueKind,
    directorate,
    audiences,
    validityMonths,
    removeOnLeave: data.get("removeOnLeave") === "on",
  };
}

const revalidate = () => revalidatePath("/associados", "layout");

/** Cadastro (sem `id`) e edição (com `id` e `active`). */
export async function saveControlItem(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(editor, async ({ db, groupId }) => {
    const input = itemInput(formData);
    if (text(formData, "id")) {
      await controls.updateItem(db, id(formData, "id"), { ...input, active: text(formData, "active") !== "false" });
      revalidate();
      return `Item “${input.name}” salvo.`;
    }
    await controls.createItem(db, groupId, input);
    revalidate();
    return `Item “${input.name}” criado.`;
  });
}

/** Desativa ou reativa, mantendo o resto do item. */
export async function toggleControlItem(itemId: string, active: boolean): Promise<ActionResult> {
  return runAction(editor, async ({ db, groupId }) => {
    const item = (await controls.items(db, groupId)).find((i) => i.id === itemId);
    if (!item) throw new InputError("Item não encontrado. Recarregue a página.");
    await controls.updateItem(db, item.id, {
      name: item.name,
      kind: item.kind,
      valueKind: item.value_kind,
      directorate: item.directorate,
      audiences: item.audiences,
      validityMonths: item.validity_months,
      removeOnLeave: item.remove_on_leave,
      active,
    });
    revalidate();
    return active ? `Item “${item.name}” reativado.` : { success: `Item “${item.name}” desativado.`, tone: "neutral" };
  });
}

/** Reordenar arrastando: grava a nova posição do item. */
export async function placeControlItem(itemId: string, position: number): Promise<ActionResult> {
  return runAction(editor, async ({ db }) => {
    if (!/^[0-9a-f-]{36}$/i.test(itemId) || !Number.isInteger(position) || position < 0)
      throw new InputError("Posição inválida. Recarregue a página.");
    await controls.placeItem(db, itemId, position);
    revalidate();
  });
}
