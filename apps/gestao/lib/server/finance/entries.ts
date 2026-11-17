import { decodeCategorySelection } from "@/lib/finance/categories";
import { LEDGER_COLUMNS, PAGE_SIZE, SPLIT_COLUMNS, type EntryPage, type EntryView, type LedgerRow, type SplitRow } from "@/lib/finance/entry-rows";
import type { EditableEntry } from "@/lib/finance/entries";
import { likePattern, type EntryFilters, type SortOrder } from "@/lib/finance/filters";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, untyped, unwrap } from "@/lib/server/supabase/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTACHMENT_BUCKET } from "@/lib/finance/attachments";
import type { AuditRow } from "@/lib/finance/entry-history";
import { toRpcSplits, type EntryInput } from "@/lib/finance/entry-schema";
import { removeFiles } from "@/lib/server/files";
import { pathsForEntry } from "./attachments";

// Lançamentos: listas paginadas (Movimentações, Detalhamento) e um lançamento para edição.

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

/** Uma página da lista (Movimentações ou Detalhamento) com os filtros e a ordem pedidos. */
export async function fetchEntryPage(
  db: Db, groupId: string, view: EntryView, filters: EntryFilters, order: SortOrder, offset: number, withTotal: boolean,
): Promise<EntryPage> {
  const supabase = untyped(db);
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

type EntrySplitRow = { category_id: string; amount_cents: number; description: string; associate_id: string | null; created_at: string; id: string };

/** Carrega um lançamento com seus rateios na ordem em que foram gravados (RLS restringe ao grupo). */
export async function fetchEntry(db: Db, id: string): Promise<EditableEntry | null> {
  const { data } = await untyped(db).from("ledger_entries")
    .select("id, entry_date, name, payment_method_id, account_id, document, document_filed, notes, total_cents, created_at, updated_at, entry_splits(id, category_id, amount_cents, description, associate_id, created_at)")
    .eq("id", id).maybeSingle();
  if (!data) return null;
  const splits = [...(data.entry_splits as EntrySplitRow[])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return {
    id: data.id,
    date: data.entry_date,
    name: data.name,
    paymentMethodId: data.payment_method_id,
    accountId: data.account_id,
    document: data.document ?? "",
    documentFiled: data.document_filed,
    notes: data.notes ?? "",
    totalCents: data.total_cents,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    splits: splits.map((s) => ({ categoryId: s.category_id, amountCents: s.amount_cents, description: s.description, associateId: s.associate_id })),
  };
}

// Detalhe do lançamento ---------------------------------------------------------------------------

export type LinkedLine = {
  statement_line_id: string; line_date: string; line_description: string; line_kind: string | null; line_counterparty: string | null;
  line_amount_cents: number; line_external_id: string | null; line_trn_type: string | null;
};

/** Linhas do extrato conciliadas com o lançamento. */
export async function linkedStatementLines(db: Db, entryId: string): Promise<LinkedLine[]> {
  return rowsOf(await untyped(db).from("reconciliation_link_rows")
    .select("statement_line_id, line_date, line_description, line_kind, line_counterparty, line_amount_cents, line_external_id, line_trn_type")
    .eq("ledger_entry_id", entryId).order("line_date")) as LinkedLine[];
}

/** Trilha de auditoria do lançamento (ledger_entry_history). */
export async function history(db: Db, entryId: string): Promise<AuditRow[]> {
  return ((await rpc(db, "ledger_entry_history", { p_entry_id: entryId })) ?? []) as unknown as AuditRow[];
}

// Lista ---------------------------------------------------------------------------------------------

/** Números da tela de lista: documentos pendentes, primeira e última data (anos da exportação). */
export async function listStats(db: Db, groupId: string) {
  const supabase = untyped(db);
  const [pending, first, last] = await Promise.all([
    supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("document_filed", false),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date").limit(1).maybeSingle().then(unwrap),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date", { ascending: false }).limit(1).maybeSingle().then(unwrap),
  ]);
  return { pendingDocs: pending.count ?? 0, firstDate: (first as { entry_date: string } | null)?.entry_date, lastDate: (last as { entry_date: string } | null)?.entry_date };
}

/** Quantos lançamentos estão numa conta (ex.: "A definir"). */
export async function countInAccount(db: Db, groupId: string, accountId: string): Promise<number> {
  const { count } = await untyped(db).from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("account_id", accountId);
  return count ?? 0;
}

// Escritas (funções auditadas de lançamentos) ---------------------------------------------------------

const entryArgs = (input: EntryInput) => ({
  p_entry_date: input.date, p_name: input.name, p_payment_method_id: input.paymentMethodId, p_account_id: input.accountId,
  p_document: input.document || null, p_document_filed: input.documentFiled, p_total_cents: input.totalCents,
  p_splits: toRpcSplits(input.splits), p_notes: input.notes?.trim() || null,
});

/** Cria o lançamento com os rateios numa transação; devolve o id. */
export async function create(db: Db, groupId: string, input: EntryInput): Promise<string> {
  return await rpc(db, "create_ledger_entry", { p_group_id: groupId, ...entryArgs(input) }) as string;
}

export async function update(db: Db, entryId: string, input: EntryInput) {
  await rpc(db, "update_ledger_entry", { p_entry_id: entryId, ...entryArgs(input) });
}

/** Exclui o lançamento; os comprovantes saem em cascata e os arquivos são apagados depois (falha só no log). */
export async function remove(db: Db, entryId: string) {
  const paths = await pathsForEntry(db, entryId);
  await rpc(db, "delete_ledger_entry", { p_entry_id: entryId });
  await removeFiles(db, ATTACHMENT_BUCKET, paths).catch((error) => console.error("remover anexos do lançamento excluído", entryId, (error as Error).message));
}

export async function setDocumentFiled(db: Db, entryId: string, filed: boolean) {
  await rpc(db, "set_entry_document_filed", { p_entry_id: entryId, p_filed: filed });
}

/** Move vários lançamentos para outra conta; conciliados perdem o vínculo. */
export async function moveToAccount(db: Db, entryIds: string[], accountId: string) {
  return await rpc(db, "move_ledger_entries_account", { p_entry_ids: entryIds, p_account_id: accountId }) as unknown as { moved: number; unchanged: number; unlinked: number };
}
