import { randomUUID } from "node:crypto";
import { ATTACHMENT_BUCKET, ATTACHMENT_COLUMNS, ATTACHMENT_URL_TTL, attachmentPath, attachmentType, cleanFileName, type Attachment } from "@/lib/finance/attachments";
import { DataError, type Db } from "@/lib/server/db";
import { removeFiles, signedDownloadUrl, signedUploadUrl } from "@/lib/server/files";
import { rowsOf, rpc, untyped, unwrap } from "@/lib/server/supabase/db";

// Comprovantes dos lançamentos (027): registro em entry_attachments pelas funções auditadas e arquivo no bucket.

export async function listForEntry(db: Db, entryId: string): Promise<Attachment[]> {
  return rowsOf(await untyped(db).from("entry_attachments").select(ATTACHMENT_COLUMNS).eq("entry_id", entryId).order("created_at").order("id")) as Attachment[];
}

/**
 * 1º passo do envio (arquivo já validado): confere o lançamento e devolve onde e como o navegador envia.
 * Criar a URL já exige a política de envio do bucket (tesouraria/administração do grupo).
 */
export async function prepareUpload(db: Db, groupId: string, entryId: string, file: { name: string; type: string }) {
  const entry = unwrap(await untyped(db).from("ledger_entries").select("id").eq("id", entryId).eq("group_id", groupId).maybeSingle());
  if (!entry) throw new DataError("Lançamento não encontrado.");
  const contentType = attachmentType(file.name, file.type)!;
  const path = attachmentPath(groupId, entryId, randomUUID(), contentType);
  return { path, uploadUrl: await signedUploadUrl(db, ATTACHMENT_BUCKET, path), contentType };
}

/** 2º passo: registra o arquivo enviado. Se o registro falhar, apaga o arquivo (só dentro da pasta do lançamento). */
export async function register(db: Db, groupId: string, entryId: string, path: string, fileName: string) {
  try {
    await rpc(db, "add_entry_attachment", { p_entry_id: entryId, p_storage_path: path, p_file_name: cleanFileName(fileName) });
  } catch (error) {
    if (path.startsWith(`${groupId}/${entryId}/`)) await removeFiles(db, ATTACHMENT_BUCKET, [path]).catch(() => undefined);
    throw error;
  }
}

/** Exclui o registro e depois o arquivo (falha no arquivo só vai para o log: o registro já saiu). */
export async function remove(db: Db, attachmentId: string) {
  const path = await rpc(db, "delete_entry_attachment", { p_attachment_id: attachmentId }) as string;
  await removeFiles(db, ATTACHMENT_BUCKET, [path]).catch((error) => console.error("remover anexo do storage", path, (error as Error).message));
}

/** URL curta para abrir (ou baixar) um comprovante; `null` se o anexo não existe ou não é do lançamento. */
export async function downloadUrl(db: Db, entryId: string, attachmentId: string, download: boolean): Promise<string | null> {
  const attachment = unwrap(await untyped(db).from("entry_attachments").select("storage_path, file_name").eq("id", attachmentId).eq("entry_id", entryId).maybeSingle()) as
    { storage_path: string; file_name: string } | null;
  if (!attachment) return null;
  return signedDownloadUrl(db, ATTACHMENT_BUCKET, attachment.storage_path, ATTACHMENT_URL_TTL, download ? attachment.file_name : undefined);
}

/** Caminhos dos arquivos de um lançamento (para apagar depois de excluí-lo: os registros saem em cascata). */
export async function pathsForEntry(db: Db, entryId: string): Promise<string[]> {
  return (rowsOf(await untyped(db).from("entry_attachments").select("storage_path").eq("entry_id", entryId)) as { storage_path: string }[]).map((row) => row.storage_path);
}
