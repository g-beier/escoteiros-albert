import { z } from "zod";

/**
 * Validação, no servidor, do que a tela de importação envia. As linhas chegam já
 * interpretadas pela biblioteca do navegador (`lib/statement-import/`); o banco
 * valida de novo e calcula a impressão digital.
 */

export const MAX_IMPORT_LINES = 10_000;

const cents = z.number().int("Use centavos inteiros.").safe();
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const statementLineSchema = z.object({
  date: z.iso.date({ message: "Data inválida." }),
  amountCents: cents.refine((value) => value !== 0, { message: "O valor não pode ser zero." }),
  description: z.string().trim().min(1, "Histórico obrigatório.").max(500),
  kind: optionalText(200),
  counterparty: optionalText(200),
  externalId: optionalText(200),
  balanceCents: cents.optional().nullable(),
  trnType: optionalText(20),
  checkNumber: optionalText(60),
  reference: optionalText(60),
  payee: optionalText(200),
});

export type StatementLineInput = z.infer<typeof statementLineSchema>;

const optionalDate = z.iso.date({ message: "Data inválida." }).optional().nullable();
const settingsSchema = z.record(z.string(), z.unknown());

export const importLinesSchema = z.object({
  accountId: z.uuid({ message: "Escolha a conta." }),
  profileId: z.uuid().optional().nullable(),
  profileSettings: settingsSchema.optional().nullable(),
  fileName: z.string().trim().min(1, "Arquivo sem nome.").max(255),
  periodFrom: optionalDate,
  periodTo: optionalDate,
  openingBalanceCents: cents.optional().nullable(),
  closingBalanceCents: cents.optional().nullable(),
  /** BANKID:ACCTID do OFX: liga o arquivo à conta na primeira importação e barra arquivo de outra conta. */
  ofxKey: z.string().trim().min(1).max(120).optional().nullable(),
  lines: z.array(z.unknown()).min(1, "Nenhuma linha para importar.").max(MAX_IMPORT_LINES, `Importe no máximo ${MAX_IMPORT_LINES.toLocaleString("pt-BR")} linhas por vez.`),
}).superRefine((value, ctx) => {
  if (value.periodFrom && value.periodTo && value.periodFrom > value.periodTo) {
    ctx.addIssue({ code: "custom", path: ["periodTo"], message: "O período termina antes de começar." });
  }
});

export type ImportLinesInput = z.infer<typeof importLinesSchema>;

/** Valida as linhas uma a uma, para a mensagem dizer qual linha (1-based) está errada. */
export function parseStatementLines(lines: unknown[]): { lines: StatementLineInput[] } | { error: string } {
  const parsed: StatementLineInput[] = [];
  for (const [index, line] of lines.entries()) {
    const result = statementLineSchema.safeParse(line);
    if (!result.success) return { error: `Linha ${index + 1}: ${result.error.issues[0]?.message ?? "dados inválidos."}` };
    parsed.push(result.data);
  }
  return { lines: parsed };
}

/** Formato aceito por `import_statement_lines` (camelCase, sem campos vazios). */
export function toRpcLines(lines: StatementLineInput[]) {
  return lines.map((line) => ({
    date: line.date,
    amountCents: line.amountCents,
    description: line.description,
    ...(line.kind ? { kind: line.kind } : {}),
    ...(line.counterparty ? { counterparty: line.counterparty } : {}),
    ...(line.externalId ? { externalId: line.externalId } : {}),
    ...(line.balanceCents !== undefined && line.balanceCents !== null ? { balanceCents: line.balanceCents } : {}),
    ...(line.trnType ? { trnType: line.trnType } : {}),
    ...(line.checkNumber ? { checkNumber: line.checkNumber } : {}),
    ...(line.reference ? { reference: line.reference } : {}),
    ...(line.payee ? { payee: line.payee } : {}),
  }));
}

export const importProfileSchema = z.object({
  id: z.uuid().optional().nullable(),
  name: z.string().trim().min(2, "Informe um nome de perfil com ao menos 2 caracteres.").max(80),
  format: z.enum(["csv", "ofx"], { message: "Formato de arquivo inválido." }),
  headerSignature: z.string().trim().max(2000).optional().nullable(),
  settings: settingsSchema,
});

export type ImportProfileInput = z.infer<typeof importProfileSchema>;

export type ImportResult = { importId: string; inserted: number; skippedDuplicates: number };

/** Converte o jsonb devolvido por `import_statement_lines`. */
export function fromRpcImportResult(data: unknown): ImportResult | null {
  const parsed = z.object({ import_id: z.uuid(), inserted: z.number().int(), skipped_duplicates: z.number().int() }).safeParse(data);
  return parsed.success ? { importId: parsed.data.import_id, inserted: parsed.data.inserted, skippedDuplicates: parsed.data.skipped_duplicates } : null;
}

/** Resumo para o toast: "12 linhas importadas, 3 já existiam." */
export function importSummary({ inserted, skippedDuplicates }: Pick<ImportResult, "inserted" | "skippedDuplicates">) {
  const lines = (n: number) => `${n} ${n === 1 ? "linha" : "linhas"}`;
  const head = inserted === 0 ? "Nenhuma linha nova" : `${lines(inserted)} ${inserted === 1 ? "importada" : "importadas"}`;
  if (!skippedDuplicates) return `${head}.`;
  return `${head}, ${skippedDuplicates} ${skippedDuplicates === 1 ? "já existia" : "já existiam"}.`;
}
