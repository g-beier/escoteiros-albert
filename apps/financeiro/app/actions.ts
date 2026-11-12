"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { memberOrError } from "@/lib/session";
import { entrySchema, toRpcSplits } from "@/lib/entry-schema";
import { fetchEntryPage, type EntryPage } from "@/lib/entry-queries";
import { parseFilters, parseOrder } from "@/lib/filters";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";

type Result = { error?: string; success?: boolean; id?: string };

export async function createEntry(payload: unknown): Promise<Result> {
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const ctx = await memberOrError();
  if ("error" in ctx) return { error: ctx.error };
  const { data, error } = await ctx.supabase.rpc("create_ledger_entry", {
    p_group_id: ctx.groupId,
    p_entry_date: parsed.data.date,
    p_name: parsed.data.name,
    p_payment_method_id: parsed.data.paymentMethodId,
    p_account_id: parsed.data.accountId,
    p_document: parsed.data.document || null,
    p_document_filed: parsed.data.documentFiled,
    p_total_cents: parsed.data.totalCents,
    p_splits: toRpcSplits(parsed.data.splits),
    p_notes: parsed.data.notes?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true, id: data as string };
}

export async function updateEntry(entryId: unknown, payload: unknown): Promise<Result> {
  const id = z.uuid().safeParse(entryId);
  const parsed = entrySchema.safeParse(payload);
  if (!id.success) return { error: "Lançamento inválido." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_ledger_entry", {
    p_entry_id: id.data,
    p_entry_date: parsed.data.date,
    p_name: parsed.data.name,
    p_payment_method_id: parsed.data.paymentMethodId,
    p_account_id: parsed.data.accountId,
    p_document: parsed.data.document || null,
    p_document_filed: parsed.data.documentFiled,
    p_total_cents: parsed.data.totalCents,
    p_splits: toRpcSplits(parsed.data.splits),
    p_notes: parsed.data.notes?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  revalidatePath(`/lancamentos/${id.data}`);
  return { success: true };
}

export async function deleteEntry(entryId: unknown): Promise<Result> {
  const id = z.uuid().safeParse(entryId);
  if (!id.success) return { error: "Lançamento inválido." };
  const supabase = await createClient();
  // Os registros de anexo saem em cascata; os arquivos do Storage são apagados aqui, depois.
  const { data: attachments } = await supabase.from("entry_attachments").select("storage_path").eq("entry_id", id.data);
  const { error } = await supabase.rpc("delete_ledger_entry", { p_entry_id: id.data });
  if (error) return { error: error.message };
  const paths = (attachments ?? []).map((row) => row.storage_path as string);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths);
    if (storageError) console.error("remover anexos do lançamento excluído", id.data, storageError.message);
  }
  revalidatePath("/", "layout");
  return { success: true };
}

export async function setDocumentFiled(entryId: unknown, filed: unknown): Promise<Result> {
  const id = z.uuid().safeParse(entryId);
  const value = z.boolean().safeParse(filed);
  if (!id.success || !value.success) return { error: "Dados inválidos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_entry_document_filed", { p_entry_id: id.data, p_filed: value.data });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

/** Próxima página da rolagem infinita; os filtros chegam como a query string da lista. */
export async function loadEntryPage(query: unknown, offset: unknown): Promise<EntryPage> {
  const params = Object.fromEntries(new URLSearchParams(typeof query === "string" ? query : ""));
  const view = params.visao === "rubricas" ? "rubricas" : "lancamentos";
  const start = z.number().int().min(0).max(1_000_000).safeParse(offset);
  if (!start.success) return { view, rows: [], total: null, error: "Página inválida." };
  const ctx = await memberOrError();
  if ("error" in ctx) return { view, rows: [], total: null, error: ctx.error };
  return fetchEntryPage(ctx.supabase, ctx.groupId, view, parseFilters(params), parseOrder(params), start.data, false);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
