import type { EntryInput } from "@/lib/finance/entry-schema";
import { toRpcSplits } from "@/lib/finance/entry-schema";
import type { Db } from "@/lib/server/db";
import { rows, rpc, run } from "@/lib/server/pg/db";

// Extrato › Conciliar (013): linhas do extrato × lançamentos de uma conta e período, vínculos e recusas.
// Escritas pelas funções auditadas de conciliação.

export type ReconAccount = {
  id: string;
  name: string;
  active: boolean;
  kind: string;
  opening_balance_cents: number;
  opening_date: string | null;
};
export type LineRow = {
  id: string;
  line_date: string;
  description: string;
  kind: string | null;
  counterparty: string | null;
  amount_cents: number;
  status: "aberta" | "conciliada" | "ignorada";
  ignored_reason: string | null;
  external_id: string | null;
  trn_type: string | null;
};
export type EntryRow = {
  entry_id: string;
  entry_date: string;
  name: string;
  payment_method_name: string;
  total_cents: number;
  reconciled: boolean;
  outside_statement: boolean;
  account_id: string;
};
export type LinkRow = {
  link_set_id: string;
  statement_line_id: string;
  line_date: string;
  line_description: string;
  line_kind: string | null;
  line_counterparty: string | null;
  line_amount_cents: number;
  ledger_entry_id: string;
  entry_date: string;
  entry_name: string;
  entry_total_cents: number;
  created_at: string;
};
export type ImportRow = {
  period_from: string;
  period_to: string;
  opening_balance_cents: number | null;
  closing_balance_cents: number | null;
};

/** Teto por lista da tela (linhas, lançamentos, vínculos); recusas até 5×. */
export const LIMIT = 5000;

/** Contas do grupo para escolher a da conciliação. */
export async function accounts(db: Db, groupId: string): Promise<{ accounts: ReconAccount[]; error?: string }> {
  try {
    return {
      accounts: await rows<ReconAccount>(
        db,
        (sql) => sql`
      select id, name, active, kind, opening_balance_cents, opening_date from public.accounts where group_id = ${groupId} order by name`,
      ),
    };
  } catch (error) {
    return { accounts: [], error: (error as Error).message };
  }
}

/**
 * Tudo o que a tela de conciliação mostra de uma conta no período: linhas do extrato, lançamentos não
 * conciliados (da conta e de `entryAccountIds`, como "A definir"), vínculos, recusas, importações e formas.
 */
export async function board(
  db: Db,
  groupId: string,
  accountId: string,
  entryAccountIds: string[],
  period: { from: string; to: string },
) {
  const empty = {
    lines: [] as LineRow[],
    entries: [] as EntryRow[],
    links: [] as LinkRow[],
    rejections: [] as { statement_line_id: string; ledger_entry_id: string }[],
    imports: [] as ImportRow[],
    methods: [] as { id: string; name: string; active: boolean }[],
  };
  try {
    return await run(db, async (sql) => {
      const [lines, entries, links, rejections, imports, methods] = await Promise.all([
        sql`select id, line_date, description, kind, counterparty, amount_cents, status, ignored_reason, external_id, trn_type
            from public.statement_lines where account_id = ${accountId} and line_date between ${period.from} and ${period.to}
            order by line_date, amount_cents, id limit ${LIMIT}`,
        sql`select entry_id, entry_date, name, payment_method_name, total_cents, reconciled, outside_statement, account_id
            from public.ledger_entry_rows where group_id = ${groupId} and account_id = any(${entryAccountIds}::uuid[]) and not reconciled
              and entry_date between ${period.from} and ${period.to}
            order by entry_date, total_cents, entry_id limit ${LIMIT}`,
        sql`select link_set_id, statement_line_id, line_date, line_description, line_kind, line_counterparty, line_amount_cents, ledger_entry_id,
              entry_date, entry_name, entry_total_cents, created_at
            from public.reconciliation_link_rows where account_id = ${accountId} and line_date between ${period.from} and ${period.to}
            order by line_date, link_id limit ${LIMIT}`,
        sql`select r.statement_line_id, r.ledger_entry_id from public.reconciliation_rejections r
            join public.statement_lines l on l.id = r.statement_line_id where l.account_id = ${accountId}
            order by r.statement_line_id, r.ledger_entry_id limit ${LIMIT * 5}`,
        sql`select period_from, period_to, opening_balance_cents, closing_balance_cents from public.statement_imports
            where account_id = ${accountId} and period_from <= ${period.to} and period_to >= ${period.from}`,
        sql`select id, name, active from public.payment_methods where group_id = ${groupId} order by name`,
      ]);
      return {
        lines: [...lines] as unknown as LineRow[],
        entries: [...entries] as unknown as EntryRow[],
        links: [...links] as unknown as LinkRow[],
        rejections: [...rejections] as unknown as { statement_line_id: string; ledger_entry_id: string }[],
        imports: [...imports] as unknown as ImportRow[],
        methods: [...methods] as unknown as { id: string; name: string; active: boolean }[],
        error: undefined as string | undefined,
      };
    });
  } catch (error) {
    return { ...empty, error: (error as Error).message };
  }
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
  return (await rpc(db, "create_entry_from_statement_line", {
    p_statement_line_id: lineId,
    p_entry_date: input.date,
    p_name: input.name,
    p_payment_method_id: input.paymentMethodId,
    p_document: input.document || null,
    p_document_filed: input.documentFiled,
    p_total_cents: input.totalCents,
    p_splits: toRpcSplits(input.splits, input.debtLines),
    p_notes: input.notes?.trim() || null,
  })) as string;
}

export type BulkLineItem = {
  lineId: string;
  name?: string;
  paymentMethodId: string;
  categoryId?: string;
  description?: string;
};

/** Um lançamento por linha, já conciliado, numa transação; devolve quantos. */
export async function createEntriesFromLines(db: Db, items: BulkLineItem[]): Promise<number> {
  return Number(await rpc(db, "create_entries_from_statement_lines", { p_items: items }));
}
