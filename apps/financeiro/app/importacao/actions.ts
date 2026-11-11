"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries } from "@/lib/auth";
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

async function membership() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." } as const;
  const { data } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!data) return { error: "Sua conta ainda não pertence a um grupo." } as const;
  return { supabase, groupId: data.group_id as string, canEdit: canManageEntries(data.role) } as const;
}

/** Perfis de importação do grupo (um por banco/formato), mais recentes primeiro. */
export async function listImportProfiles(): Promise<ActionResult<ImportProfile[]>> {
  const ctx = await membership();
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
  const ctx = await membership();
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
  const ctx = await membership();
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
