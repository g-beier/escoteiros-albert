import { readCsv } from "./csv";
import { checkBalanceChain, computePeriod, computeTotals, matchIgnore, splitKind } from "./profile";
import { collapseSpaces, normalizeText } from "./text";
import type { CsvTable, Decimal, IgnoredRow, ParsedStatement, ProfileSettings, StatementIssue, StatementLine } from "./types";
import { parseAmount, parseDate } from "./values";

const OPENING_HEADERS = ["initial balance", "opening balance", "saldo inicial", "saldo anterior"];
const CLOSING_HEADERS = ["final balance", "closing balance", "saldo final", "saldo atual"];

const headerKey = (cell: string) => normalizeText(cell.replace(/_/g, " "));

/**
 * Look for a summary block in the preamble: a row naming opening/closing balance columns
 * followed by a row with their values (Mercado Pago's INITIAL_BALANCE;...;FINAL_BALANCE).
 */
export function preambleBalances(preamble: string[][], decimal: Decimal) {
  const result: { openingBalanceCents?: number; closingBalanceCents?: number } = {};
  for (let i = 0; i + 1 < preamble.length; i += 1) {
    const keys = preamble[i].map(headerKey);
    const values = preamble[i + 1];
    const read = (names: string[]) => {
      const index = keys.findIndex((key) => names.includes(key));
      return index >= 0 && values[index] !== undefined ? parseAmount(values[index], decimal) ?? undefined : undefined;
    };
    const opening = read(OPENING_HEADERS);
    const closing = read(CLOSING_HEADERS);
    if (opening !== undefined || closing !== undefined) {
      if (opening !== undefined) result.openingBalanceCents = opening;
      if (closing !== undefined) result.closingBalanceCents = closing;
      return result;
    }
  }
  return result;
}

function columnIndex(header: string[], name: string) {
  const key = normalizeText(name);
  return header.findIndex((cell) => normalizeText(cell) === key);
}

/**
 * Turn CSV rows into statement lines with a saved bank profile.
 * Row problems are reported in `errors` without stopping the import.
 */
export function applyProfile(input: CsvTable | string, settings: ProfileSettings): ParsedStatement {
  const csv = typeof input === "string" ? readCsv(input, settings) : input;
  const { columns, decimal, dateFormat } = settings;
  const errors: StatementIssue[] = [];
  const ignored: IgnoredRow[] = [];
  const lines: StatementLine[] = [];

  const named: Record<string, string | undefined> = {
    date: columns.date,
    amount: columns.amount,
    credit: columns.credit,
    debit: columns.debit,
    nature: columns.nature,
    counterparty: columns.counterparty,
    externalId: columns.externalId,
    balance: columns.balance,
  };
  const index: Record<string, number> = {};
  const missing: string[] = [];
  for (const [key, name] of Object.entries(named)) {
    if (!name) continue;
    index[key] = columnIndex(csv.header, name);
    if (index[key] < 0) missing.push(name);
  }
  const descriptionIndexes = columns.description.map((name) => {
    const found = columnIndex(csv.header, name);
    if (found < 0) missing.push(name);
    return found;
  });
  if (!columns.amount && !(columns.credit || columns.debit)) {
    errors.push({ sourceRow: csv.headerRow, message: "Informe a coluna de valor ou as colunas de crédito/débito." });
  }
  if (missing.length > 0) {
    errors.push({ sourceRow: csv.headerRow, message: `Coluna não encontrada: ${missing.join(", ")}.` });
  }
  if (errors.length > 0) return { lines, errors, ignored, totals: computeTotals(lines) };

  const debitValues = (columns.debitValues ?? []).map(normalizeText);
  const cell = (row: string[], key: string) => (index[key] === undefined ? "" : (row[index[key]] ?? "").trim());

  csv.rows.forEach((row, position) => {
    const sourceRow = csv.rowNumbers[position] ?? csv.headerRow + position + 1;
    const description = collapseSpaces(descriptionIndexes.map((i) => row[i] ?? "").join(" "));
    const ignoredBy = matchIgnore(row.join(" "), settings.ignoreIf);
    if (ignoredBy) {
      ignored.push({ sourceRow, reason: `Contém "${ignoredBy}"` });
      return;
    }

    const problems: string[] = [];
    const date = parseDate(cell(row, "date"), dateFormat);
    if (!date) problems.push(`data inválida "${cell(row, "date")}"`);

    let amountCents: number | null = null;
    if (columns.amount) {
      amountCents = parseAmount(cell(row, "amount"), decimal);
      if (amountCents === null) problems.push(`valor inválido "${cell(row, "amount")}"`);
    } else {
      const creditRaw = cell(row, "credit");
      const debitRaw = cell(row, "debit");
      const credit = creditRaw ? parseAmount(creditRaw, decimal) : 0;
      const debit = debitRaw ? parseAmount(debitRaw, decimal) : 0;
      if (credit === null) problems.push(`crédito inválido "${creditRaw}"`);
      if (debit === null) problems.push(`débito inválido "${debitRaw}"`);
      if (!creditRaw && !debitRaw) problems.push("sem valor de crédito nem de débito");
      if (credit !== null && debit !== null) amountCents = Math.abs(credit) - Math.abs(debit);
    }
    if (amountCents !== null && columns.nature) {
      const isDebit = debitValues.includes(normalizeText(cell(row, "nature")));
      amountCents = isDebit ? -Math.abs(amountCents) : Math.abs(amountCents);
    }

    let balanceCents: number | undefined;
    const balanceRaw = cell(row, "balance");
    if (columns.balance && balanceRaw) {
      const parsed = parseAmount(balanceRaw, decimal);
      if (parsed === null) problems.push(`saldo inválido "${balanceRaw}"`);
      else balanceCents = parsed;
    }

    if (problems.length > 0 || !date || amountCents === null) {
      errors.push({ sourceRow, message: capitalize(problems.join("; ")) + "." });
      return;
    }

    const line: StatementLine = { date, amountCents, description, sourceRow };
    const split = splitKind(description, settings.kindPrefixes);
    if (split) {
      line.kind = split.kind;
      if (split.counterparty) line.counterparty = split.counterparty;
    }
    const counterparty = collapseSpaces(cell(row, "counterparty"));
    if (counterparty) line.counterparty = counterparty;
    const externalId = cell(row, "externalId");
    if (externalId) line.externalId = externalId;
    if (balanceCents !== undefined) line.balanceCents = balanceCents;
    lines.push(line);
  });

  const totals = computeTotals(lines);
  const result: ParsedStatement = { lines, errors, ignored, totals, ...computePeriod(lines) };

  const chain = checkBalanceChain(lines);
  const summary = preambleBalances(csv.preamble, decimal);
  if (chain) {
    result.openingBalanceCents = chain.openingBalanceCents;
    result.closingBalanceCents = chain.closingBalanceCents;
  } else {
    if (summary.openingBalanceCents !== undefined) result.openingBalanceCents = summary.openingBalanceCents;
    if (summary.closingBalanceCents !== undefined) result.closingBalanceCents = summary.closingBalanceCents;
  }

  const checks: boolean[] = [];
  let firstMismatchRow: number | undefined;
  if (chain) {
    checks.push(chain.ok);
    firstMismatchRow = chain.firstMismatchRow;
    // A summary block must agree with the balances on the rows.
    if (summary.openingBalanceCents !== undefined) checks.push(summary.openingBalanceCents === chain.openingBalanceCents);
    if (summary.closingBalanceCents !== undefined) checks.push(summary.closingBalanceCents === chain.closingBalanceCents);
  } else if (summary.openingBalanceCents !== undefined && summary.closingBalanceCents !== undefined) {
    checks.push(summary.openingBalanceCents + totals.netCents === summary.closingBalanceCents);
  }
  if (checks.length > 0) {
    result.balanceCheck = { ok: checks.every(Boolean) };
    if (firstMismatchRow !== undefined) result.balanceCheck.firstMismatchRow = firstMismatchRow;
  }
  return result;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
