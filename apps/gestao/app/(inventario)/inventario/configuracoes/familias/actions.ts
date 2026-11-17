"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { runAction } from "@/lib/action";
import * as families from "@/lib/server/inventory/families";
import { inventoryManagerOrError } from "@/lib/server/session";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const managerOnly = () => inventoryManagerOrError("Apenas o gestor do inventário altera famílias.");

/** Cria (sem `id`) ou edita uma família: nome e código de etiqueta (3 dígitos, opcional). */
export async function saveFamily(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(managerOnly, async ({ db, groupId }) => {
    const id = text(formData, "id") || null;
    await families.save(db, groupId, { id, name: text(formData, "name"), code: text(formData, "code") || null });
    revalidatePath("/inventario/configuracoes/familias");
    return id ? "Família salva." : "Família cadastrada.";
  });
}

export async function setFamilyActive(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(managerOnly, async ({ db, groupId }) => {
    const active = text(formData, "active") === "true";
    const name = await families.setActive(db, groupId, text(formData, "id"), active);
    revalidatePath("/inventario/configuracoes/familias");
    return active ? { success: `${name} reativada.` } : { success: `${name} inativada.`, tone: "neutral" };
  });
}
