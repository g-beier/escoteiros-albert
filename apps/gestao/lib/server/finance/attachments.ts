import { randomUUID } from "node:crypto";
import { ATTACHMENT_BUCKET, ATTACHMENT_URL_TTL, attachmentPath, attachmentType, cleanFileName, type Attachment } from "@/lib/finance/attachments";
import { DataError, type Db } from "@/lib/server/db";
import { fileProperties, removeFiles, signedDownloadUrl, signedUploadUrl } from "@/lib/server/files";
import { one, rows, rpc } from "@/lib/server/pg/db";

// Comprovantes dos lançamentos (027): registro em entry_attachments pelas funções auditadas e arquivo no Blob.

export async function listForEntry(db: Db, entryId: string): Promise<Attachment[]> {
  return rows<Attachment>(db, (sql) => sql`
    select id, file_name, content_type, size_bytes, created_at from public.entry_attachments where entry_id = ${entryId} order by created_at, id`);
}

/**
 * 1º passo do envio (arquivo já validado): confere o lançamento e devolve onde e como o navegador envia.
 * A URL só sai se `can_write_attachment_object` aprovar (tesouraria/administração do grupo).
 */
export async function prepareUpload(db: Db, groupId: string, entryId: string, file: { name: string; type: string }) {
  const entry = await one<{ id: string }>(db, (sql) => sql`select id from public.ledger_entries where id = ${entryId} and group_id = ${groupId}`);
  if (!entry) throw new DataError("Lançamento não encontrado.");
  const contentType = attachmentType(file.name, file.type)!;
  const path = attachmentPath(groupId, entryId, randomUUID(), contentType);
  return { path, uploadUrl: await signedUploadUrl(db, ATTACHMENT_BUCKET, path), contentType };
}

/**
 * 2º passo: registra o arquivo enviado, com tipo e tamanho lidos no Blob. Se o registro falhar, apaga o arquivo
 * (só dentro da pasta do lançamento).
 */
export async function register(db: Db, groupId: string, entryId: string, path: string, fileName: string) {
  try {
    const { contentType, size } = await fileProperties(ATTACHMENT_BUCKET, path);
    await rpc(db, "add_entry_attachment", {
      p_entry_id: entryId, p_storage_path: path, p_file_name: cleanFileName(fileName), p_content_type: contentType, p_size_bytes: size,
    });
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
  const attachment = await one<{ storage_path: string; file_name: string }>(db, (sql) => sql`
    select storage_path, file_name from public.entry_attachments where id = ${attachmentId} and entry_id = ${entryId}`);
  if (!attachment) return null;
  return signedDownloadUrl(db, ATTACHMENT_BUCKET, attachment.storage_path, ATTACHMENT_URL_TTL, download ? attachment.file_name : undefined);
}

/** Caminhos dos arquivos de um lançamento (para apagar depois de excluí-lo: os registros saem em cascata). */
export async function pathsForEntry(db: Db, entryId: string): Promise<string[]> {
  return (await rows<{ storage_path: string }>(db, (sql) => sql`select storage_path from public.entry_attachments where entry_id = ${entryId}`))
    .map((row) => row.storage_path);
}
