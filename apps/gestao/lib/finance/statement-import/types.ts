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
  /** OFX: TRNTYPE (CREDIT, DEBIT, PAYMENT, XFER, FEE…), CHECKNUM, REFNUM e NAME, como vieram do banco. */
  trnType?: string;
  checkNumber?: string;
  reference?: string;
  payee?: string;
  /** 1-based line of `<STMTTRN>` in the OFX file. */
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
  /** Saldo inicial + movimentos = saldo final, quando o arquivo traz os dois saldos. */
  balanceCheck?: { ok: boolean };
};

export type Encoding = "utf-8" | "latin1";
export type Decimal = "comma" | "dot";
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
