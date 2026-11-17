"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataError } from "@/lib/server/db";
import * as attachments from "@/lib/server/finance/attachments";
import { financeEditorOrError } from "@/lib/server/session";
import { attachmentProblem } from "@/lib/finance/attachments";

type Result = { error?: string; success?: boolean };
export type UploadTicket = { error: string } | { path: string; uploadUrl: string; contentType: string };

const fileSchema = z.object({
  name: z.string().min(1).max(500),
  type: z.string().max(200),
  size: z.number().int().nonnegative(),
});

const failure = (error: unknown) => {
  if (error instanceof DataError) return { error: error.message };
  throw error;
};

/**
 * 1º passo do envio: valida e devolve uma URL de envio assinada para o navegador mandar o arquivo
 * direto ao storage (o arquivo não passa pelo servidor do app).
 */
export async function prepareAttachmentUpload(entryId: unknown, file: unknown): Promise<UploadTicket> {
  const id = z.uuid().safeParse(entryId);
  const parsed = fileSchema.safeParse(file);
  if (!id.success || !parsed.success) return { error: "Dados inválidos." };
  const problem = attachmentProblem(parsed.data);
  if (problem) return { error: problem };
  const ctx = await financeEditorOrError("Sem permissão para anexar comprovantes.");
  if ("error" in ctx) return ctx;
  try {
    return await attachments.prepareUpload(ctx.db, ctx.groupId, id.data, parsed.data);
  } catch (error) {
    return failure(error);
  }
}

/** 2º passo: registra o arquivo já enviado. Se o registro falhar, o arquivo é apagado. */
export async function registerAttachment(entryId: unknown, path: unknown, fileName: unknown): Promise<Result> {
  const id = z.uuid().safeParse(entryId);
  const storagePath = z.string().min(1).max(300).safeParse(path);
  const name = z.string().min(1).max(500).safeParse(fileName);
  if (!id.success || !storagePath.success || !name.success) return { error: "Dados inválidos." };
  const ctx = await financeEditorOrError("Sem permissão para anexar comprovantes.");
  if ("error" in ctx) return ctx;
  try {
    await attachments.register(ctx.db, ctx.groupId, id.data, storagePath.data, name.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/financeiro/lancamentos/${id.data}`);
  revalidatePath("/financeiro/lancamentos", "layout");
  return { success: true };
}

export async function removeAttachment(attachmentId: unknown): Promise<Result> {
  const id = z.uuid().safeParse(attachmentId);
  if (!id.success) return { error: "Anexo inválido." };
  const ctx = await financeEditorOrError("Sem permissão para excluir comprovantes.");
  if ("error" in ctx) return ctx;
  try {
    await attachments.remove(ctx.db, id.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/financeiro/lancamentos", "layout");
  return { success: true };
}
