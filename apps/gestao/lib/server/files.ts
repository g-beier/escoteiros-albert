import {
  BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, SASProtocol, StorageSharedKeyCredential,
  type UserDelegationKey,
} from "@azure/storage-blob";
import { DataError, type Db } from "@/lib/server/db";
import { rpc } from "@/lib/server/pg/db";

// Arquivos (Azure Blob Storage, contêiner privado). O navegador envia e baixa direto do Blob por URLs SAS de curta
// duração, emitidas só depois de o banco aprovar o caminho para o usuário de `db` (can_write/read/delete_attachment_object).
// Configuração:
//   produção: AZURE_STORAGE_ACCOUNT_URL (https://<conta>.blob.core.windows.net) + identidade gerenciada do app
//             (papel "Storage Blob Data Contributor" na conta); as SAS são de delegação de usuário, sem chave guardada.
//             A identidade é atribuída pelo usuário: AZURE_CLIENT_ID diz qual usar (lido pelo DefaultAzureCredential).
//   local:    AZURE_STORAGE_CONNECTION_STRING do Azurite (gravada por `npm run infra:start`).

const UPLOAD_SECONDS = 10 * 60;

type Signer = { service: BlobServiceClient; sign: (container: string, path: string, permissions: string, seconds: number, disposition?: string) => Promise<string> };

let signer: Promise<Signer> | null = null;

async function createSigner(): Promise<Signer> {
  const connection = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connection) {
    const service = BlobServiceClient.fromConnectionString(connection);
    const credential = service.credential;
    if (!(credential instanceof StorageSharedKeyCredential)) throw new Error("AZURE_STORAGE_CONNECTION_STRING precisa da chave da conta.");
    return {
      service,
      sign: async (container, path, permissions, seconds, disposition) => {
        const query = generateBlobSASQueryParameters({
          containerName: container, blobName: path, permissions: BlobSASPermissions.parse(permissions),
          startsOn: new Date(Date.now() - 60_000), expiresOn: new Date(Date.now() + seconds * 1000), contentDisposition: disposition,
        }, credential).toString();
        return `${service.getContainerClient(container).getBlobClient(path).url}?${query}`;
      },
    };
  }
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
  if (!accountUrl) throw new DataError("Armazenamento de arquivos não configurado.");
  const { DefaultAzureCredential } = await import("@azure/identity");
  const service = new BlobServiceClient(accountUrl, new DefaultAzureCredential());
  const accountName = new URL(accountUrl).hostname.split(".")[0];
  let key: { value: UserDelegationKey; until: number } | null = null;
  return {
    service,
    sign: async (container, path, permissions, seconds, disposition) => {
      // chave de delegação válida por 1 h, renovada com folga
      if (!key || key.until - Date.now() < (seconds + 300) * 1000) {
        const until = Date.now() + 60 * 60_000;
        key = { value: await service.getUserDelegationKey(new Date(Date.now() - 60_000), new Date(until)), until };
      }
      const query = generateBlobSASQueryParameters({
        containerName: container, blobName: path, permissions: BlobSASPermissions.parse(permissions), protocol: SASProtocol.Https,
        startsOn: new Date(Date.now() - 60_000), expiresOn: new Date(Date.now() + seconds * 1000), contentDisposition: disposition,
      }, key.value, accountName).toString();
      return `${service.getContainerClient(container).getBlobClient(path).url}?${query}`;
    },
  };
}

function storage(): Promise<Signer> {
  signer ??= createSigner().catch((error) => {
    signer = null;
    throw error;
  });
  return signer;
}

async function allowed(db: Db, check: "can_write_attachment_object" | "can_read_attachment_object" | "can_delete_attachment_object", path: string) {
  if (!(await rpc(db, check, { p_name: path }))) throw new DataError("Arquivo não encontrado ou sem permissão.");
}

/** URL para o navegador enviar um arquivo novo em `path` (PUT com `x-ms-blob-type: BlockBlob`). */
export async function signedUploadUrl(db: Db, container: string, path: string): Promise<string> {
  await allowed(db, "can_write_attachment_object", path);
  try {
    return await (await storage()).sign(container, path, "cw", UPLOAD_SECONDS);
  } catch (error) {
    console.error("SAS de envio", (error as Error).message);
    throw new DataError("Não foi possível preparar o envio.");
  }
}

/** URL de leitura válida por `seconds`; com `downloadName`, o navegador baixa com esse nome. */
export async function signedDownloadUrl(db: Db, container: string, path: string, seconds: number, downloadName?: string): Promise<string> {
  await allowed(db, "can_read_attachment_object", path);
  const disposition = downloadName ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` : undefined;
  try {
    return await (await storage()).sign(container, path, "r", seconds, disposition);
  } catch (error) {
    console.error("SAS de leitura", (error as Error).message);
    throw new DataError("Não foi possível abrir o arquivo.");
  }
}

/** Tipo e tamanho do arquivo enviado, lidos no próprio Blob (não no navegador). */
export async function fileProperties(container: string, path: string): Promise<{ contentType: string; size: number }> {
  try {
    const properties = await (await storage()).service.getContainerClient(container).getBlobClient(path).getProperties();
    return { contentType: properties.contentType ?? "", size: properties.contentLength ?? 0 };
  } catch {
    throw new DataError("Arquivo não encontrado no armazenamento.");
  }
}

export async function removeFiles(db: Db, container: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  for (const path of paths) await allowed(db, "can_delete_attachment_object", path);
  const client = (await storage()).service.getContainerClient(container);
  await Promise.all(paths.map((path) => client.getBlobClient(path).deleteIfExists()));
}
