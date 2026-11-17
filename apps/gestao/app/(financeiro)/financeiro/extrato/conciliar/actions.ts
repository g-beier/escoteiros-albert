"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InputError } from "@/lib/action";
import { entrySchema } from "@/lib/finance/entry-schema";
import { DataError, type Db } from "@/lib/server/db";
import * as reconciliation from "@/lib/server/finance/reconciliation";
import { financeEditorOrError } from "@/lib/server/session";

export type ReconciliationResult = { error?: string; success?: string; id?: string };

const ids = z.array(z.uuid()).min(1).max(200);

/** Tesouraria/administração; erros de validação e do banco viram `{ error }`; sucesso revalida tudo. */
async function reconcile(work: (db: Db) => Promise<ReconciliationResult>): Promise<ReconciliationResult> {
  const ctx = await financeEditorOrError("Sem permissão para conciliar.");
  if ("error" in ctx) return { error: ctx.error };
  try {
    const result = await work(ctx.db);
    if (result.success) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    if (error instanceof InputError || error instanceof DataError) return { error: error.message };
    throw error;
  }
}

function valid<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }, message?: string): T {
  if (!result.success) throw new InputError(message ?? result.error.issues[0]?.message ?? "Dados inválidos.");
  return result.data;
}

/** Vincula linhas do extrato e lançamentos cujas somas batem (1:1, 1:N ou N:1). */
export async function linkReconciliation(lineIds: unknown, entryIds: unknown): Promise<ReconciliationResult> {
  const lines = ids.safeParse(lineIds);
  const entries = ids.safeParse(entryIds);
  if (!lines.success || !entries.success) return { error: "Selecione ao menos uma linha do extrato e um lançamento." };
  return reconcile(async (db) => {
    await reconciliation.link(db, lines.data, entries.data);
    return { success: lines.data.length + entries.data.length > 2 ? "Vínculo criado." : "Par conciliado." };
  });
}

/** Aceita várias sugestões 1:1; cada par é gravado separadamente e os que falharem são informados. */
export async function acceptSuggestions(pairs: unknown): Promise<ReconciliationResult> {
  const parsed = z.array(z.object({ lineId: z.uuid(), entryId: z.uuid() })).min(1).max(500).safeParse(pairs);
  if (!parsed.success) return { error: "Nenhuma sugestão para aceitar." };
  const ctx = await financeEditorOrError("Sem permissão para conciliar.");
  if ("error" in ctx) return { error: ctx.error };
  let accepted = 0;
  let firstError: string | undefined;
  for (const pair of parsed.data) {
    try {
      await reconciliation.link(ctx.db, [pair.lineId], [pair.entryId]);
      accepted += 1;
    } catch (error) {
      if (!(error instanceof DataError)) throw error;
      firstError ??= error.message;
    }
  }
  if (accepted) revalidatePath("/", "layout");
  if (firstError) return { error: accepted ? `${accepted} conciliadas; ${parsed.data.length - accepted} falharam: ${firstError}` : firstError };
  return { success: accepted === 1 ? "Sugestão aceita." : `${accepted} sugestões aceitas.` };
}

export async function unlinkReconciliation(lineId: unknown): Promise<ReconciliationResult> {
  return reconcile(async (db) => {
    await reconciliation.unlink(db, valid(z.uuid().safeParse(lineId), "Linha inválida."));
    return { success: "Vínculo desfeito." };
  });
}

export async function rejectSuggestion(lineId: unknown, entryId: unknown): Promise<ReconciliationResult> {
  return reconcile(async (db) => {
    const line = valid(z.uuid().safeParse(lineId), "Sugestão inválida.");
    const entry = valid(z.uuid().safeParse(entryId), "Sugestão inválida.");
    await reconciliation.reject(db, line, entry);
    return { success: "Sugestão recusada; o par não será sugerido de novo." };
  });
}

const reasonSchema = z.string().trim().min(2, "Informe o motivo.").max(200, "Motivo: no máximo 200 caracteres.");

export async function ignoreStatementLine(lineId: unknown, reason: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(lineId);
  if (!id.success) return { error: "Linha inválida." };
  const text = reasonSchema.safeParse(reason);
  if (!text.success) return { error: text.error.issues[0]?.message };
  return reconcile(async (db) => {
    await reconciliation.ignoreLine(db, id.data, text.data);
    return { success: "Linha ignorada." };
  });
}

export async function reopenStatementLine(lineId: unknown): Promise<ReconciliationResult> {
  return reconcile(async (db) => {
    await reconciliation.reopenLine(db, valid(z.uuid().safeParse(lineId), "Linha inválida."));
    return { success: "Linha reaberta." };
  });
}

export async function setOutsideStatement(entryId: unknown, outside: unknown): Promise<ReconciliationResult> {
  return reconcile(async (db) => {
    const id = valid(z.uuid().safeParse(entryId), "Dados inválidos.");
    const value = valid(z.boolean().safeParse(outside), "Dados inválidos.");
    await reconciliation.setOutsideStatement(db, id, value);
    return { success: value ? "Lançamento marcado como fora do extrato." : "Lançamento voltou para a conciliação." };
  });
}

export async function setEntryAccount(entryId: unknown, accountId: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(entryId);
  const account = z.uuid().safeParse(accountId);
  if (!id.success) return { error: "Lançamento inválido." };
  if (!account.success) return { error: "Escolha a conta." };
  return reconcile(async (db) => {
    await reconciliation.setEntryAccount(db, id.data, account.data);
    return { success: "Conta do lançamento alterada." };
  });
}

/** Cria o lançamento a partir da linha do extrato e já o vincula a ela (uma transação no banco). */
export async function createEntryFromStatementLine(lineId: unknown, payload: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(lineId);
  const parsed = entrySchema.safeParse(payload);
  if (!id.success) return { error: "Linha inválida." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return reconcile(async (db) => ({ success: "Lançamento criado e conciliado.", id: await reconciliation.createEntryFromLine(db, id.data, parsed.data) }));
}

const bulkItem = z.object({
  lineId: z.uuid(),
  name: z.string().trim().max(200).optional(),
  paymentMethodId: z.uuid({ message: "Escolha a forma de pagamento de todas as linhas." }),
  categoryId: z.uuid().optional(),
  description: z.string().trim().max(200).optional(),
});

/**
 * Cria um lançamento por linha do extrato, já conciliado, tudo numa transação. Sem rubrica,
 * entradas vão para 1 Receitas e saídas para 2 Despesas, para recategorizar depois.
 */
export async function createEntriesFromLines(items: unknown): Promise<ReconciliationResult> {
  const parsed = z.array(bulkItem).min(1, "Selecione ao menos uma linha.").max(500, "Crie no máximo 500 lançamentos por vez.").safeParse(items);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return reconcile(async (db) => {
    const count = await reconciliation.createEntriesFromLines(db, parsed.data);
    return { success: `${count} ${count === 1 ? "lançamento criado e conciliado" : "lançamentos criados e conciliados"}. Recategorize em Lançamentos › Detalhamento.` };
  });
}

/** Ignora várias linhas abertas com o mesmo motivo. */
export async function ignoreStatementLines(lineIds: unknown, reason: unknown): Promise<ReconciliationResult> {
  const parsedIds = z.array(z.uuid()).min(1).max(1000).safeParse(lineIds);
  if (!parsedIds.success) return { error: "Selecione ao menos uma linha." };
  const text = reasonSchema.safeParse(reason);
  if (!text.success) return { error: text.error.issues[0]?.message };
  return reconcile(async (db) => {
    const count = await reconciliation.ignoreLines(db, parsedIds.data, text.data);
    return { success: count === 1 ? "Linha ignorada." : `${count} linhas ignoradas.` };
  });
}
