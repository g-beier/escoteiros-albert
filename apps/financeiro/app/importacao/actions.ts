"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { memberOrError } from "@/lib/session";
import {
  type AccountBalance, fromRpcAccountBalance, fromRpcImportResult, fromRpcPreview, type ImportPreview, importLinesSchema, MAX_IMPORT_LINES, importProfileSchema, importSummary, parseStatementLines, toRpcLines,
  type ImportResult,
} from "@/lib/import-schema";

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

/** Cria (sem `id`) ou atualiza um perfil de importação. */
export async function saveImportProfile(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = importProfileSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.canEdit) return { error: "Sem permissão para alterar perfis de importação." };
  const { data, error } = await ctx.supabase.rpc("save_import_profile", {
    p_group_id: ctx.groupId,
    p_profile_id: parsed.data.id ?? null,
    p_name: parsed.data.name,
    p_format: parsed.data.format,
    p_header_signature: parsed.data.headerSignature || null,
    p_settings: parsed.data.settings,
  });
  if (error) return { error: error.message };
  return { success: `Perfil “${parsed.data.name}” salvo.`, data: { id: data as string } };
}

/** Grava as linhas do extrato como abertas; duplicatas são puladas pelo banco. */
export async function importStatementLines(payload: unknown): Promise<ActionResult<ImportResult>> {
  const parsed = importLinesSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const lines = parseStatementLines(parsed.data.lines);
  if ("error" in lines) return { error: lines.error };
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.canEdit) return { error: "Sem permissão para importar extratos." };
  const { data, error } = await ctx.supabase.rpc("import_statement_lines", {
    p_account_id: parsed.data.accountId,
    p_profile_id: parsed.data.profileId ?? null,
    p_profile_settings: parsed.data.profileSettings ?? null,
    p_file_name: parsed.data.fileName,
    p_period_from: parsed.data.periodFrom ?? null,
    p_period_to: parsed.data.periodTo ?? null,
    p_opening_balance_cents: parsed.data.openingBalanceCents ?? null,
    p_closing_balance_cents: parsed.data.closingBalanceCents ?? null,
    p_lines: toRpcLines(lines.lines),
  });
  if (error) return { error: error.message };
  const result = fromRpcImportResult(data);
  if (!result) return { error: "Resposta inesperada do banco ao importar." };
  revalidatePath("/", "layout");
  return { success: importSummary(result), data: result };
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
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.canEdit) return { error: "Sem permissão para importar extratos." };
  const { data, error } = await ctx.supabase.rpc("preview_statement_lines", {
    p_account_id: parsed.data.accountId, p_period_from: parsed.data.periodFrom ?? null, p_period_to: parsed.data.periodTo ?? null,
    p_lines: toRpcLines(lines.lines),
  });
  if (error) return { error: error.message };
  const preview = fromRpcPreview(data);
  return preview ? { data: preview } : { error: "Resposta inesperada do banco na conferência." };
}

/** Desfaz uma importação inteira: apaga as linhas e desfaz os vínculos de conciliação delas. */
export async function deleteStatementImport(importId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(importId);
  if (!id.success) return { error: "Importação inválida." };
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.canEdit) return { error: "Sem permissão para desfazer importações." };
  const { data, error } = await ctx.supabase.rpc("delete_statement_import", { p_import_id: id.data });
  if (error) return { error: error.message };
  const result = z.object({ lines: z.number(), unlinked: z.number() }).catch({ lines: 0, unlinked: 0 }).parse(data);
  revalidatePath("/", "layout");
  const lines = `${result.lines} ${result.lines === 1 ? "linha removida" : "linhas removidas"}`;
  return { success: result.unlinked ? `Importação desfeita: ${lines}; ${result.unlinked} ${result.unlinked === 1 ? "conciliação desfeita" : "conciliações desfeitas"}.` : `Importação desfeita: ${lines}.` };
}

const balancePayload = z.object({ accountId: z.uuid({ message: "Escolha a conta." }), date: z.iso.date({ message: "Data inválida." }) });

/** Saldo da conta no sistema no começo da primeira data do arquivo, para conferir com o saldo inicial do OFX. */
export async function accountBalanceBefore(payload: unknown): Promise<ActionResult<AccountBalance>> {
  const parsed = balancePayload.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  const { data, error } = await ctx.supabase.rpc("account_balance_before", { p_account_id: parsed.data.accountId, p_date: parsed.data.date });
  if (error) return { error: error.message };
  const balance = fromRpcAccountBalance(data);
  return balance ? { data: balance } : { error: "Resposta inesperada do banco ao calcular o saldo." };
}
