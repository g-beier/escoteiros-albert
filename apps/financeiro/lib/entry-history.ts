import { dateBR, money } from "@/lib/format";

/** Linha devolvida por `ledger_entry_history` (023). */
export type AuditRow = { id: number; created_at: string; action: string; actor_email: string | null; details: Record<string, unknown> | null };

export type HistoryChange = { label: string; before?: string; after?: string };
export type HistoryItem = { id: number; at: string; actor: string; title: string; changes: HistoryChange[] };

/** Nomes para traduzir os ids gravados na auditoria. */
export type HistoryNames = {
  accounts: Map<string, string>;
  paymentMethods: Map<string, string>;
  categories: Map<string, string>;
  associates: Map<string, string>;
};

type Split = { category_id?: string; amount_cents?: number; description?: string; associate_id?: string | null };
type Snapshot = {
  entry_date?: string; name?: string; account_id?: string; payment_method_id?: string; document?: string | null;
  document_filed?: boolean; total_cents?: number; notes?: string | null; splits?: Split[];
};

const UNLINK_REASONS: Record<string, string> = {
  desfeito: "desfeita manualmente",
  "lançamento alterado (valor ou conta)": "valor ou conta do lançamento alterados",
  "lançamento excluído": "lançamento excluído",
  "importação desfeita": "importação do extrato desfeita",
};

const name = (map: Map<string, string>, id: unknown) => typeof id === "string" && id ? map.get(id) ?? "(removido)" : "—";
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "—";
const cents = (value: unknown) => typeof value === "number" ? money(value / 100) : "—";
const date = (value: unknown) => typeof value === "string" && value ? dateBR(value) : "—";
const filed = (value: unknown) => value ? "Arquivado" : "Pendente";

function splitText(split: Split, names: HistoryNames) {
  const parts = [name(names.categories, split.category_id), cents(split.amount_cents)];
  if (split.description?.trim()) parts.push(split.description.trim());
  if (split.associate_id) parts.push(name(names.associates, split.associate_id));
  return parts.join(" · ");
}

/** Rateios incluídos e removidos (comparação por conteúdo; reordenar não conta como mudança). */
function splitChanges(before: Split[], after: Split[], names: HistoryNames): HistoryChange[] {
  const key = (split: Split) => JSON.stringify([split.category_id, split.amount_cents, split.description ?? "", split.associate_id ?? null]);
  const remaining = new Map<string, number>();
  for (const split of after) remaining.set(key(split), (remaining.get(key(split)) ?? 0) + 1);
  const removed: Split[] = [];
  for (const split of before) {
    const count = remaining.get(key(split)) ?? 0;
    if (count > 0) remaining.set(key(split), count - 1);
    else removed.push(split);
  }
  const added: Split[] = [];
  for (const split of after) {
    const count = remaining.get(key(split)) ?? 0;
    if (count > 0) { added.push(split); remaining.set(key(split), count - 1); }
  }
  return [
    ...removed.map((split) => ({ label: "Rateio removido", before: splitText(split, names) })),
    ...added.map((split) => ({ label: "Rateio incluído", after: splitText(split, names) })),
  ];
}

const FIELDS: { key: keyof Snapshot; label: string; show: (value: unknown, names: HistoryNames) => string }[] = [
  { key: "entry_date", label: "Data", show: date },
  { key: "name", label: "Histórico", show: text },
  { key: "account_id", label: "Conta", show: (value, names) => name(names.accounts, value) },
  { key: "payment_method_id", label: "Forma de pagamento", show: (value, names) => name(names.paymentMethods, value) },
  { key: "document", label: "Documento", show: text },
  { key: "document_filed", label: "Documentos", show: filed },
  { key: "total_cents", label: "Total", show: cents },
  { key: "notes", label: "Observações", show: text },
];

/** Diferenças campo a campo entre dois retratos do lançamento (`ledger_entry_snapshot`). */
export function snapshotChanges(before: Snapshot, after: Snapshot, names: HistoryNames): HistoryChange[] {
  const changes: HistoryChange[] = [];
  for (const field of FIELDS) {
    const from = field.show(before[field.key], names);
    const to = field.show(after[field.key], names);
    if (from !== to) changes.push({ label: field.label, before: from, after: to });
  }
  return [...changes, ...splitChanges(before.splits ?? [], after.splits ?? [], names)];
}

function describe(row: AuditRow, names: HistoryNames): { title: string; changes: HistoryChange[] } {
  const details = (row.details ?? {}) as Record<string, unknown>;
  switch (row.action) {
    case "ledger_entry.created": {
      const changes: HistoryChange[] = [];
      for (const field of FIELDS) {
        if (field.key in details && field.key !== "splits") changes.push({ label: field.label, after: field.show(details[field.key], names) });
      }
      return { title: "Lançamento criado", changes };
    }
    case "ledger_entry.updated": {
      const changes = snapshotChanges((details.before ?? {}) as Snapshot, (details.after ?? {}) as Snapshot, names);
      return { title: changes.length ? "Lançamento alterado" : "Lançamento salvo sem alterações", changes };
    }
    case "ledger_entry.document_filed":
      return { title: details.filed ? "Documento arquivado" : "Documento marcado como pendente", changes: [] };
    case "ledger_entry.outside_statement":
      return { title: details.outside_statement ? "Marcado como fora do extrato" : "Desmarcado como fora do extrato", changes: [] };
    case "ledger_entry.account_changed": {
      const reason = details.reason === "conciliação" ? " na conciliação" : details.reason === "em lote" ? " em lote" : "";
      return { title: `Conta alterada${reason}`, changes: [{ label: "Conta", before: name(names.accounts, details.from), after: name(names.accounts, details.to) }] };
    }
    case "reconciliation.linked": {
      const lines = Array.isArray(details.statement_line_ids) ? details.statement_line_ids.length : 0;
      const entries = Array.isArray(details.ledger_entry_ids) ? details.ledger_entry_ids.length : 0;
      const changes: HistoryChange[] = [{ label: "Linhas do extrato", after: String(lines) }];
      if (entries > 1) changes.push({ label: "Lançamentos no mesmo vínculo", after: String(entries) });
      if (typeof details.amount_cents === "number") changes.push({ label: "Valor", after: cents(details.amount_cents) });
      return { title: "Conciliado com o extrato", changes };
    }
    case "reconciliation.unlinked": {
      const reason = typeof details.reason === "string" ? UNLINK_REASONS[details.reason] ?? details.reason : null;
      return { title: "Conciliação desfeita", changes: reason ? [{ label: "Motivo", after: reason }] : [] };
    }
    case "ledger_entry.attachment_added":
      return { title: "Comprovante anexado", changes: [{ label: "Arquivo", after: text(details.file_name) }] };
    case "ledger_entry.attachment_removed":
      return { title: "Comprovante removido", changes: [{ label: "Arquivo", before: text(details.file_name) }] };
    case "reconciliation.suggestion_rejected":
      return { title: "Sugestão de conciliação recusada", changes: [] };
    default:
      return { title: row.action, changes: [] };
  }
}

/** Eventos de auditoria do lançamento em texto para a página de detalhes (mais recentes primeiro). */
export function describeHistory(rows: AuditRow[], names: HistoryNames): HistoryItem[] {
  return rows.map((row) => ({ id: row.id, at: row.created_at, actor: row.actor_email ?? "Sistema", ...describe(row, names) }));
}
