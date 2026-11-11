import type { SupabaseClient } from "@supabase/supabase-js";
import { likePattern, type EntryFilters, type SortOrder } from "@/lib/filters";

export const PAGE_SIZE = 100;

export type EntryView = "extrato" | "rubricas";

export type StatementRow = {
  entry_id: string;
  entry_date: string;
  name: string;
  account_name: string;
  payment_method_name: string;
  document: string | null;
  document_filed: boolean;
  total_cents: number;
};

export type SplitRow = {
  split_id: string;
  entry_id: string;
  entry_date: string;
  entry_name: string;
  account_name: string;
  payment_method_name: string;
  document: string | null;
  document_filed: boolean;
  amount_cents: number;
  description: string;
  category_name: string;
  category_code: string | null;
  category_kind: "receita" | "despesa" | null;
  associate_name: string | null;
};

export type EntryPage =
  | { view: "extrato"; rows: StatementRow[]; total: number | null; error?: string }
  | { view: "rubricas"; rows: SplitRow[]; total: number | null; error?: string };

export const STATEMENT_COLUMNS = "entry_id, entry_date, name, account_name, payment_method_name, document, document_filed, total_cents";
export const SPLIT_COLUMNS = "split_id, entry_id, entry_date, entry_name, account_name, payment_method_name, document, document_filed, amount_cents, description, category_name, category_code, category_kind, associate_name";

// IDs chegam validados como UUID por parseFilters, então podem compor filtros `or` com segurança.

/**
 * Uma página da lista, por deslocamento. A ordenação é total (data, criação, id) para
 * que páginas consecutivas não repitam nem pulem linhas; o cliente ainda descarta duplicados
 * caso algo seja lançado durante a rolagem.
 */
export async function fetchEntryPage(
  supabase: SupabaseClient, groupId: string, view: EntryView, filters: EntryFilters, order: SortOrder, offset: number, withTotal: boolean,
): Promise<EntryPage> {
  const ascending = order === "asc";
  const range = [offset, offset + PAGE_SIZE - 1] as const;
  const count = withTotal ? "exact" as const : undefined;

  if (view === "rubricas") {
    let query = supabase.from("entry_split_rows")
      .select(SPLIT_COLUMNS, { count })
      .eq("group_id", groupId);
    if (filters.from) query = query.gte("entry_date", filters.from);
    if (filters.to) query = query.lte("entry_date", filters.to);
    if (filters.accountIds.length) query = query.in("account_id", filters.accountIds);
    if (filters.paymentMethodIds.length) query = query.in("payment_method_id", filters.paymentMethodIds);
    if (filters.folder) query = query.eq("document_filed", filters.folder === "na-pasta");
    if (filters.associateIds.length && filters.withoutAssociate) query = query.or(`associate_id.is.null,associate_id.in.(${filters.associateIds.join(",")})`);
    else if (filters.associateIds.length) query = query.in("associate_id", filters.associateIds);
    else if (filters.withoutAssociate) query = query.is("associate_id", null);
    if (filters.categoryIds.length) query = query.in("category_id", filters.categoryIds);
    if (filters.q) query = query.ilike("search_text", likePattern(filters.q));
    const { data, error, count: total } = await query
      .order("entry_date", { ascending }).order("entry_id", { ascending }).order("split_id", { ascending })
      .range(...range);
    return { view, rows: (data ?? []) as SplitRow[], total: total ?? null, error: error?.message };
  }

  let query = supabase.from("ledger_entry_rows")
    .select(STATEMENT_COLUMNS, { count })
    .eq("group_id", groupId);
  if (filters.from) query = query.gte("entry_date", filters.from);
  if (filters.to) query = query.lte("entry_date", filters.to);
  if (filters.accountIds.length) query = query.in("account_id", filters.accountIds);
  if (filters.paymentMethodIds.length) query = query.in("payment_method_id", filters.paymentMethodIds);
  if (filters.folder) query = query.eq("document_filed", filters.folder === "na-pasta");
  if (filters.associateIds.length && filters.withoutAssociate) query = query.or(`has_split_without_associate.is.true,associate_ids.ov.{${filters.associateIds.join(",")}}`);
  else if (filters.associateIds.length) query = query.overlaps("associate_ids", filters.associateIds);
  else if (filters.withoutAssociate) query = query.eq("has_split_without_associate", true);
  if (filters.categoryIds.length) query = query.overlaps("category_ids", filters.categoryIds);
  if (filters.q) query = query.ilike("search_text", likePattern(filters.q));
  const { data, error, count: total } = await query
    .order("entry_date", { ascending }).order("created_at", { ascending }).order("entry_id", { ascending })
    .range(...range);
  return { view, rows: (data ?? []) as StatementRow[], total: total ?? null, error: error?.message };
}
