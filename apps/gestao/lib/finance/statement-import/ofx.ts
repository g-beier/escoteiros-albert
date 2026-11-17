import { computePeriod, computeTotals, headerSignature, isPreviousBalance, matchIgnore, splitKind } from "./profile";
import { collapseSpaces } from "./text";
import type {
  IgnoredRow,
  OfxAccount,
  OfxProfileSettings,
  OfxStatement,
  StatementIssue,
  StatementLine,
} from "./types";
import { isoDate, parseAmount } from "./values";

function decodeEntities(value: string) {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

/** Value of the first `<TAG>` in the block; works with and without closing tags (SGML or XML OFX). */
function tag(block: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  if (!match) return undefined;
  const value = collapseSpaces(decodeEntities(match[1]));
  return value === "" ? undefined : value;
}

/** First aggregate `<NAME>...` up to its closing tag, or to the next sibling/parent close when SGML omits it. */
function aggregate(text: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([\\s\\S]*?)(?:</${name}>|$)`, "i").exec(text);
  return match?.[1];
}

/** OFX dates: YYYYMMDD[hhmmss[.xxx]][[-3:BRT]]. Only the calendar date is kept. */
export function parseOfxDate(raw: string | undefined): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(raw?.trim() ?? "");
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

/** OFX amounts use a dot, but some banks write a comma decimal. */
function parseOfxAmount(raw: string | undefined) {
  if (!raw) return null;
  const value = raw.trim();
  const decimal = /,\d{1,2}$/.test(value) && !/\.\d{1,2}$/.test(value) ? "comma" : "dot";
  return parseAmount(value, decimal);
}

function countNewlines(text: string, from: number, to: number) {
  let count = 0;
  for (let i = from; i < to; i += 1) if (text.charCodeAt(i) === 10) count += 1;
  return count;
}

/**
 * Parse an OFX 1.x (SGML, closing tags optional) or 2.x (XML) bank statement.
 * The header's ENCODING/CHARSET are ignored: decode the bytes with `decodeBytes` first.
 * `sourceRow` is the file line of each `<STMTTRN>`.
 */
export function readOfx(text: string): OfxStatement {
  const errors: StatementIssue[] = [];
  const lines: StatementLine[] = [];
  const start = text.search(/<OFX>/i);
  if (start < 0) {
    errors.push({ sourceRow: 1, message: "Arquivo OFX sem a tag <OFX>." });
    return { lines, errors, ignored: [], totals: computeTotals(lines), account: {}, signature: "ofx:" };
  }
  const body = text.slice(start);

  const account: OfxAccount = {};
  const fi = aggregate(body, "FI");
  const org = fi ? tag(fi, "ORG") : undefined;
  if (org) account.org = org;
  const acctFrom = aggregate(body, "BANKACCTFROM") ?? aggregate(body, "CCACCTFROM") ?? "";
  const bankId = tag(acctFrom, "BANKID");
  const branchId = tag(acctFrom, "BRANCHID");
  const acctId = tag(acctFrom, "ACCTID");
  const currency = tag(body, "CURDEF");
  if (bankId) account.bankId = bankId;
  if (branchId) account.branchId = branchId;
  if (acctId) account.acctId = acctId;
  if (currency) account.currency = currency;

  const transactionStart = /<STMTTRN>/gi;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let lastLine = 1 + countNewlines(text, 0, start);
  while ((match = transactionStart.exec(body))) {
    const rest = body.slice(match.index + match[0].length);
    const end = rest.search(/<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>/i);
    const block = end < 0 ? rest : rest.slice(0, end);
    lastLine += countNewlines(body, lastIndex, match.index);
    lastIndex = match.index;
    const sourceRow = lastLine;

    const problems: string[] = [];
    const date = parseOfxDate(tag(block, "DTPOSTED"));
    if (!date) problems.push(`DTPOSTED inválido "${tag(block, "DTPOSTED") ?? ""}"`);
    const amountCents = parseOfxAmount(tag(block, "TRNAMT"));
    if (amountCents === null) problems.push(`TRNAMT inválido "${tag(block, "TRNAMT") ?? ""}"`);
    if (problems.length > 0 || !date || amountCents === null) {
      errors.push({ sourceRow, message: problems.join("; ") + "." });
      continue;
    }
    const memo = tag(block, "MEMO");
    const name = tag(block, "NAME");
    const line: StatementLine = { date, amountCents, description: memo ?? name ?? "", sourceRow };
    if (memo && name && memo !== name) line.counterparty = name;
    const fitId = tag(block, "FITID");
    if (fitId) line.externalId = fitId;
    const trnType = tag(block, "TRNTYPE");
    if (trnType) line.trnType = trnType.toUpperCase();
    const checkNumber = tag(block, "CHECKNUM");
    if (checkNumber) line.checkNumber = checkNumber;
    const reference = tag(block, "REFNUM");
    if (reference) line.reference = reference;
    if (name) line.payee = name;
    lines.push(line);
  }

  const result: OfxStatement = {
    lines,
    errors,
    ignored: [],
    totals: computeTotals(lines),
    account,
    signature: headerSignature(account),
    ...computePeriod(lines),
  };
  const transactionList = aggregate(body, "BANKTRANLIST") ?? body;
  const periodFrom = parseOfxDate(tag(transactionList, "DTSTART"));
  const periodTo = parseOfxDate(tag(transactionList, "DTEND"));
  if (periodFrom) result.periodFrom = periodFrom;
  if (periodTo) result.periodTo = periodTo;
  const ledger = aggregate(body, "LEDGERBAL");
  const closing = ledger ? parseOfxAmount(tag(ledger, "BALAMT")) : null;
  if (closing !== null) result.closingBalanceCents = closing;
  return result;
}

const MEMO_SEPARATOR = " - ";

/**
 * Apply a saved OFX profile: drop `ignoreIf` matches and fill kind/counterparty,
 * either by splitting "Tipo - Nome - CPF/CNPJ - Banco" (memoSplit) or by kind prefixes.
 */
export function applyOfxProfile(parsed: OfxStatement, settings: OfxProfileSettings): OfxStatement {
  const ignored: IgnoredRow[] = [...parsed.ignored];
  const lines: StatementLine[] = [];
  let openingBalanceCents = parsed.openingBalanceCents;
  for (const original of parsed.lines) {
    const ignoredBy = matchIgnore(original.description, settings.ignoreIf);
    if (ignoredBy) {
      ignored.push({ sourceRow: original.sourceRow, reason: `Contém "${ignoredBy}"` });
      // O Itaú lança o saldo anterior como pseudo-transação: vira o saldo inicial.
      if (openingBalanceCents === undefined && isPreviousBalance(original.description)) openingBalanceCents = original.amountCents;
      continue;
    }
    const line: StatementLine = { ...original };
    const parts = settings.memoSplit ? line.description.split(MEMO_SEPARATOR).map((part) => part.trim()) : [];
    if (parts.length > 1 && parts[0]) {
      line.kind = parts[0];
      if (parts[1]) line.counterparty = parts[1];
    } else {
      const split = splitKind(line.description, settings.kindPrefixes);
      if (split) {
        line.kind = split.kind;
        if (split.counterparty && !original.counterparty) line.counterparty = split.counterparty;
      }
    }
    lines.push(line);
  }
  ignored.sort((a, b) => a.sourceRow - b.sourceRow);
  const totals = computeTotals(lines);
  const result: OfxStatement = { ...parsed, lines, ignored, totals };
  if (openingBalanceCents !== undefined) {
    result.openingBalanceCents = openingBalanceCents;
    if (parsed.closingBalanceCents !== undefined) {
      result.balanceCheck = { ok: openingBalanceCents + totals.netCents === parsed.closingBalanceCents };
    }
  }
  return result;
}
