import { z } from "zod";
import {
  DATE_FORMATS, normalizeText, parseDate, readCsv, sniffCsv,
  type DateFormat, type Encoding, type OfxProfileSettings, type ParsedStatement, type ProfileColumns,
  type ProfileSettings, type StatementLine,
} from "@/lib/statement-import";
import type { StatementLineInput } from "@/lib/import-schema";

/**
 * Regras da tela de importação (`/importacao`) que não dependem do React:
 * papéis das colunas, perfis salvos, conferência e linhas enviadas ao servidor.
 */

export type ImportFormat = "csv" | "ofx";

/** OFX pelo conteúdo, não pela extensão: cabeçalho OFXHEADER, XML com <?OFX ou a tag <OFX>. */
export function detectFormat(text: string): ImportFormat {
  const head = text.slice(0, 4000);
  return /^\s*OFXHEADER/i.test(head) || /<\?OFX/i.test(head) || /<OFX>/i.test(text) ? "ofx" : "csv";
}

// Papéis das colunas -----------------------------------------------------------------

export type ColumnRole = "ignore" | "date" | "amount" | "credit" | "debit" | "nature" | "description" | "counterparty" | "externalId" | "balance";

export const COLUMN_ROLES: { value: ColumnRole; label: string }[] = [
  { value: "ignore", label: "Ignorar" },
  { value: "date", label: "Data" },
  { value: "amount", label: "Valor" },
  { value: "credit", label: "Crédito" },
  { value: "debit", label: "Débito" },
  { value: "nature", label: "Natureza C/D" },
  { value: "description", label: "Descrição" },
  { value: "counterparty", label: "Contraparte" },
  { value: "externalId", label: "ID do banco" },
  { value: "balance", label: "Saldo" },
];

type SingleRole = Exclude<ColumnRole, "ignore" | "description">;
const SINGLE_ROLES: SingleRole[] = ["date", "amount", "credit", "debit", "nature", "counterparty", "externalId", "balance"];

const sameColumn = (a: string | undefined, b: string) => a !== undefined && normalizeText(a) === normalizeText(b);

/** Papel da coluna `name` nas configurações. */
export function roleOf(columns: ProfileColumns, name: string): ColumnRole {
  for (const role of SINGLE_ROLES) if (sameColumn(columns[role], name)) return role;
  if (columns.description.some((column) => sameColumn(column, name))) return "description";
  return "ignore";
}

/**
 * Atribui um papel à coluna `header[index]`. Papéis únicos passam da coluna anterior para esta;
 * Valor e Crédito/Débito se excluem; Descrição acumula colunas na ordem do arquivo.
 */
export function setColumnRole(columns: ProfileColumns, header: string[], index: number, role: ColumnRole): ProfileColumns {
  const name = header[index];
  const next: ProfileColumns = { ...columns, description: columns.description.filter((column) => !sameColumn(column, name)) };
  for (const single of SINGLE_ROLES) if (sameColumn(next[single], name)) delete next[single];
  if (role === "description") {
    const chosen = new Set([...next.description, name].map(normalizeText));
    next.description = header.filter((column) => chosen.has(normalizeText(column)));
  } else if (role !== "ignore") {
    next[role] = name;
    if (role === "amount") { delete next.credit; delete next.debit; }
    if (role === "credit" || role === "debit") delete next.amount;
  }
  if (!next.nature) delete next.debitValues;
  else if (!sameColumn(columns.nature, next.nature)) next.debitValues = [];
  return next;
}

/** Remove das configurações as colunas que não existem no cabeçalho atual (ex.: depois de trocar a linha do cabeçalho). */
export function pruneColumns(columns: ProfileColumns, header: string[]): ProfileColumns {
  const exists = (name: string | undefined) => name !== undefined && header.some((column) => sameColumn(name, column));
  const next: ProfileColumns = { date: exists(columns.date) ? columns.date : "", description: columns.description.filter(exists) };
  for (const role of SINGLE_ROLES) if (role !== "date" && exists(columns[role])) next[role] = columns[role];
  if (next.nature) next.debitValues = columns.debitValues ?? [];
  return next;
}

/** Papéis obrigatórios que faltam, em português, para avisar e bloquear a importação. */
export function missingRoles(columns: ProfileColumns): string[] {
  const missing: string[] = [];
  if (!columns.date) missing.push("Data");
  if (!columns.amount && !columns.credit && !columns.debit) missing.push("Valor (ou Crédito/Débito)");
  if (columns.description.length === 0) missing.push("Descrição");
  if (columns.nature && !(columns.debitValues ?? []).length) missing.push("Natureza C/D: marque quais valores indicam saída");
  return missing;
}

/** Valores distintos de uma coluna, para escolher quais indicam saída na Natureza C/D. */
export function distinctValues(header: string[], rows: string[][], name: string | undefined, limit = 20) {
  const index = name ? header.findIndex((column) => sameColumn(name, column)) : -1;
  if (index < 0) return [];
  const seen = new Map<string, string>();
  for (const row of rows) {
    const value = (row[index] ?? "").trim();
    if (value && !seen.has(normalizeText(value))) seen.set(normalizeText(value), value);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** Valores de descrição das linhas, para sugerir prefixos de tipo. */
export function descriptionValues(header: string[], rows: string[][], columns: ProfileColumns) {
  const indexes = columns.description.map((name) => header.findIndex((column) => sameColumn(name, column))).filter((i) => i >= 0);
  if (indexes.length === 0) return [];
  return rows.map((row) => indexes.map((i) => row[i] ?? "").join(" ").trim()).filter(Boolean);
}

const HEADER_HINTS: { role: SingleRole | "description"; pattern: RegExp }[] = [
  { role: "balance", pattern: /saldo|balance/ },
  { role: "amount", pattern: /^valor|amount|^value|^montante/ },
  { role: "credit", pattern: /^credito|^entrada/ },
  { role: "debit", pattern: /^debito|^saida/ },
  { role: "nature", pattern: /^tipo (de )?transacao|^natureza|^d\/c$|^c\/d$/ },
  { role: "externalId", pattern: /reference|^id$|^fitid|^identificador/ },
  { role: "counterparty", pattern: /identificacao|favorecido|contraparte|pagador|beneficiario|^nome/ },
  { role: "description", pattern: /historico|descri|lancamento|transac|memo|^detalhe/ },
];

const looksLikeDebit = (value: string) => /^(d|deb|debito|saida|out)$/.test(normalizeText(value).replace(/[^a-z]/g, ""));

/**
 * Primeira sugestão de papéis para um arquivo sem perfil: a data é a primeira coluna cujas
 * amostras são datas; os demais papéis vêm do nome da coluna. Tudo continua editável.
 */
export function guessColumns(header: string[], rows: string[][], dateFormat: DateFormat): ProfileColumns {
  const sample = rows.slice(0, 20);
  const columns: ProfileColumns = { date: "", description: [] };
  const dateIndex = header.findIndex((_, i) => {
    const values = sample.map((row) => (row[i] ?? "").trim()).filter(Boolean);
    return values.length > 0 && values.filter((value) => parseDate(value, dateFormat)).length >= values.length * 0.8;
  });
  if (dateIndex >= 0) columns.date = header[dateIndex];
  header.forEach((name, i) => {
    if (i === dateIndex || !name) return;
    const key = normalizeText(name).replace(/_/g, " ");
    const hint = HEADER_HINTS.find(({ pattern }) => pattern.test(key));
    if (!hint) return;
    if (hint.role === "description") columns.description.push(name);
    else if (!columns[hint.role]) columns[hint.role] = name;
  });
  if (columns.amount) { delete columns.credit; delete columns.debit; }
  if (columns.nature) {
    const debitValues = distinctValues(header, sample, columns.nature).filter(looksLikeDebit);
    if (debitValues.length > 0) columns.debitValues = debitValues;
    else delete columns.nature;
  }
  return columns;
}

/** Pseudo-linhas de saldo comuns (Itaú e outros) já vêm na lista de linhas a ignorar de um perfil novo. */
export const DEFAULT_IGNORE = ["SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL DIA"];

/** Configurações iniciais de um perfil CSV novo, a partir das sugestões de `sniffCsv`. */
export function newCsvSettings(text: string, encoding: Encoding): ProfileSettings {
  const sniff = sniffCsv(text);
  const base: ProfileSettings = { encoding, ...sniff, columns: { date: "", description: [] }, kindPrefixes: [], ignoreIf: [...DEFAULT_IGNORE] };
  const table = readCsv(text, base);
  return { ...base, columns: guessColumns(table.header, table.rows, sniff.dateFormat) };
}

/** OFX sem perfil: separa o MEMO em "Tipo - Nome - …" quando a maioria das linhas tem esse formato (Nubank). */
export function newOfxSettings(descriptions: string[]): OfxProfileSettings {
  const withSeparator = descriptions.filter((description) => description.includes(" - ")).length;
  return { memoSplit: descriptions.length > 0 && withSeparator >= descriptions.length / 2, kindPrefixes: [], ignoreIf: [...DEFAULT_IGNORE] };
}

// Perfis salvos -------------------------------------------------------------------

const textList = z.array(z.string()).catch([]);

const csvSettingsSchema = z.object({
  encoding: z.enum(["utf-8", "latin1"]).catch("utf-8"),
  delimiter: z.string().min(1).max(3),
  headerRow: z.number().int().min(1),
  dateFormat: z.enum(DATE_FORMATS as [DateFormat, ...DateFormat[]]),
  decimal: z.enum(["comma", "dot"]),
  columns: z.object({
    date: z.string().catch(""),
    amount: z.string().optional(),
    credit: z.string().optional(),
    debit: z.string().optional(),
    nature: z.string().optional(),
    debitValues: z.array(z.string()).optional(),
    description: textList,
    counterparty: z.string().optional(),
    externalId: z.string().optional(),
    balance: z.string().optional(),
  }),
  kindPrefixes: textList,
  ignoreIf: textList,
});

const ofxSettingsSchema = z.object({
  memoSplit: z.boolean().catch(false),
  kindPrefixes: textList,
  ignoreIf: textList,
});

/** Lê o jsonb `settings` de um perfil CSV salvo; null se estiver em formato desconhecido. */
export function csvSettingsFromProfile(settings: unknown): ProfileSettings | null {
  const parsed = csvSettingsSchema.safeParse(settings);
  return parsed.success ? (parsed.data as ProfileSettings) : null;
}

export function ofxSettingsFromProfile(settings: unknown): OfxProfileSettings {
  const parsed = ofxSettingsSchema.safeParse(settings ?? {});
  return parsed.success ? parsed.data : { memoSplit: false, kindPrefixes: [], ignoreIf: [] };
}

type ProfileLike = { id: string; format: ImportFormat; header_signature: string | null };

/**
 * Perfil salvo que reconhece o arquivo. `signatureFor` calcula a assinatura do arquivo
 * lido com as configurações de cada perfil (a linha do cabeçalho e o separador podem diferir).
 */
export function findMatchingProfile<T extends ProfileLike>(profiles: T[], format: ImportFormat, signatureFor: (profile: T) => string | null): T | undefined {
  return profiles.find((profile) => profile.format === format && profile.header_signature !== null && profile.header_signature === signatureFor(profile));
}

/** Compara configurações ignorando a ordem das chaves e listas vazias/ausentes. */
export function sameSettings(a: unknown, b: unknown) {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0) && v !== false)
      .sort(([x], [y]) => x.localeCompare(y));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Lista editável (uma por linha) → textos sem vazios nem repetidos. */
export function parseTextList(text: string) {
  const seen = new Set<string>();
  return text.split(/\r?\n/).map((item) => item.trim()).filter((item) => {
    const key = normalizeText(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Perfil de leitura da conta ------------------------------------------------------

/**
 * Perfil para ler o OFX da conta escolhida: o da última importação da conta; senão, o que
 * reconhece o arquivo pela assinatura; senão, nenhum (sugestões). Os OFX convertidos de bancos
 * diferentes podem ter a mesma assinatura, por isso a conta vem primeiro.
 */
export function profileForAccount<T extends ProfileLike>(profiles: T[], lastProfileId: string | null | undefined, signature: string): T | undefined {
  const last = lastProfileId ? profiles.find((profile) => profile.id === lastProfileId && profile.format === "ofx") : undefined;
  return last ?? findMatchingProfile(profiles, "ofx", () => signature);
}

// Conferência e envio ---------------------------------------------------------------

/** O banco recusa valor zero: essas linhas saem da importação e aparecem como ignoradas. */
export function dropZeroLines<T extends ParsedStatement>(statement: T): T {
  const zero = statement.lines.filter((line) => line.amountCents === 0);
  if (zero.length === 0) return statement;
  const ignored = [...statement.ignored, ...zero.map((line) => ({ sourceRow: line.sourceRow, reason: "Valor zero" }))]
    .sort((a, b) => a.sourceRow - b.sourceRow);
  return { ...statement, lines: statement.lines.filter((line) => line.amountCents !== 0), ignored };
}

const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : undefined);

/** Linhas no formato de `importStatementLines`: histórico nunca vazio e textos nos limites do banco. */
export function toImportLines(lines: StatementLine[]): StatementLineInput[] {
  return lines.map((line) => ({
    date: line.date,
    amountCents: line.amountCents,
    description: clip(line.description || line.counterparty || line.kind || "Sem histórico", 500)!,
    kind: clip(line.kind, 200),
    counterparty: clip(line.counterparty, 200),
    externalId: clip(line.externalId, 200),
    balanceCents: line.balanceCents,
    trnType: clip(line.trnType, 20),
    checkNumber: clip(line.checkNumber, 60),
    reference: clip(line.reference, 60),
    payee: clip(line.payee, 200),
  }));
}

/** Tela de conciliação filtrada pela conta e pelo período importado. */
export function reconciliationHref(accountId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ conta: accountId });
  if (from) params.set("de", from);
  if (to) params.set("ate", to);
  return `/conciliacao?${params.toString()}`;
}
