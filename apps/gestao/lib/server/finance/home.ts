import { monthlyTotals, nextDay, recentListStart, recentWindowStart, type MonthTotals } from "@/lib/finance/dashboard";
import type { LedgerRow } from "@/lib/finance/entry-rows";
import { fetchFeeYear } from "./fees";
import { overdueRanking } from "@/lib/finance/fees";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb, unwrap } from "@/lib/server/supabase/db";

// Resumo do Financeiro (/financeiro) e o bloco do Financeiro no Início geral (/).

/** Receitas e despesas de cada mês do ano (Realizado), em centavos. */
export async function yearMonths(db: Db, groupId: string, year: number): Promise<MonthTotals[]> {
  const [categories, sums] = await Promise.all([
    sb(db).from("categories").select("id, kind").eq("group_id", groupId).then(rowsOf),
    rpc(db, "realized_by_month", { p_group_id: groupId, p_year: year }),
  ]);
  return monthlyTotals(sums ?? [], new Map(categories.map((c) => [c.id, c.kind])));
}

/** Lançamentos sem o documento arquivado na pasta. */
export async function pendingDocuments(db: Db, groupId: string): Promise<number> {
  const { count } = await sb(db).from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("document_filed", false);
  return count ?? 0;
}

/** Linhas de extrato importadas e ainda não conciliadas nem ignoradas. */
export async function openStatementLines(db: Db, groupId: string): Promise<number> {
  const { count } = await sb(db).from("statement_lines").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "aberta");
  return count ?? 0;
}

/** Últimos lançamentos: hoje e os 7 dias anteriores, mais o último dia com movimento antes disso. */
export async function recentEntries(db: Db, groupId: string, today: string, limit = 300): Promise<LedgerRow[]> {
  const windowStart = recentWindowStart(today);
  const previous = unwrap(await sb(db).from("ledger_entries").select("entry_date").eq("group_id", groupId).lt("entry_date", windowStart)
    .order("entry_date", { ascending: false }).limit(1).maybeSingle());
  return rowsOf(await sb(db).from("ledger_entry_rows")
    .select("entry_id, entry_date, name, account_name, payment_method_name, document, document_filed, total_cents, external_ids")
    .eq("group_id", groupId).gte("entry_date", recentListStart(windowStart, previous?.entry_date))
    .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit)) as LedgerRow[];
}

export type AccountBalance = {
  id: string; name: string;
  /** Saldo no fim de `today`; nulo quando a conta começa depois (sem saldo inicial conhecido). */
  balanceCents: number | null;
  /** Conta sem data de início: o saldo é só a soma dos lançamentos mais o saldo inicial. */
  openingDate: string | null;
};

/** Saldo de cada conta ativa no fim de hoje (saldo inicial + lançamentos), como na importação do extrato. */
export async function accountBalances(db: Db, groupId: string, today: string): Promise<AccountBalance[]> {
  const accounts = rowsOf(await sb(db).from("accounts").select("id, name, opening_date").eq("group_id", groupId).eq("active", true).order("name"));
  const tomorrow = nextDay(today);
  return Promise.all(accounts.map(async (account) => {
    const result = await rpc(db, "account_balance_before", { p_account_id: account.id, p_date: tomorrow }) as { balance_cents: number | null } | null;
    return { id: account.id, name: account.name, balanceCents: result?.balance_cents ?? null, openingDate: account.opening_date };
  }));
}

/** Associados com mensalidade atrasada no ano, do maior número de meses para o menor. */
export async function overdueFees(db: Db, groupId: string, year: number) {
  return overdueRanking((await fetchFeeYear(db, groupId, year)).rows);
}
