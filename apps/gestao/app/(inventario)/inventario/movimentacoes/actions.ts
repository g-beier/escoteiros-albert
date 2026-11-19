"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import * as movements from "@/lib/server/inventory/movements";
import { inventoryManagerOrError } from "@/lib/server/session";

/** Até quantos movimentos de uma vez (a lista mostra no máximo 200). */
const MAX_IDS = 200;

/**
 * Revisão pelo gestor: marca como revisados os movimentos escolhidos (`ids`, um ou vários), com nota opcional.
 * Movimento errado não é recusado: o gestor corrige com uma ação normal e revisa o original com uma nota.
 */
export async function reviewMovements(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(() => inventoryManagerOrError("Apenas o gestor do inventário revisa movimentos."), async ({ db, groupId }) => {
    const ids = formData.getAll("ids").map(String).filter((id) => /^\d+$/.test(id)).map(Number);
    if (ids.length === 0) throw new InputError("Escolha os movimentos a revisar.");
    if (ids.length > MAX_IDS) throw new InputError(`Revise até ${MAX_IDS} movimentos de uma vez.`);
    const notes = String(formData.get("notes") ?? "").trim() || null;
    if (notes && notes.length > 500) throw new InputError("Nota muito longa (máximo 500 caracteres).");
    const marked = await movements.review(db, groupId, ids, notes);
    revalidatePath("/inventario/movimentacoes");
    revalidatePath("/inventario/materiais", "layout");
    revalidatePath("/inventario");
    revalidatePath("/");
    if (marked === 0) return { success: "Nada a revisar: os movimentos já estavam revisados.", tone: "neutral" };
    return marked === 1 ? "Movimento revisado." : `${marked} movimentos revisados.`;
  });
}
