"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { editorOrError } from "@/lib/session";

export type FeeResult = { error?: string; success?: string };

const year = z.number().int().min(2000).max(2100);
const month = z.number().int().min(3).max(12);

function done(success?: string): FeeResult {
  revalidatePath("/mensalidades");
  revalidatePath("/");
  return { success };
}

/** Registra a caixinha: pago ou atenção (com nota e rateios) ou limpa (status nulo). */
export async function setFeeRecord(payload: unknown): Promise<FeeResult> {
  const parsed = z.object({
    associateId: z.uuid(), year, month,
    status: z.enum(["pago", "atencao"]).nullable(),
    note: z.string().trim().max(200, "Nota: no máximo 200 caracteres.").optional(),
    splitIds: z.array(z.uuid()).max(50).default([]),
  }).safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await editorOrError("Sem permissão para registrar mensalidades.");
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("set_fee_record", {
    p_associate_id: parsed.data.associateId, p_year: parsed.data.year, p_month: parsed.data.month,
    p_status: parsed.data.status, p_note: parsed.data.note || null, p_split_ids: parsed.data.splitIds,
  });
  if (error) return { error: error.message };
  return done();
}

/** Confirma sugestões (pago + vínculo ao rateio) em lote. */
export async function confirmFeeSuggestions(items: unknown): Promise<FeeResult> {
  const parsed = z.array(z.object({ associateId: z.uuid(), year, month, splitId: z.uuid() })).min(1).max(5000).safeParse(items);
  if (!parsed.success) return { error: "Nenhuma sugestão para confirmar." };
  const ctx = await editorOrError("Sem permissão para registrar mensalidades.");
  if ("error" in ctx) return { error: ctx.error };
  const { data, error } = await ctx.supabase.rpc("confirm_fee_suggestions", { p_items: parsed.data });
  if (error) return { error: error.message };
  const count = Number(data);
  return done(`${count} ${count === 1 ? "mensalidade confirmada" : "mensalidades confirmadas"}.`);
}

/** Isenta o associado no ano (motivo) ou remove a isenção (motivo vazio). */
export async function setFeeExemption(associateId: unknown, yearValue: unknown, reason: unknown): Promise<FeeResult> {
  const parsed = z.object({ associateId: z.uuid(), year, reason: z.string().trim().max(120, "Motivo: no máximo 120 caracteres.") })
    .safeParse({ associateId, year: yearValue, reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (parsed.data.reason && parsed.data.reason.length < 2) return { error: "Informe o motivo." };
  const ctx = await editorOrError("Sem permissão para registrar mensalidades.");
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("set_fee_exemption", { p_associate_id: parsed.data.associateId, p_year: parsed.data.year, p_reason: parsed.data.reason || null });
  if (error) return { error: error.message };
  return done(parsed.data.reason ? "Isenção registrada." : "Isenção removida.");
}

export type FeeSettingsState = { error?: string; success?: string };

/** Configurações › Mensalidades: regra de vencimento e rubrica. */
export async function saveFeeSettings(_previous: FeeSettingsState, formData: FormData): Promise<FeeSettingsState> {
  const parsed = z.object({
    dueRule: z.enum(["dia_fixo", "dia_util", "fim_do_mes"], { message: "Escolha a regra de vencimento." }),
    dueDay: z.coerce.number().int().min(1).max(28).catch(10),
    categoryId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  }).safeParse({ dueRule: formData.get("dueRule"), dueDay: formData.get("dueDay"), categoryId: formData.get("categoryId") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await editorOrError("Sem permissão para alterar as configurações.");
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase.rpc("set_fee_settings", {
    p_group_id: ctx.groupId, p_due_rule: parsed.data.dueRule, p_due_day: parsed.data.dueDay, p_category_id: parsed.data.categoryId,
  });
  if (error) return { error: error.message };
  revalidatePath("/cadastros");
  done();
  return { success: "Configurações de mensalidade salvas." };
}
