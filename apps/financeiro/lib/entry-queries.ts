import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeCategorySelection } from "@/lib/categories";
import { likePattern, type EntryFilters, type SortOrder } from "@/lib/filters";

export const PAGE_SIZE = 100;

/** Movimentações: um lançamento por linha; Detalhamento: um rateio por linha. */
export type EntryView = "movimentacoes" | "detalhamento";

export type LedgerRow = {
  entry_id: string;
  entry_date: string;
  name: string;
  account_name: string;
  payment_method_name: string;
  document: string | null;
  document_filed: boolean;
  total_cents: number;
  /** Vinculado a uma linha do extrato (conciliação). */
  reconciled?: boolean;
  /** IDs OFX (FITID) das linhas do extrato vinculadas; juntam o lançamento à movimentação do banco. */
  external_ids: string[];
  /** Comprovantes anexados (entry_attachments); preenchido por fetchEntryPage. */
  attachment_count?: number;
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
  category_ledger_code: string | null;
  account_ledger_code: string | null;
  external_ids: string[];
  attachment_count?: number;
  reconciled?: boolean;
};

export type EntryPage =
  | { view: "movimentacoes"; rows: LedgerRow[]; total: number | null; error?: string }
  | { view: "detalhamento"; rows: SplitRow[]; total: number | null; error?: string };

export const LEDGER_COLUMNS = "entry_id, entry_date, name, account_name, payment_method_name, document, document_filed, total_cents, reconciled, external_ids";
export const SPLIT_COLUMNS = "split_id, entry_id, entry_date, entry_name, account_name, payment_method_name, document, document_filed, amount_cents, description, category_name, category_code, category_kind, associate_name, category_ledger_code, account_ledger_code, external_ids, reconciled";

// IDs chegam validados como UUID por parseFilters, então podem compor filtros `or` com segurança.

/**
 * Uma página da lista, por deslocamento. A ordenação é total (data, criação, id) para
 * que páginas consecutivas não repitam nem pulem linhas; o cliente ainda descarta duplicados
 * caso algo seja lançado durante a rolagem.
 */
/** IDs das rubricas do filtro (null = sem filtro). Seleção vazia vira um ID impossível, para não listar nada. */
async function resolveCategoryTokens(supabase: SupabaseClient, groupId: string, tokens: string[]): Promise<{ ids: string[] | null; error?: string }> {
  if (!tokens.length) return { ids: null };
  const { data, error } = await supabase.from("categories").select("id, parent_id").eq("group_id", groupId);
  if (error) return { ids: null, error: error.message };
  const ids = decodeCategorySelection(tokens, data ?? []);
  return { ids: ids.length ? ids : ["00000000-0000-0000-0000-000000000000"] };
}

export async function fetchEntryPage(
  supabase: SupabaseClient, groupId: string, view: EntryView, filters: EntryFilters, order: SortOrder, offset: number, withTotal: boolean,
): Promise<EntryPage> {
  const ascending = order === "asc";
  const range = [offset, offset + PAGE_SIZE - 1] as const;
  const count = withTotal ? "exact" as const : undefined;
  const { ids: categoryIds, error: categoryError } = await resolveCategoryTokens(supabase, groupId, filters.categoryTokens);
  if (categoryError) return { view, rows: [], total: null, error: categoryError };

  if (view === "detalhamento") {
    let query = supabase.from("entry_split_rows")
      .select(SPLIT_COLUMNS, { count })
      .eq("group_id", groupId);
    if (filters.from) query = query.gte("entry_date", filters.from);
    if (filters.to) query = query.lte("entry_date", filters.to);
    if (filters.accountIds.length) query = query.in("account_id", filters.accountIds);
    if (filters.paymentMethodIds.length) query = query.in("payment_method_id", filters.paymentMethodIds);
    if (filters.folder) query = query.eq("document_filed", filters.folder === "na-pasta");
    if (filters.reconciled !== undefined) query = query.eq("reconciled", filters.reconciled);
    if (filters.associateIds.length && filters.withoutAssociate) query = query.or(`associate_id.is.null,associate_id.in.(${filters.associateIds.join(",")})`);
    else if (filters.associateIds.length) query = query.in("associate_id", filters.associateIds);
    else if (filters.withoutAssociate) query = query.is("associate_id", null);
    if (categoryIds) query = query.in("category_id", categoryIds);
    if (filters.q) query = query.ilike("search_text", likePattern(filters.q));
    if (filters.ofx) query = query.contains("external_ids", [filters.ofx]);
    const { data, error, count: total } = await query
      .order("entry_date", { ascending }).order("entry_id", { ascending }).order("split_id", { ascending })
      .range(...range);
    return { view, rows: await withAttachmentCounts(supabase, (data ?? []) as SplitRow[]), total: total ?? null, error: error?.message };
  }

  let query = supabase.from("ledger_entry_rows")
    .select(LEDGER_COLUMNS, { count })
    .eq("group_id", groupId);
  if (filters.from) query = query.gte("entry_date", filters.from);
  if (filters.to) query = query.lte("entry_date", filters.to);
  if (filters.accountIds.length) query = query.in("account_id", filters.accountIds);
  if (filters.paymentMethodIds.length) query = query.in("payment_method_id", filters.paymentMethodIds);
  if (filters.folder) query = query.eq("document_filed", filters.folder === "na-pasta");
  if (filters.reconciled !== undefined) query = query.eq("reconciled", filters.reconciled);
  if (filters.associateIds.length && filters.withoutAssociate) query = query.or(`has_split_without_associate.is.true,associate_ids.ov.{${filters.associateIds.join(",")}}`);
  else if (filters.associateIds.length) query = query.overlaps("associate_ids", filters.associateIds);
  else if (filters.withoutAssociate) query = query.eq("has_split_without_associate", true);
  if (categoryIds) query = query.overlaps("category_ids", categoryIds);
  if (filters.q) query = query.ilike("search_text", likePattern(filters.q));
  if (filters.ofx) query = query.contains("external_ids", [filters.ofx]);
  const { data, error, count: total } = await query
    .order("entry_date", { ascending }).order("created_at", { ascending }).order("entry_id", { ascending })
    .range(...range);
  return { view, rows: await withAttachmentCounts(supabase, (data ?? []) as LedgerRow[]), total: total ?? null, error: error?.message };
}

/**
 * Quantos comprovantes cada lançamento da página tem (o clipe da lista). Uma consulta indexada
 * por página, fora das visões, para não pesar na busca e na contagem de `ledger_entry_rows`.
 */
async function withAttachmentCounts<T extends { entry_id: string }>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.map((row) => row.entry_id))];
  if (!ids.length) return rows;
  const { data } = await supabase.from("entry_attachments").select("entry_id").in("entry_id", ids);
  const counts = new Map<string, number>();
  for (const { entry_id } of (data ?? []) as { entry_id: string }[]) counts.set(entry_id, (counts.get(entry_id) ?? 0) + 1);
  return rows.map((row) => ({ ...row, attachment_count: counts.get(row.entry_id) ?? 0 }));
}
