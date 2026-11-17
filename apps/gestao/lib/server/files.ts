import { DataError, type Db } from "@/lib/server/db";
import { untyped } from "@/lib/server/supabase/db";

// Arquivos (hoje Supabase Storage, bucket privado). O navegador envia e baixa direto do storage por URLs
// assinadas e de curta duração; as políticas do bucket conferem o grupo do usuário de `db`. Trocar de storage
// (docs/migracao-saida-supabase.md, 4.4) é reimplementar este arquivo.

/** URL para o navegador enviar um arquivo novo em `path`. */
export async function signedUploadUrl(db: Db, bucket: string, path: string): Promise<string> {
  const { data, error } = await untyped(db).storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new DataError("Não foi possível preparar o envio.");
  return data.signedUrl;
}

/** URL de leitura válida por `seconds`; com `downloadName`, o navegador baixa com esse nome. */
export async function signedDownloadUrl(db: Db, bucket: string, path: string, seconds: number, downloadName?: string): Promise<string> {
  const { data, error } = await untyped(db).storage.from(bucket).createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new DataError("Não foi possível abrir o arquivo.");
  return data.signedUrl;
}

export async function removeFiles(db: Db, bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await untyped(db).storage.from(bucket).remove(paths);
  if (error) throw new DataError(error.message);
}
