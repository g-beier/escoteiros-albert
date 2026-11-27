import { monthlyTotals, nextDay, recentListStart, recentWindowStart, type MonthTotals } from "@/lib/finance/dashboard";
import type { LedgerRow } from "@/lib/finance/entry-rows";
import { fetchFeeYear } from "./fees";
import { overdueRanking } from "@/lib/finance/fees";
import type { Db } from "@/lib/server/db";
import { count, one, rows, rpc } from "@/lib/server/pg/db";

// Resumo do Financeiro (/financeiro) e o bloco do Financeiro no Início geral (/).

/** Receitas e despesas de cada mês do ano (Realizado), em centavos. */
export async function yearMonths(db: Db, groupId: string, year: number): Promise<MonthTotals[]> {
  const [categories, sums] = await Promise.all([
    rows<{ id: string; kind: "receita" | "despesa" | null }>(
      db,
      (sql) => sql`select id, kind from public.categories where group_id = ${groupId}`,
    ),
    rpc(db, "realized_by_month", { p_group_id: groupId, p_year: year }),
  ]);
  return monthlyTotals(sums ?? [], new Map(categories.map((c) => [c.id, c.kind])));
}

/** Lançamentos sem o documento arquivado na pasta. */
export async function pendingDocuments(db: Db, groupId: string): Promise<number> {
  return count(
    db,
    (sql) => sql`select count(*) from public.ledger_entries where group_id = ${groupId} and not document_filed`,
  );
}

/** Valores em aberto (Devedores): quanto falta receber das dívidas e de quantos associados. */
export async function openDebtTotals(db: Db, groupId: string): Promise<{ openCents: number; debtors: number }> {
  const row = await one<{ open_cents: string | null; debtors: string }>(
    db,
    (sql) => sql`
    select sum(amount_cents - paid_cents) as open_cents, count(distinct debtor_number) as debtors
    from public.debt_rows(${groupId}) where amount_cents > paid_cents`,
  );
  return { openCents: Number(row?.open_cents ?? 0), debtors: Number(row?.debtors ?? 0) };
}

/** Linhas de extrato importadas e ainda não conciliadas nem ignoradas. */
export async function openStatementLines(db: Db, groupId: string): Promise<number> {
  return count(
    db,
    (sql) => sql`select count(*) from public.statement_lines where group_id = ${groupId} and status = 'aberta'`,
  );
}

/** Últimos lançamentos: hoje e os 7 dias anteriores, mais o último dia com movimento antes disso. */
export async function recentEntries(db: Db, groupId: string, today: string, limit = 300): Promise<LedgerRow[]> {
  const windowStart = recentWindowStart(today);
  const previous = await one<{ entry_date: string }>(
    db,
    (sql) => sql`
    select max(entry_date) as entry_date from public.ledger_entries where group_id = ${groupId} and entry_date < ${windowStart} having max(entry_date) is not null`,
  );
  return rows<LedgerRow>(
    db,
    (sql) => sql`
    select entry_id, entry_date, name, account_name, payment_method_name, document, document_filed, total_cents, external_ids
    from public.ledger_entry_rows where group_id = ${groupId} and entry_date >= ${recentListStart(windowStart, previous?.entry_date)}
    order by entry_date desc, created_at desc limit ${limit}`,
  );
}

export type AccountBalance = {
  id: string;
  name: string;
  /** Saldo no fim de `today`; nulo quando a conta começa depois (sem saldo inicial conhecido). */
  balanceCents: number | null;
  /** Conta sem data de início: o saldo é só a soma dos lançamentos mais o saldo inicial. */
  openingDate: string | null;
};

/** Saldo de cada conta ativa no fim de hoje (saldo inicial + lançamentos), como na importação do extrato. */
export async function accountBalances(db: Db, groupId: string, today: string): Promise<AccountBalance[]> {
  const accounts = await rows<{ id: string; name: string; opening_date: string | null }>(
    db,
    (sql) => sql`
    select id, name, opening_date from public.accounts where group_id = ${groupId} and active order by name`,
  );
  const tomorrow = nextDay(today);
  return Promise.all(
    accounts.map(async (account) => {
      const result = (await rpc(db, "account_balance_before", {
        p_account_id: account.id,
        p_date: tomorrow,
      })) as unknown as { balance_cents: number | null } | null;
      return {
        id: account.id,
        name: account.name,
        balanceCents: result?.balance_cents ?? null,
        openingDate: account.opening_date,
      };
    }),
  );
}

/** Associados com mensalidade atrasada no ano, do maior número de meses para o menor. */
export async function overdueFees(db: Db, groupId: string, year: number) {
  return overdueRanking((await fetchFeeYear(db, groupId, year)).rows);
}
