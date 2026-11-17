"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { editorOrError } from "@/lib/session";
import { ATTACHMENT_BUCKET, attachmentPath, attachmentProblem, attachmentType, cleanFileName } from "@/lib/attachments";

type Result = { error?: string; success?: boolean };
export type UploadTicket = { error: string } | { path: string; uploadUrl: string; contentType: string };

const fileSchema = z.object({
  name: z.string().min(1).max(500),
  type: z.string().max(200),
  size: z.number().int().nonnegative(),
});

/**
 * 1º passo do envio: valida e devolve uma URL de envio assinada para o navegador mandar o arquivo
 * direto ao Storage (o arquivo não passa pelo servidor do app). Criar a URL já exige a política
 * de envio do bucket (tesouraria/administração do grupo do lançamento).
 */
export async function prepareAttachmentUpload(entryId: unknown, file: unknown): Promise<UploadTicket> {
  const id = z.uuid().safeParse(entryId);
  const parsed = fileSchema.safeParse(file);
  if (!id.success || !parsed.success) return { error: "Dados inválidos." };
  const problem = attachmentProblem(parsed.data);
  if (problem) return { error: problem };
  const ctx = await editorOrError("Sem permissão para anexar comprovantes.");
  if ("error" in ctx) return ctx;
  const { data: entry } = await ctx.supabase.from("ledger_entries").select("id").eq("id", id.data).eq("group_id", ctx.groupId).maybeSingle();
  if (!entry) return { error: "Lançamento não encontrado." };
  const type = attachmentType(parsed.data.name, parsed.data.type)!;
  const path = attachmentPath(ctx.groupId, id.data, randomUUID(), type);
  const { data, error } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Não foi possível preparar o envio." };
  return { path, uploadUrl: data.signedUrl, contentType: type };
}

/** 2º passo: registra o arquivo já enviado. Se o registro falhar, o arquivo é apagado. */
export async function registerAttachment(entryId: unknown, path: unknown, fileName: unknown): Promise<Result> {
  const id = z.uuid().safeParse(entryId);
  const storagePath = z.string().min(1).max(300).safeParse(path);
  const name = z.string().min(1).max(500).safeParse(fileName);
  if (!id.success || !storagePath.success || !name.success) return { error: "Dados inválidos." };
  const ctx = await editorOrError("Sem permissão para anexar comprovantes.");
  if ("error" in ctx) return ctx;
  const { error } = await ctx.supabase.rpc("add_entry_attachment", {
    p_entry_id: id.data, p_storage_path: storagePath.data, p_file_name: cleanFileName(name.data),
  });
  if (error) {
    // Só apaga o que está na pasta deste lançamento; a política do bucket confere o grupo.
    if (storagePath.data.startsWith(`${ctx.groupId}/${id.data}/`)) await ctx.supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath.data]);
    return { error: error.message };
  }
  revalidatePath(`/lancamentos/${id.data}`);
  revalidatePath("/lancamentos", "layout");
  return { success: true };
}

export async function removeAttachment(attachmentId: unknown): Promise<Result> {
  const id = z.uuid().safeParse(attachmentId);
  if (!id.success) return { error: "Anexo inválido." };
  const ctx = await editorOrError("Sem permissão para excluir comprovantes.");
  if ("error" in ctx) return ctx;
  const { data: path, error } = await ctx.supabase.rpc("delete_entry_attachment", { p_attachment_id: id.data });
  if (error) return { error: error.message };
  const { error: storageError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).remove([path as string]);
  if (storageError) console.error("remover anexo do storage", path, storageError.message);
  revalidatePath("/lancamentos", "layout");
  return { success: true };
}
