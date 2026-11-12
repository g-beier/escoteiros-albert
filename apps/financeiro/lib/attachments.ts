/**
 * Anexos de comprovantes: regras compartilhadas entre o navegador (validação antes do envio),
 * as Server Actions e a migration 027 (bucket `comprovantes`, tipos e limite iguais aos daqui).
 */

export const ATTACHMENT_BUCKET = "comprovantes";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Validade das URLs assinadas para abrir/baixar (segundos). */
export const ATTACHMENT_URL_TTL = 60;

/** Tipo MIME aceito → extensão usada no caminho do bucket. */
const TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
} as const;

export type AttachmentType = keyof typeof TYPES;

const BY_EXTENSION: Record<string, AttachmentType> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif",
};

/** Para o `accept` do campo de arquivo (extensões ajudam quando o sistema não conhece HEIC). */
export const ATTACHMENT_ACCEPT = [...Object.keys(TYPES), ".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"].join(",");

export type Attachment = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

export const ATTACHMENT_COLUMNS = "id, file_name, content_type, size_bytes, created_at";

/**
 * Tipo do arquivo pelo MIME informado pelo navegador ou, se vazio/genérico (comum com HEIC),
 * pela extensão do nome. `null` quando não é aceito.
 */
export function attachmentType(fileName: string, mime: string): AttachmentType | null {
  const normalized = mime.trim().toLowerCase();
  if (normalized in TYPES) return normalized as AttachmentType;
  if (normalized && normalized !== "application/octet-stream") return null;
  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (extension && BY_EXTENSION[extension]) || null;
}

/** Mensagem de erro para o usuário, ou `null` se o arquivo pode ser enviado. */
export function attachmentProblem(file: { name: string; type: string; size: number }): string | null {
  if (!attachmentType(file.name, file.type)) return `“${file.name}” não é PDF, JPG, PNG nem HEIC.`;
  if (file.size <= 0) return `“${file.name}” está vazio.`;
  if (file.size > ATTACHMENT_MAX_BYTES) return `“${file.name}” tem ${fileSize(file.size)}; o limite é ${fileSize(ATTACHMENT_MAX_BYTES)}.`;
  return null;
}

/** Caminho no bucket: <grupo>/<lançamento>/<uuid>.<ext> (as políticas do Storage dependem deste formato). */
export function attachmentPath(groupId: string, entryId: string, fileId: string, type: AttachmentType) {
  return `${groupId}/${entryId}/${fileId}.${TYPES[type]}`;
}

/** Nome mostrado e usado no download: sem diretórios nem caracteres de controle, até 200 caracteres. */
export function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return base.slice(0, 200) || "comprovante";
}

const sizeFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}
