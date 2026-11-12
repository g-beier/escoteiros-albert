"use server";

import { revalidatePath } from "next/cache";
import { memberOrError } from "@/lib/session";
import {
  fromRpcImportResult, importLinesSchema, importProfileSchema, importSummary, parseStatementLines, toRpcLines,
  type ImportResult,
} from "@/lib/import-schema";

export type ImportProfile = {
  id: string;
  name: string;
  format: "csv" | "ofx";
  header_signature: string | null;
  settings: Record<string, unknown>;
  updated_at: string;
};

type ActionResult<T = undefined> = { error?: string; success?: string; data?: T };

/** Perfis de importação do grupo (um por banco/formato), mais recentes primeiro. */
export async function listImportProfiles(): Promise<ActionResult<ImportProfile[]>> {
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  const { data, error } = await ctx.supabase.from("import_profiles")
    .select("id, name, format, header_signature, settings, updated_at")
    .eq("group_id", ctx.groupId).order("updated_at", { ascending: false });
  if (error) return { error: error.message };
  return { data: (data ?? []) as ImportProfile[] };
}

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
  const ofxKey = parsed.data.ofxKey ?? null;
  if (ofxKey) {
    // O arquivo é da conta escolhida? Na primeira vez, a conta passa a reconhecê-lo.
    const { data: accounts, error: accountsError } = await ctx.supabase.from("accounts").select("id, name, ofx_key").eq("group_id", ctx.groupId);
    if (accountsError) return { error: accountsError.message };
    const owner = accounts?.find((account) => account.ofx_key === ofxKey);
    const chosen = accounts?.find((account) => account.id === parsed.data.accountId);
    if (owner && owner.id !== parsed.data.accountId) return { error: `Este arquivo é da conta “${owner.name}”.` };
    if (!owner && chosen?.ofx_key) return { error: `A conta “${chosen.name}” recebe outro arquivo OFX (${chosen.ofx_key}). Confira a conta escolhida.` };
    if (!owner) {
      const { error: keyError } = await ctx.supabase.rpc("set_account_ofx_key", { p_account_id: parsed.data.accountId, p_ofx_key: ofxKey });
      if (keyError) return { error: keyError.message };
    }
  }
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
