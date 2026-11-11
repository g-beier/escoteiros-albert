"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries } from "@/lib/auth";
import { entrySchema, toRpcSplits } from "@/lib/entry-schema";

export type ReconciliationResult = { error?: string; success?: string; id?: string };

const ids = z.array(z.uuid()).min(1).max(200);

async function editor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." } as const;
  const { data } = await supabase.from("memberships").select("role").eq("user_id", user.id).single();
  if (!data || !canManageEntries(data.role)) return { error: "Sem permissão para conciliar." } as const;
  return { supabase } as const;
}

function done(success: string, id?: string): ReconciliationResult {
  revalidatePath("/", "layout");
  return { success, id };
}

/** Vincula linhas do extrato e lançamentos cujas somas batem (1:1, 1:N ou N:1). */
export async function linkReconciliation(lineIds: unknown, entryIds: unknown): Promise<ReconciliationResult> {
  const lines = ids.safeParse(lineIds);
  const entries = ids.safeParse(entryIds);
  if (!lines.success || !entries.success) return { error: "Selecione ao menos uma linha do extrato e um lançamento." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("link_reconciliation", { p_statement_line_ids: lines.data, p_ledger_entry_ids: entries.data });
  if (error) return { error: error.message };
  return done(lines.data.length + entries.data.length > 2 ? "Vínculo criado." : "Par conciliado.");
}

/** Aceita várias sugestões 1:1; cada par é gravado separadamente e os que falharem são informados. */
export async function acceptSuggestions(pairs: unknown): Promise<ReconciliationResult> {
  const parsed = z.array(z.object({ lineId: z.uuid(), entryId: z.uuid() })).min(1).max(500).safeParse(pairs);
  if (!parsed.success) return { error: "Nenhuma sugestão para aceitar." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  let accepted = 0;
  let firstError: string | undefined;
  for (const pair of parsed.data) {
    const { error } = await ctx.supabase.rpc("link_reconciliation", { p_statement_line_ids: [pair.lineId], p_ledger_entry_ids: [pair.entryId] });
    if (error) firstError ??= error.message; else accepted += 1;
  }
  if (accepted) revalidatePath("/", "layout");
  if (firstError) return { error: accepted ? `${accepted} conciliadas; ${parsed.data.length - accepted} falharam: ${firstError}` : firstError };
  return { success: accepted === 1 ? "Sugestão aceita." : `${accepted} sugestões aceitas.` };
}

export async function unlinkReconciliation(lineId: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(lineId);
  if (!id.success) return { error: "Linha inválida." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("unlink_reconciliation", { p_statement_line_id: id.data });
  if (error) return { error: error.message };
  return done("Vínculo desfeito.");
}

export async function rejectSuggestion(lineId: unknown, entryId: unknown): Promise<ReconciliationResult> {
  const line = z.uuid().safeParse(lineId);
  const entry = z.uuid().safeParse(entryId);
  if (!line.success || !entry.success) return { error: "Sugestão inválida." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("reject_reconciliation_suggestion", { p_statement_line_id: line.data, p_ledger_entry_id: entry.data });
  if (error) return { error: error.message };
  return done("Sugestão recusada; o par não será sugerido de novo.");
}

export async function ignoreStatementLine(lineId: unknown, reason: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(lineId);
  const text = z.string().trim().min(2, "Informe o motivo.").max(200, "Motivo: no máximo 200 caracteres.").safeParse(reason);
  if (!id.success) return { error: "Linha inválida." };
  if (!text.success) return { error: text.error.issues[0]?.message };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("ignore_statement_line", { p_id: id.data, p_reason: text.data });
  if (error) return { error: error.message };
  return done("Linha ignorada.");
}

export async function reopenStatementLine(lineId: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(lineId);
  if (!id.success) return { error: "Linha inválida." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("reopen_statement_line", { p_id: id.data });
  if (error) return { error: error.message };
  return done("Linha reaberta.");
}

export async function setOutsideStatement(entryId: unknown, outside: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(entryId);
  const value = z.boolean().safeParse(outside);
  if (!id.success || !value.success) return { error: "Dados inválidos." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("set_ledger_entry_outside_statement", { p_entry_id: id.data, p_outside: value.data });
  if (error) return { error: error.message };
  return done(value.data ? "Lançamento marcado como fora do extrato." : "Lançamento voltou para a conciliação.");
}

export async function setEntryAccount(entryId: unknown, accountId: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(entryId);
  const account = z.uuid().safeParse(accountId);
  if (!id.success) return { error: "Lançamento inválido." };
  if (!account.success) return { error: "Escolha a conta." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("set_ledger_entry_account", { p_entry_id: id.data, p_account_id: account.data });
  if (error) return { error: error.message };
  return done("Conta do lançamento alterada.");
}

/** Cria o lançamento a partir da linha do extrato e já o vincula a ela (uma transação no banco). */
export async function createEntryFromStatementLine(lineId: unknown, payload: unknown): Promise<ReconciliationResult> {
  const id = z.uuid().safeParse(lineId);
  const parsed = entrySchema.safeParse(payload);
  if (!id.success) return { error: "Linha inválida." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await editor();
  if ("error" in ctx) return { error: ctx.error };
  const { data, error } = await ctx.supabase.rpc("create_entry_from_statement_line", {
    p_statement_line_id: id.data,
    p_entry_date: parsed.data.date,
    p_name: parsed.data.name,
    p_payment_method_id: parsed.data.paymentMethodId,
    p_document: parsed.data.document || null,
    p_document_filed: parsed.data.documentFiled,
    p_total_cents: parsed.data.totalCents,
    p_splits: toRpcSplits(parsed.data.splits),
  });
  if (error) return { error: error.message };
  return done("Lançamento criado e conciliado.", data as string);
}
