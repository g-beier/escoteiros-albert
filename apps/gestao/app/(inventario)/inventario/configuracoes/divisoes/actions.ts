"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { runAction } from "@/lib/action";
import type { DropPlace } from "@/lib/inventory/locations";
import * as locations from "@/lib/server/inventory/locations";
import { inventoryEditorOrError } from "@/lib/server/session";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const managerOnly = () => inventoryEditorOrError("Apenas editores do Inventário alteram divisões.");

/** Cria (sem `id`) ou edita uma divisão: nome, descrição e divisão superior (vazio = raiz). */
export async function saveLocation(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(managerOnly, async ({ db, groupId }) => {
    const id = text(formData, "id") || null;
    await locations.save(db, groupId, { id, parentId: text(formData, "parentId") || null, name: text(formData, "name"), description: text(formData, "description") || null });
    revalidatePath("/inventario/configuracoes/divisoes");
    return id ? "Divisão salva." : "Divisão cadastrada.";
  });
}

/** Inativa ou reativa a divisão, mantendo nome, descrição e posição na árvore. */
export async function setLocationActive(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(managerOnly, async ({ db, groupId }) => {
    const active = text(formData, "active") === "true";
    const name = await locations.setActive(db, groupId, text(formData, "id"), active);
    revalidatePath("/inventario/configuracoes/divisoes");
    return active ? { success: `${name} reativada.` } : { success: `${name} inativada.`, tone: "neutral" };
  });
}

/** Solta a divisão antes, depois ou dentro (no fim) de outra, arrastando na lista (ordem dos locais em Materiais e nos seletores). */
export async function placeLocation(id: string, target: string, place: DropPlace): Promise<ActionResult> {
  return runAction(managerOnly, async ({ db }) => {
    await locations.place(db, id, target, place);
    revalidatePath("/inventario/configuracoes/divisoes");
    revalidatePath("/inventario/materiais");
  });
}
