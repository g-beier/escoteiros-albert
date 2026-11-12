import type { SupabaseClient } from "@supabase/supabase-js";
import { SPLIT_COLUMNS, LEDGER_COLUMNS, type SplitRow, type LedgerRow } from "@/lib/entry-queries";
import type { Period } from "./period";

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

export function fetchAllLedgerRows(supabase: SupabaseClient, groupId: string, { from, to }: Period) {
  return fetchAll<LedgerRow>((start, end) => supabase.from("ledger_entry_rows").select(LEDGER_COLUMNS)
    .eq("group_id", groupId).gte("entry_date", from).lte("entry_date", to)
    .order("entry_date").order("created_at").order("entry_id")
    .range(start, end));
}

export function fetchAllSplitRows(supabase: SupabaseClient, groupId: string, { from, to }: Period) {
  return fetchAll<SplitRow>((start, end) => supabase.from("entry_split_rows").select(SPLIT_COLUMNS)
    .eq("group_id", groupId).gte("entry_date", from).lte("entry_date", to)
    .order("entry_date").order("entry_id").order("split_id")
    .range(start, end));
}
