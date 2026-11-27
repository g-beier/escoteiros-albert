// Linhas das listas de lançamentos (Movimentações, Detalhamento) e colunas lidas das visões; as consultas ficam em lib/server/finance/entries.ts.

export const PAGE_SIZE = 100;

/** Movimentações: um lançamento por linha; Detalhamento: um rateio por linha. */
export type EntryView = "movimentacoes" | "detalhamento";

export type LedgerRow = {
  entry_id: string;
  entry_date: string;
  name: string;
  account_name: string;
  payment_method_name: string;
  document: string | null;
  document_filed: boolean;
  total_cents: number;
  /** Vinculado a uma linha do extrato (conciliação). */
  reconciled?: boolean;
  /** IDs OFX (FITID) das linhas do extrato vinculadas; juntam o lançamento à movimentação do banco. */
  external_ids: string[];
  /** Comprovantes anexados (entry_attachments); preenchido por fetchEntryPage. */
  attachment_count?: number;
  /** `para_revisar`: veio do registro rápido e ninguém conferiu ainda (049). */
  review_status?: string;
};

export type SplitRow = {
  split_id: string;
  entry_id: string;
  entry_date: string;
  entry_name: string;
  account_name: string;
  payment_method_name: string;
  document: string | null;
  document_filed: boolean;
  amount_cents: number;
  description: string;
  category_name: string;
  category_code: string | null;
  category_kind: "receita" | "despesa" | null;
  associate_name: string | null;
  category_ledger_code: string | null;
  account_ledger_code: string | null;
  external_ids: string[];
  attachment_count?: number;
  reconciled?: boolean;
  review_status?: string;
};

export type EntryPage =
  | { view: "movimentacoes"; rows: LedgerRow[]; total: number | null; error?: string }
  | { view: "detalhamento"; rows: SplitRow[]; total: number | null; error?: string };

export const LEDGER_COLUMNS =
  "entry_id, entry_date, name, account_name, payment_method_name, document, document_filed, total_cents, reconciled, external_ids, review_status";
export const SPLIT_COLUMNS =
  "split_id, entry_id, entry_date, entry_name, account_name, payment_method_name, document, document_filed, amount_cents, description, category_name, category_code, category_kind, associate_name, category_ledger_code, account_ledger_code, external_ids, reconciled, review_status";
