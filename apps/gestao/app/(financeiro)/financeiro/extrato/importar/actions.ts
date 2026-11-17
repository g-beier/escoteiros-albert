"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataError, type Db } from "@/lib/server/db";
import * as statements from "@/lib/server/finance/statements";
import { memberOrError } from "@/lib/server/session";
import {
  type AccountBalance, fromRpcAccountBalance, fromRpcImportResult, fromRpcPreview, type ImportPreview, importLinesSchema, MAX_IMPORT_LINES, importProfileSchema, importSummary, parseStatementLines, toRpcLines,
  type ImportResult,
} from "@/lib/finance/import-schema";

export type ImportProfile = {
  id: string;
  name: string;
  /** Perfis "csv" antigos podem continuar no banco, mas a importação só usa os "ofx". */
  format: "csv" | "ofx";
  header_signature: string | null;
  settings: Record<string, unknown>;
  updated_at: string;
};

type ActionResult<T = undefined> = { error?: string; success?: string; data?: T };

/** Membro (e, com `denied`, só tesouraria/administração); `DataError` vira `{ error }`. */
async function withDb<T>(denied: string | null, work: (db: Db, groupId: string) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  if (denied && !ctx.finance.canEdit) return { error: denied };
  try {
    return await work(ctx.db, ctx.groupId);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
}

/** Cria (sem `id`) ou atualiza um perfil de importação. */
export async function saveImportProfile(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = importProfileSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return withDb("Sem permissão para alterar perfis de importação.", async (db, groupId) => {
    const id = await statements.saveProfile(db, groupId, parsed.data);
    return { success: `Perfil “${parsed.data.name}” salvo.`, data: { id } };
  });
}

/** Grava as linhas do extrato como abertas; duplicatas são puladas pelo banco. */
export async function importStatementLines(payload: unknown): Promise<ActionResult<ImportResult>> {
  const parsed = importLinesSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const lines = parseStatementLines(parsed.data.lines);
  if ("error" in lines) return { error: lines.error };
  return withDb("Sem permissão para importar extratos.", async (db) => {
    const result = fromRpcImportResult(await statements.importLines(db, { ...parsed.data, lines: toRpcLines(lines.lines) }));
    if (!result) return { error: "Resposta inesperada do banco ao importar." };
    revalidatePath("/", "layout");
    return { success: importSummary(result), data: result };
  });
}

const previewPayload = z.object({
  accountId: z.uuid({ message: "Escolha a conta." }),
  periodFrom: z.iso.date().optional().nullable(),
  periodTo: z.iso.date().optional().nullable(),
  lines: z.array(z.unknown()).max(MAX_IMPORT_LINES),
});

/** Conferência antes de importar: novas, já importadas, suspeitas e órfãs (nada é gravado). */
export async function previewStatementImport(payload: unknown): Promise<ActionResult<ImportPreview>> {
  const parsed = previewPayload.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const lines = parseStatementLines(parsed.data.lines);
  if ("error" in lines) return { error: lines.error };
  return withDb("Sem permissão para importar extratos.", async (db) => {
    const preview = fromRpcPreview(await statements.previewLines(db, parsed.data.accountId, parsed.data.periodFrom ?? null, parsed.data.periodTo ?? null, toRpcLines(lines.lines)));
    return preview ? { data: preview } : { error: "Resposta inesperada do banco na conferência." };
  });
}

/** Desfaz uma importação inteira: apaga as linhas e desfaz os vínculos de conciliação delas. */
export async function deleteStatementImport(importId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(importId);
  if (!id.success) return { error: "Importação inválida." };
  return withDb("Sem permissão para desfazer importações.", async (db) => {
    const result = await statements.deleteImport(db, id.data);
    revalidatePath("/", "layout");
    const lines = `${result.lines} ${result.lines === 1 ? "linha removida" : "linhas removidas"}`;
    return { success: result.unlinked ? `Importação desfeita: ${lines}; ${result.unlinked} ${result.unlinked === 1 ? "conciliação desfeita" : "conciliações desfeitas"}.` : `Importação desfeita: ${lines}.` };
  });
}

const balancePayload = z.object({ accountId: z.uuid({ message: "Escolha a conta." }), date: z.iso.date({ message: "Data inválida." }) });

/** Saldo da conta no sistema no começo da primeira data do arquivo, para conferir com o saldo inicial do OFX. */
export async function accountBalanceBefore(payload: unknown): Promise<ActionResult<AccountBalance>> {
  const parsed = balancePayload.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  return withDb(null, async (db) => {
    const balance = fromRpcAccountBalance(await statements.balanceBefore(db, parsed.data.accountId, parsed.data.date));
    return balance ? { data: balance } : { error: "Resposta inesperada do banco ao calcular o saldo." };
  });
}
