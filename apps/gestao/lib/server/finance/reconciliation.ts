import type { EntryInput } from "@/lib/finance/entry-schema";
import { toRpcSplits } from "@/lib/finance/entry-schema";
import type { Db } from "@/lib/server/db";
import { rpc, untyped } from "@/lib/server/supabase/db";
import { fetchPaged } from "@/lib/server/supabase/paged";

// Extrato › Conciliar (013): linhas do extrato × lançamentos de uma conta e período, vínculos e recusas.
// Escritas pelas funções auditadas de conciliação.

export type ReconAccount = { id: string; name: string; active: boolean; kind: string; opening_balance_cents: number; opening_date: string | null };
export type LineRow = { id: string; line_date: string; description: string; kind: string | null; counterparty: string | null; amount_cents: number; status: "aberta" | "conciliada" | "ignorada"; ignored_reason: string | null; external_id: string | null; trn_type: string | null };
export type EntryRow = { entry_id: string; entry_date: string; name: string; payment_method_name: string; total_cents: number; reconciled: boolean; outside_statement: boolean; account_id: string };
export type LinkRow = { link_set_id: string; statement_line_id: string; line_date: string; line_description: string; line_kind: string | null; line_counterparty: string | null; line_amount_cents: number; ledger_entry_id: string; entry_date: string; entry_name: string; entry_total_cents: number; created_at: string };
export type ImportRow = { period_from: string; period_to: string; opening_balance_cents: number | null; closing_balance_cents: number | null };

/** Teto por lista da tela (linhas, lançamentos, vínculos); recusas até 5×. */
export const LIMIT = 5000;

/** Contas do grupo para escolher a da conciliação. */
export async function accounts(db: Db, groupId: string): Promise<{ accounts: ReconAccount[]; error?: string }> {
  const { data, error } = await untyped(db).from("accounts").select("id, name, active, kind, opening_balance_cents, opening_date").eq("group_id", groupId).order("name");
  return { accounts: (data ?? []) as ReconAccount[], error: error?.message };
}

/**
 * Tudo o que a tela de conciliação mostra de uma conta no período: linhas do extrato, lançamentos não
 * conciliados (da conta e de `entryAccountIds`, como "A definir"), vínculos, recusas, importações e formas.
 */
export async function board(db: Db, groupId: string, accountId: string, entryAccountIds: string[], period: { from: string; to: string }) {
  const supabase = untyped(db);
  const [lines, entries, links, rejections, imports, methods] = await Promise.all([
    fetchPaged<LineRow>((from, to) => supabase.from("statement_lines").select("id, line_date, description, kind, counterparty, amount_cents, status, ignored_reason, external_id, trn_type")
      .eq("account_id", accountId).gte("line_date", period.from).lte("line_date", period.to)
      .order("line_date").order("amount_cents").order("id").range(from, to), LIMIT),
    fetchPaged<EntryRow>((from, to) => supabase.from("ledger_entry_rows").select("entry_id, entry_date, name, payment_method_name, total_cents, reconciled, outside_statement, account_id")
      .eq("group_id", groupId).in("account_id", entryAccountIds).eq("reconciled", false).gte("entry_date", period.from).lte("entry_date", period.to)
      .order("entry_date").order("total_cents").order("entry_id").range(from, to), LIMIT),
    fetchPaged<LinkRow>((from, to) => supabase.from("reconciliation_link_rows").select("link_set_id, statement_line_id, line_date, line_description, line_kind, line_counterparty, line_amount_cents, ledger_entry_id, entry_date, entry_name, entry_total_cents, created_at")
      .eq("account_id", accountId).gte("line_date", period.from).lte("line_date", period.to)
      .order("line_date").order("link_id").range(from, to), LIMIT),
    fetchPaged<{ statement_line_id: string; ledger_entry_id: string }>((from, to) => supabase.from("reconciliation_rejections").select("statement_line_id, ledger_entry_id, statement_lines!inner(account_id)")
      .eq("statement_lines.account_id", accountId).order("statement_line_id").order("ledger_entry_id").range(from, to), LIMIT * 5),
    supabase.from("statement_imports").select("period_from, period_to, opening_balance_cents, closing_balance_cents")
      .eq("account_id", accountId).lte("period_from", period.to).gte("period_to", period.from),
    supabase.from("payment_methods").select("id, name, active").eq("group_id", groupId).order("name"),
  ]);
  return {
    lines: lines.data, entries: entries.data, links: links.data, rejections: rejections.data,
    imports: (imports.data ?? []) as ImportRow[], methods: (methods.data ?? []) as { id: string; name: string; active: boolean }[],
    error: [lines, entries, links, rejections, imports].map((r) => r.error?.message).find(Boolean),
  };
}

// Escritas

/** Vincula linhas e lançamentos cujas somas batem (1:1, 1:N ou N:1). */
export async function link(db: Db, lineIds: string[], entryIds: string[]) {
  await rpc(db, "link_reconciliation", { p_statement_line_ids: lineIds, p_ledger_entry_ids: entryIds });
}
export async function unlink(db: Db, lineId: string) {
  await rpc(db, "unlink_reconciliation", { p_statement_line_id: lineId });
}
/** Recusa a sugestão: o par não é sugerido de novo. */
export async function reject(db: Db, lineId: string, entryId: string) {
  await rpc(db, "reject_reconciliation_suggestion", { p_statement_line_id: lineId, p_ledger_entry_id: entryId });
}
export async function ignoreLine(db: Db, lineId: string, reason: string) {
  await rpc(db, "ignore_statement_line", { p_id: lineId, p_reason: reason });
}
/** Ignora várias linhas com o mesmo motivo; devolve quantas. */
export async function ignoreLines(db: Db, lineIds: string[], reason: string): Promise<number> {
  return Number(await rpc(db, "ignore_statement_lines", { p_ids: lineIds, p_reason: reason }));
}
export async function reopenLine(db: Db, lineId: string) {
  await rpc(db, "reopen_statement_line", { p_id: lineId });
}
export async function setOutsideStatement(db: Db, entryId: string, outside: boolean) {
  await rpc(db, "set_ledger_entry_outside_statement", { p_entry_id: entryId, p_outside: outside });
}
export async function setEntryAccount(db: Db, entryId: string, accountId: string) {
  await rpc(db, "set_ledger_entry_account", { p_entry_id: entryId, p_account_id: accountId });
}

/** Cria o lançamento a partir da linha e já o vincula (uma transação); devolve o id. */
export async function createEntryFromLine(db: Db, lineId: string, input: EntryInput): Promise<string> {
  return await rpc(db, "create_entry_from_statement_line", {
    p_statement_line_id: lineId, p_entry_date: input.date, p_name: input.name, p_payment_method_id: input.paymentMethodId,
    p_document: input.document || null, p_document_filed: input.documentFiled, p_total_cents: input.totalCents,
    p_splits: toRpcSplits(input.splits), p_notes: input.notes?.trim() || null,
  }) as string;
}

export type BulkLineItem = { lineId: string; name?: string; paymentMethodId: string; categoryId?: string; description?: string };

/** Um lançamento por linha, já conciliado, numa transação; devolve quantos. */
export async function createEntriesFromLines(db: Db, items: BulkLineItem[]): Promise<number> {
  return Number(await rpc(db, "create_entries_from_statement_lines", { p_items: items }));
}
