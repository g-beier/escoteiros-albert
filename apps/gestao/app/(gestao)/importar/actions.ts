"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { todayISO } from "@/lib/associates/model";
import { FILHOTES_ENABLED } from "@/lib/features";
import { fileSpec, type Module } from "@/lib/import/contract";
import { planBatch, planTotals } from "@/lib/import/plan";
import { readImportFile, type ReadFile } from "@/lib/import/read";
import * as imports from "@/lib/server/import";
import { memberOrError, type Member } from "@/lib/server/session";

const filesSchema = z.array(z.object({ name: z.string().max(200), text: z.string().max(3_000_000) })).min(1, "Escolha um arquivo.").max(12, "No máximo 12 arquivos por envio.");

const canImport = (member: Member, module: Module) => (module === "associados" ? member.associates.canReview : member.inventory.canReview);

/**
 * Grava um envio de CSVs (docs/importacao.md). O servidor lê e planeja de novo contra o estado atual (a pré-visualização
 * do navegador é só para conferir) e manda as linhas novas e alteradas para `import_batch`, numa transação só.
 */
export async function importFiles(input: unknown): Promise<ActionResult> {
  return runAction(memberOrError, async (member) => {
    const parsed = filesSchema.safeParse(input);
    if (!parsed.success) throw new InputError(parsed.error.issues[0]?.message ?? "Arquivos inválidos.");
    const files: ReadFile[] = [];
    for (const { name, text } of parsed.data) {
      const read = readImportFile(name, text);
      if (read.error || !read.file) throw new InputError(read.error ?? `${name}: não foi possível ler.`);
      const spec = fileSpec(read.file.kind);
      if (!canImport(member, spec.module)) throw new InputError(`${name}: só editores do ${spec.module === "associados" ? "Associados" : "Inventário"} importam ${spec.file}.`);
      files.push(read.file);
    }
    const plan = planBatch(files, await imports.state(member.db, member.groupId), { filhotes: FILHOTES_ENABLED, today: todayISO() });
    if (plan.errors.length) throw new InputError(plan.errors.join(" "));
    const sent = plan.files.reduce((sum, file) => sum + file.payload.length, 0);
    if (!sent) return "Nada a gravar: tudo já está igual no app.";
    await imports.save(member.db, member.groupId, plan.files);
    revalidatePath("/", "layout");
    const parts = plan.files.map((file) => {
      const totals = planTotals(file);
      const done = [totals.nova && `${totals.nova} novas`, totals.atualiza && `${totals.atualiza} atualizadas`].filter(Boolean).join(", ");
      const skipped = totals.erro ? ` (${totals.erro} com erro ficaram de fora)` : "";
      return `${fileSpec(file.kind).file}: ${done || "sem mudança"}${skipped}`;
    });
    return `Importado. ${parts.join("; ")}.`;
  });
}
