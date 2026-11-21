"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { SCOUT_BRANCHES } from "@/lib/associates/model";
import * as associates from "@/lib/server/associates/associates";
import { associatesEditorOrError } from "@/lib/server/session";

const importRow = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  branch: z.enum(SCOUT_BRANCHES),
  section: z.string().trim().max(60).nullable().optional(),
  patrol: z.string().trim().max(60).nullable().optional(),
  active: z.boolean(),
});

/** Importação em massa (CSV lido no navegador): cadastra novos e, com `id`, atualiza ramo, seção e status. Tudo ou nada. */
export async function importAssociates(rows: unknown): Promise<ActionResult> {
  return runAction(() => associatesEditorOrError("Sem permissão para importar associados."), async ({ db, groupId }) => {
    const parsed = z.array(importRow).min(1, "Nenhum associado para importar.").max(5000, "Importe no máximo 5.000 associados por vez.").safeParse(rows);
    if (!parsed.success) throw new InputError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const result = await associates.importRows(db, groupId, parsed.data);
    revalidatePath("/associados", "layout");
    const parts = [
      result.created && `${result.created} ${result.created === 1 ? "cadastrado" : "cadastrados"}`,
      result.updated && `${result.updated} ${result.updated === 1 ? "atualizado" : "atualizados"}`,
    ].filter(Boolean);
    return `Associados importados: ${parts.join(", ")}.`;
  });
}
