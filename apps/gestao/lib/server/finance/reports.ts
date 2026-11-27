import type { Db } from "@/lib/server/db";
import { one, rows, rpc, run, type Tx } from "@/lib/server/pg/db";
import { SPLIT_COLUMNS, LEDGER_COLUMNS, type SplitRow, type LedgerRow } from "@/lib/finance/entry-rows";
import type { CategoryItem } from "@/lib/finance/categories";
import type { Period } from "@/lib/finance/export/period";
import { buildRealizedModel, type RealizedSum } from "@/lib/finance/export/realized";

/** Teto de segurança para uma planilha; acima disso, pedir um período menor. */
export const MAX_EXPORT_ROWS = 50_000;

export class ExportTooLargeError extends Error {
  constructor() {
    super(`O período tem mais de ${MAX_EXPORT_ROWS.toLocaleString("pt-BR")} linhas. Escolha um período menor.`);
  }
}

/** Todas as linhas do período (limites inclusivos), na ordem cronológica; mais que o teto vira ExportTooLargeError. */
async function fetchAll<T>(db: Db, build: (sql: Tx, limit: number) => ReturnType<Tx>): Promise<T[]> {
  const list = await run(db, async (sql) => [...(await build(sql, MAX_EXPORT_ROWS + 1))] as T[]);
  if (list.length > MAX_EXPORT_ROWS) throw new ExportTooLargeError();
  return list;
}

export function fetchAllLedgerRows(db: Db, groupId: string, { from, to }: Period) {
  return fetchAll<LedgerRow>(
    db,
    (sql, limit) => sql`
    select ${sql.unsafe(LEDGER_COLUMNS)} from public.ledger_entry_rows
    where group_id = ${groupId} and entry_date between ${from} and ${to}
    order by entry_date, created_at, entry_id limit ${limit}`,
  );
}

/** Rateios do período; `accountId` restringe a uma conta (exportação contábil por conta). */
export function fetchAllSplitRows(db: Db, groupId: string, { from, to }: Period, accountId?: string) {
  return fetchAll<SplitRow>(
    db,
    (sql, limit) => sql`
    select ${sql.unsafe(SPLIT_COLUMNS)} from public.entry_split_rows
    where group_id = ${groupId} and entry_date between ${from} and ${to} ${accountId ? sql`and account_id = ${accountId}` : sql``}
    order by entry_date, entry_id, split_id limit ${limit}`,
  );
}

/** Rubricas e somas por mês do ano: base do Realizado (tela e planilha). */
export async function fetchRealizedModel(db: Db, groupId: string, year: number) {
  const [categories, sums] = await Promise.all([
    rows<CategoryItem>(
      db,
      (sql) => sql`select id, name, active, code, kind, parent_id from public.categories where group_id = ${groupId}`,
    ),
    rpc(db, "realized_by_month", { p_group_id: groupId, p_year: year }),
  ]);
  return buildRealizedModel(categories, (sums ?? []) as RealizedSum[], year);
}

/** Primeira e última data com lançamentos (anos do Realizado e das exportações). */
export async function entryDateRange(db: Db, groupId: string): Promise<{ first?: string; last?: string }> {
  const range = await one<{ first: string | null; last: string | null }>(
    db,
    (sql) => sql`
    select min(entry_date) as first, max(entry_date) as last from public.ledger_entries where group_id = ${groupId}`,
  );
  return { first: range?.first ?? undefined, last: range?.last ?? undefined };
}

/** Id do grupo pelo nome (script da transparência, com o papel do dono). */
export async function groupIdByName(db: Db, name: string): Promise<string | null> {
  return (await one<{ id: string }>(db, (sql) => sql`select id from public.groups where name = ${name}`))?.id ?? null;
}
