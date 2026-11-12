import type { SplitRow } from "@/lib/entry-queries";
import { csvText } from "./csv";
import { ofxIds, type Column } from "./columns";

/**
 * Exportação contábil em partida dobrada: uma linha por rateio.
 * Rateio positivo (entrada): débito na conta contábil da conta bancária, crédito na da rubrica.
 * Rateio negativo (saída): débito na rubrica, crédito na conta bancária. O valor sai sempre positivo.
 * Funciona também para lançamentos com rubricas de receita e despesa misturadas: cada rateio tem seu sinal.
 */
export type AccountingRow = {
  date: string;
  debit: string;
  credit: string;
  amountCents: number;
  history: string;
  document: string;
  ofxId: string;
  category: string;
  account: string;
};

export type AccountingSplit = Pick<SplitRow,
  "entry_date" | "entry_name" | "description" | "amount_cents" | "document" | "category_code" | "category_name"
  | "category_ledger_code" | "account_name" | "account_ledger_code" | "external_ids">;

export const HISTORY_MAX = 200;

/** "Histórico — descrição do rateio", numa linha, até 200 caracteres. */
export function accountingHistory(entryName: string, description: string) {
  const name = entryName.trim();
  const detail = description.trim();
  const text = detail && detail.toLowerCase() !== name.toLowerCase() ? `${name} — ${detail}` : name;
  return csvText(text, HISTORY_MAX);
}

export function toAccountingRows(splits: AccountingSplit[]): AccountingRow[] {
  return splits.filter((split) => split.amount_cents !== 0).map((split) => {
    const category = split.category_ledger_code ?? "";
    const bank = split.account_ledger_code ?? "";
    const inflow = split.amount_cents > 0;
    return {
      date: split.entry_date,
      debit: inflow ? bank : category,
      credit: inflow ? category : bank,
      amountCents: Math.abs(split.amount_cents),
      history: accountingHistory(split.entry_name, split.description),
      document: split.document ?? "",
      ofxId: ofxIds(split.external_ids),
      category: [split.category_code, split.category_name].filter(Boolean).join(" "),
      account: split.account_name,
    };
  });
}

/** Rubricas usadas no período sem conta contábil: sem elas o arquivo sairia incompleto. */
export function missingLedgerCodes(splits: AccountingSplit[]) {
  const missing = new Map<string, string>();
  for (const split of splits) {
    if (split.category_ledger_code) continue;
    const label = [split.category_code, split.category_name].filter(Boolean).join(" ");
    missing.set(label, label);
  }
  return [...missing.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export const ACCOUNTING_COLUMNS: Column<AccountingRow>[] = [
  { header: "Data", width: 12, type: "date", value: (r) => r.date },
  { header: "Conta débito", width: 15, value: (r) => r.debit },
  { header: "Conta crédito", width: 15, value: (r) => r.credit },
  { header: "Valor", width: 14, type: "money", value: (r) => r.amountCents },
  { header: "Histórico", width: 60, value: (r) => r.history },
  { header: "Documento", width: 16, value: (r) => r.document },
  { header: "ID OFX", width: 24, value: (r) => r.ofxId },
  { header: "Rubrica", width: 30, value: (r) => r.category },
  { header: "Conta", width: 22, value: (r) => r.account },
];
