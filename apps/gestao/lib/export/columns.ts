import type { LedgerRow, SplitRow } from "@/lib/entry-queries";

/**
 * Colunas das exportações, independentes do formato: o valor sai no tipo do domínio
 * (data ISO, centavos inteiros, texto) e cada renderizador (XLSX, CSV) formata.
 */
export type Column<T> = {
  header: string;
  /** Largura no XLSX, em caracteres. */
  width: number;
  type?: "text" | "date" | "money";
  value: (row: T) => string | number | null;
};

export const folderLabel = (filed: boolean) => filed ? "Arquivado" : "Pendente";
const kindLabel = (kind: SplitRow["category_kind"]) => kind === "receita" ? "Receita" : kind === "despesa" ? "Despesa" : "";
/** IDs OFX (FITID) juntos numa célula; em geral é um só. */
export const ofxIds = (ids: string[] | null | undefined) => (ids ?? []).join(" ");

export const LEDGER_EXPORT_COLUMNS: Column<LedgerRow>[] = [
  { header: "Data", width: 12, type: "date", value: (r) => r.entry_date },
  { header: "Histórico", width: 40, value: (r) => r.name },
  { header: "Conta", width: 22, value: (r) => r.account_name },
  { header: "Forma pgto", width: 18, value: (r) => r.payment_method_name },
  { header: "Documento", width: 16, value: (r) => r.document ?? "" },
  { header: "Documentos", width: 12, value: (r) => folderLabel(r.document_filed) },
  { header: "ID OFX", width: 24, value: (r) => ofxIds(r.external_ids) },
  { header: "Valor", width: 16, type: "money", value: (r) => r.total_cents },
];

export const SPLIT_EXPORT_COLUMNS: Column<SplitRow>[] = [
  { header: "Data", width: 12, type: "date", value: (r) => r.entry_date },
  { header: "Histórico", width: 34, value: (r) => r.entry_name },
  { header: "Conta", width: 22, value: (r) => r.account_name },
  { header: "Forma pgto", width: 18, value: (r) => r.payment_method_name },
  { header: "Documento", width: 16, value: (r) => r.document ?? "" },
  { header: "Documentos", width: 12, value: (r) => folderLabel(r.document_filed) },
  { header: "ID OFX", width: 24, value: (r) => ofxIds(r.external_ids) },
  { header: "Código", width: 9, value: (r) => r.category_code ?? "" },
  { header: "Rubrica", width: 30, value: (r) => r.category_name },
  { header: "Conta contábil", width: 15, value: (r) => r.category_ledger_code ?? "" },
  { header: "Tipo", width: 10, value: (r) => kindLabel(r.category_kind) },
  { header: "Descrição", width: 34, value: (r) => r.description },
  { header: "Associado", width: 26, value: (r) => r.associate_name ?? "" },
  { header: "Valor", width: 16, type: "money", value: (r) => r.amount_cents },
];
