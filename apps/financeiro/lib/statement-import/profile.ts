import { normalizeText } from "./text";
import type {
  KindPrefixSuggestion,
  OfxAccount,
  ParsedStatement,
  StatementLine,
  StatementTotals,
} from "./types";

/**
 * Stable key to find the saved profile for a file: normalized header cells joined by "|",
 * or `ofx:<org or bankId>` for an OFX account.
 */
export function headerSignature(input: string[] | OfxAccount): string {
  if (Array.isArray(input)) return input.map(normalizeText).join("|");
  return `ofx:${normalizeText(input.org || input.bankId || "")}`;
}

const SEPARATOR_TOKEN = /^[-–—:|/]+$/;

function isWordBoundary(text: string, index: number) {
  return index >= text.length || !/[0-9a-z]/i.test(text[index]);
}

/** Strip separators like " - " or ": " left between a kind prefix and the counterparty. */
function cleanCounterparty(rest: string) {
  return rest.replace(/^[\s\-–—:|/]+/, "").replace(/[\s\-–—:|/]+$/, "").trim();
}

/**
 * Split a description by the longest matching kind prefix (case/accent-insensitive, whole words).
 * Returns null when no prefix matches.
 */
export function splitKind(description: string, kindPrefixes: string[] = []) {
  // Strip accents but remember where each kept character sits in the NFD original.
  const original = description.normalize("NFD");
  const positions: number[] = [];
  let lower = "";
  for (let i = 0; i < original.length; i += 1) {
    if (/[\u0300-\u036f]/.test(original[i])) continue;
    positions.push(i);
    lower += original[i].toLowerCase();
  }
  let best: { kind: string; length: number } | null = null;
  for (const prefix of kindPrefixes) {
    const key = prefix.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!key) continue;
    // Allow any run of whitespace in the description where the prefix has a single space.
    const pattern = new RegExp(`^\\s*${key.split(/\s+/).map(escapeRegExp).join("\\s+")}`);
    const match = pattern.exec(lower);
    if (!match || !isWordBoundary(lower, match[0].length)) continue;
    if (!best || match[0].length > best.length) best = { kind: prefix.trim(), length: match[0].length };
  }
  if (!best) return null;
  const cut = best.length < positions.length ? positions[best.length] : original.length;
  const counterparty = cleanCounterparty(original.slice(cut).normalize("NFC"));
  return { kind: best.kind, counterparty: counterparty || undefined };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First `ignoreIf` entry contained in the text (case/accent-insensitive), or null. */
export function matchIgnore(text: string, ignoreIf: string[] = []) {
  const haystack = normalizeText(text);
  return ignoreIf.find((needle) => normalizeText(needle) !== "" && haystack.includes(normalizeText(needle))) ?? null;
}

type TrieNode = { count: number; children: Map<string, TrieNode>; forms: Map<string, number> };

const newNode = (): TrieNode => ({ count: 0, children: new Map(), forms: new Map() });

/**
 * Suggest kind prefixes from description values: leading word sequences shared by several rows,
 * descending while the rows split into a few frequent branches ("Pix" → "Pix recebido" / "Pix enviado")
 * and stopping where the following words vary (names) or at a " - " separator.
 */
export function suggestKindPrefixes(
  values: string[],
  options: { minCount?: number; maxWords?: number; maxBranches?: number } = {},
): KindPrefixSuggestion[] {
  const minCount = options.minCount ?? 2;
  const maxWords = options.maxWords ?? 4;
  const maxBranches = options.maxBranches ?? 4;
  const root = newNode();
  for (const value of values) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    let node = root;
    const taken: string[] = [];
    for (const word of words.slice(0, maxWords)) {
      if (SEPARATOR_TOKEN.test(word)) break;
      const key = normalizeText(word);
      let child = node.children.get(key);
      if (!child) node.children.set(key, (child = newNode()));
      taken.push(word);
      child.count += 1;
      const form = taken.join(" ");
      child.forms.set(form, (child.forms.get(form) ?? 0) + 1);
      node = child;
    }
  }

  const suggestions: KindPrefixSuggestion[] = [];
  const visit = (node: TrieNode, depth: number) => {
    const children = [...node.children.values()];
    const strong = children.filter((child) => child.count >= minCount);
    const strongTotal = strong.reduce((sum, child) => sum + child.count, 0);
    const descend =
      depth < maxWords && strong.length > 0 && children.length <= maxBranches && strongTotal >= node.count * 0.8;
    if (descend) {
      strong.forEach((child) => visit(child, depth + 1));
      return;
    }
    const form = [...node.forms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (form) suggestions.push({ prefix: form, count: node.count });
  };
  for (const child of root.children.values()) if (child.count >= minCount) visit(child, 1);
  return suggestions.sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
}

export function computeTotals(lines: StatementLine[]): StatementTotals {
  let creditsCents = 0;
  let debitsCents = 0;
  for (const line of lines) {
    if (line.amountCents >= 0) creditsCents += line.amountCents;
    else debitsCents += line.amountCents;
  }
  return { creditsCents, debitsCents, netCents: creditsCents + debitsCents };
}

export function computePeriod(lines: StatementLine[]) {
  if (lines.length === 0) return {};
  const dates = lines.map((line) => line.date).sort();
  return { periodFrom: dates[0], periodTo: dates[dates.length - 1] };
}

/**
 * Check that each line's balance equals the previous balance plus its amount.
 * Tries file order first, then reverse (statements listed newest first).
 */
export function checkBalanceChain(lines: StatementLine[]) {
  const withBalance = lines.filter((line) => line.balanceCents !== undefined);
  if (withBalance.length === 0) return null;
  const firstMismatch = (ordered: StatementLine[]) => {
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i - 1].balanceCents! + ordered[i].amountCents !== ordered[i].balanceCents) return ordered[i];
    }
    return null;
  };
  const forward = firstMismatch(withBalance);
  const reversed = [...withBalance].reverse();
  const ordered = forward && !firstMismatch(reversed) ? reversed : withBalance;
  const mismatch = ordered === reversed ? null : forward;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    ok: mismatch === null,
    firstMismatchRow: mismatch?.sourceRow,
    openingBalanceCents: first.balanceCents! - first.amountCents,
    closingBalanceCents: last.balanceCents!,
  };
}

/** Recompute totals after lines change. */
export function withTotals<T extends ParsedStatement>(statement: T): T {
  return { ...statement, totals: computeTotals(statement.lines) };
}
