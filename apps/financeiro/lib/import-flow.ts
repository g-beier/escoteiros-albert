import { z } from "zod";
import { normalizeText, type OfxProfileSettings, type ParsedStatement, type StatementLine } from "@/lib/statement-import";
import type { StatementLineInput } from "@/lib/import-schema";

/**
 * Regras da tela de importação de extrato OFX (`/importacao`) que não dependem do React:
 * perfil de leitura, conferência e linhas enviadas ao servidor.
 */

/** OFX pelo conteúdo, não pela extensão: cabeçalho OFXHEADER, XML com <?OFX ou a tag <OFX>. */
export function isOfx(text: string): boolean {
  const head = text.slice(0, 4000);
  return /^\s*OFXHEADER/i.test(head) || /<\?OFX/i.test(head) || /<OFX>/i.test(text);
}

/** Pseudo-linhas de saldo comuns (Itaú e outros) já vêm na lista de linhas a ignorar de um perfil novo. */
export const DEFAULT_IGNORE = ["SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL DIA"];

/** OFX sem perfil: separa o MEMO em "Tipo - Nome - …" quando a maioria das linhas tem esse formato (Nubank). */
export function newOfxSettings(descriptions: string[]): OfxProfileSettings {
  const withSeparator = descriptions.filter((description) => description.includes(" - ")).length;
  return { memoSplit: descriptions.length > 0 && withSeparator >= descriptions.length / 2, kindPrefixes: [], ignoreIf: [...DEFAULT_IGNORE] };
}

// Perfis salvos -------------------------------------------------------------------

const textList = z.array(z.string()).catch([]);

const ofxSettingsSchema = z.object({
  memoSplit: z.boolean().catch(false),
  kindPrefixes: textList,
  ignoreIf: textList,
});

export function ofxSettingsFromProfile(settings: unknown): OfxProfileSettings {
  const parsed = ofxSettingsSchema.safeParse(settings ?? {});
  return parsed.success ? parsed.data : { memoSplit: false, kindPrefixes: [], ignoreIf: [] };
}

type ProfileLike = { id: string; format: string; header_signature: string | null };

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
  const ofx = profiles.filter((profile) => profile.format === "ofx");
  return (lastProfileId ? ofx.find((profile) => profile.id === lastProfileId) : undefined)
    ?? ofx.find((profile) => profile.header_signature !== null && profile.header_signature === signature);
}

// Lista de perfis (Configurações) ------------------------------------------------------

export type ProfileImport = { profile_id: string | null; account_id: string; imported_at: string };
export type ProfileAccountUse = { accountId: string; accountName: string; imports: number; current: boolean };

/**
 * Contas em que cada perfil foi usado, com o número de importações e se é o perfil atual da conta
 * (o da última importação, que a próxima importação aplica sozinho). Contas em ordem de nome.
 */
export function profileAccountUses(imports: ProfileImport[], accounts: { id: string; name: string }[]): Record<string, ProfileAccountUse[]> {
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const latest = new Map<string, ProfileImport>();
  const counts = new Map<string, Map<string, number>>();
  for (const item of imports) {
    if (!item.profile_id) continue;
    const last = latest.get(item.account_id);
    if (!last || item.imported_at > last.imported_at) latest.set(item.account_id, item);
    const byAccount = counts.get(item.profile_id) ?? new Map<string, number>();
    byAccount.set(item.account_id, (byAccount.get(item.account_id) ?? 0) + 1);
    counts.set(item.profile_id, byAccount);
  }
  const result: Record<string, ProfileAccountUse[]> = {};
  for (const [profileId, byAccount] of counts) {
    result[profileId] = [...byAccount].map(([accountId, total]) => ({
      accountId, accountName: names.get(accountId) ?? "Conta removida", imports: total, current: latest.get(accountId)?.profile_id === profileId,
    })).sort((a, b) => a.accountName.localeCompare(b.accountName, "pt-BR"));
  }
  return result;
}

/** Resumo dos ajustes de leitura de um perfil OFX, para a lista. */
export function profileSettingsSummary(settings: unknown): string {
  const parsed = ofxSettingsFromProfile(settings);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    parsed.memoSplit ? "separa o MEMO" : "",
    parsed.kindPrefixes?.length ? plural(parsed.kindPrefixes.length, "prefixo de tipo", "prefixos de tipo") : "",
    parsed.ignoreIf?.length ? plural(parsed.ignoreIf.length, "texto a ignorar", "textos a ignorar") : "",
  ].filter(Boolean).join(" · ") || "Sem ajustes";
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

// Saldo inicial do arquivo × saldo da conta no sistema ---------------------------------

/**
 * Saldo inicial do arquivo OFX: a pseudo-linha "SALDO ANTERIOR" ignorada, quando existe; senão,
 * o saldo final (LEDGERBAL) menos os movimentos do arquivo. Null quando o arquivo não traz saldo.
 */
export function fileOpeningBalance(statement: ParsedStatement): { cents: number; source: "saldo-anterior" | "saldo-final" } | null {
  if (statement.openingBalanceCents !== undefined) return { cents: statement.openingBalanceCents, source: "saldo-anterior" };
  if (statement.closingBalanceCents !== undefined) return { cents: statement.closingBalanceCents - statement.totals.netCents, source: "saldo-final" };
  return null;
}

/** Diferença arquivo − sistema, em centavos; null quando um dos lados não tem saldo. */
export function openingDifference(fileCents: number | null | undefined, systemCents: number | null | undefined) {
  return fileCents === null || fileCents === undefined || systemCents === null || systemCents === undefined ? null : fileCents - systemCents;
}

/** Tela de conciliação filtrada pela conta e pelo período importado. */
export function reconciliationHref(accountId: string, from?: string, to?: string) {
  const params = new URLSearchParams({ conta: accountId });
  if (from) params.set("de", from);
  if (to) params.set("ate", to);
  return `/conciliacao?${params.toString()}`;
}
