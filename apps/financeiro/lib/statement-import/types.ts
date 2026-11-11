/** One movement read from a bank statement. Amounts are signed integer cents (credit > 0, debit < 0). */
export type StatementLine = {
  /** YYYY-MM-DD */
  date: string;
  amountCents: number;
  description: string;
  kind?: string;
  counterparty?: string;
  externalId?: string;
  balanceCents?: number;
  /** 1-based record number in the CSV, or the line of `<STMTTRN>` in an OFX file. */
  sourceRow: number;
};

export type StatementIssue = { sourceRow: number; message: string };
export type IgnoredRow = { sourceRow: number; reason: string };

export type StatementTotals = {
  creditsCents: number;
  /** Sum of the debits, negative (or 0). */
  debitsCents: number;
  /** creditsCents + debitsCents */
  netCents: number;
};

export type ParsedStatement = {
  lines: StatementLine[];
  errors: StatementIssue[];
  ignored: IgnoredRow[];
  openingBalanceCents?: number;
  closingBalanceCents?: number;
  periodFrom?: string;
  periodTo?: string;
  totals: StatementTotals;
  balanceCheck?: { ok: boolean; firstMismatchRow?: number };
};

export type Encoding = "utf-8" | "latin1";
export type Decimal = "comma" | "dot";
export type DateFormat =
  | "DD/MM/YYYY"
  | "DD-MM-YYYY"
  | "DD.MM.YYYY"
  | "DD/MM/YY"
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"
  | "MM/DD/YYYY";

export type ProfileColumns = {
  date: string;
  /** Signed amount. Combined with `nature`, only its absolute value is used. */
  amount?: string;
  credit?: string;
  debit?: string;
  /** Column telling credit from debit (e.g. "DÉBITO"/"CRÉDITO"); requires `debitValues`. */
  nature?: string;
  debitValues?: string[];
  /** Joined with a space to build the description. */
  description: string[];
  counterparty?: string;
  externalId?: string;
  balance?: string;
};

export type ProfileSettings = {
  encoding: Encoding;
  delimiter: string;
  /** 1-based record number of the header row. */
  headerRow: number;
  dateFormat: DateFormat;
  decimal: Decimal;
  columns: ProfileColumns;
  /** Leading words of the description that name the kind of movement ("Pix recebido"). */
  kindPrefixes?: string[];
  /** Case/accent-insensitive substrings; matching rows are ignored (pseudo-lines like "SALDO ANTERIOR"). */
  ignoreIf?: string[];
};

export type CsvTable = {
  header: string[];
  rows: string[][];
  /** Non-blank records before the header row. */
  preamble: string[][];
  /** 1-based record number of each entry in `rows`. */
  rowNumbers: number[];
  /** 1-based record number of the header row. */
  headerRow: number;
};

export type CsvSniff = {
  delimiter: string;
  headerRow: number;
  dateFormat: DateFormat;
  decimal: Decimal;
};

export type KindPrefixSuggestion = { prefix: string; count: number };

export type OfxAccount = { bankId?: string; branchId?: string; acctId?: string; org?: string; currency?: string };

export type OfxStatement = ParsedStatement & {
  account: OfxAccount;
  /** `ofx:<org or bankId>`, for profile matching. */
  signature: string;
};

export type OfxProfileSettings = {
  kindPrefixes?: string[];
  ignoreIf?: string[];
  /** Split the description on " - ": part 0 is the kind, part 1 the counterparty (Nubank MEMO). */
  memoSplit?: boolean;
};
