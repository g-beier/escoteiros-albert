import type { Db } from "@/lib/server/db";
import { untyped, unwrap } from "@/lib/server/supabase/db";
import { SPLIT_COLUMNS, LEDGER_COLUMNS, type SplitRow, type LedgerRow } from "@/lib/finance/entry-rows";
import type { CategoryItem } from "@/lib/finance/categories";
import type { Period } from "@/lib/finance/export/period";
import { buildRealizedModel, type RealizedSum } from "@/lib/finance/export/realized";

const BATCH = 1000;
/** Teto de segurança para uma planilha; acima disso, pedir um período menor. */
export const MAX_EXPORT_ROWS = 50_000;

export class ExportTooLargeError extends Error {
  constructor() { super(`O período tem mais de ${MAX_EXPORT_ROWS.toLocaleString("pt-BR")} linhas. Escolha um período menor.`); }
}

/** Lê todas as linhas do período (limites inclusivos) em lotes, na ordem cronológica. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += BATCH) {
    const { data, error } = await page(offset, offset + BATCH - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (rows.length > MAX_EXPORT_ROWS) throw new ExportTooLargeError();
    if (!data || data.length < BATCH) return rows;
  }
}

export function fetchAllLedgerRows(db: Db, groupId: string, { from, to }: Period) {
  const supabase = untyped(db);
  return fetchAll<LedgerRow>((start, end) => supabase.from("ledger_entry_rows").select(LEDGER_COLUMNS)
    .eq("group_id", groupId).gte("entry_date", from).lte("entry_date", to)
    .order("entry_date").order("created_at").order("entry_id")
    .range(start, end));
}

/** Rateios do período; `accountId` restringe a uma conta (exportação contábil por conta). */
export function fetchAllSplitRows(db: Db, groupId: string, { from, to }: Period, accountId?: string) {
  const supabase = untyped(db);
  return fetchAll<SplitRow>((start, end) => {
    let query = supabase.from("entry_split_rows").select(SPLIT_COLUMNS)
      .eq("group_id", groupId).gte("entry_date", from).lte("entry_date", to);
    if (accountId) query = query.eq("account_id", accountId);
    return query.order("entry_date").order("entry_id").order("split_id").range(start, end);
  });
}

/** Rubricas e somas por mês do ano: base do Realizado (tela e planilha). */
export async function fetchRealizedModel(db: Db, groupId: string, year: number) {
  const supabase = untyped(db);
  const [{ data: categories, error: categoriesError }, { data: sums, error: sumsError }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id").eq("group_id", groupId),
    supabase.rpc("realized_by_month", { p_group_id: groupId, p_year: year }),
  ]);
  const error = categoriesError ?? sumsError;
  if (error) throw new Error(error.message);
  return buildRealizedModel((categories ?? []) as CategoryItem[], (sums ?? []) as RealizedSum[], year);
}

/** Primeira e última data com lançamentos (anos do Realizado e das exportações). */
export async function entryDateRange(db: Db, groupId: string): Promise<{ first?: string; last?: string }> {
  const supabase = untyped(db);
  const [first, last] = await Promise.all([
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date").limit(1).maybeSingle().then(unwrap),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date", { ascending: false }).limit(1).maybeSingle().then(unwrap),
  ]);
  return { first: (first as { entry_date: string } | null)?.entry_date, last: (last as { entry_date: string } | null)?.entry_date };
}

/** Id do grupo pelo nome (script da transparência, com a chave de serviço). */
export async function groupIdByName(db: Db, name: string): Promise<string | null> {
  return ((unwrap(await untyped(db).from("groups").select("id").eq("name", name).maybeSingle())) as { id: string } | null)?.id ?? null;
}
