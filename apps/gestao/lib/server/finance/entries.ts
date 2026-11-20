import { decodeCategorySelection } from "@/lib/finance/categories";
import { LEDGER_COLUMNS, PAGE_SIZE, SPLIT_COLUMNS, type EntryPage, type EntryView, type LedgerRow, type SplitRow } from "@/lib/finance/entry-rows";
import type { EditableEntry } from "@/lib/finance/entries";
import { likePattern, type EntryFilters, type EntrySort, type EntrySortKey } from "@/lib/finance/filters";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, untyped, unwrap } from "@/lib/server/supabase/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTACHMENT_BUCKET } from "@/lib/finance/attachments";
import { ATTACHMENTS_ENABLED } from "@/lib/features";
import type { AuditRow } from "@/lib/finance/entry-history";
import { toRpcSplits, type EntryInput } from "@/lib/finance/entry-schema";
import { removeFiles } from "@/lib/server/files";
import { pathsForEntry } from "./attachments";
import { associateFilterData } from "./associates";
import { expandDivisionTokens } from "@/lib/finance/associate-filter";

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

/**
 * Associados do filtro: os escolhidos por nome (`associado`) mais os ativos das divisões marcadas (`divisao`, expandidas
 * pela divisão atual), e se entram rateios sem associado (`associado=nenhum` antigo ou `divisao=nenhum`).
 * Divisões que não cobrem ninguém (e sem "(Sem associado)") viram um ID impossível, para não listar nada.
 */
async function resolveAssociateIds(db: Db, groupId: string, filters: EntryFilters): Promise<{ ids: string[]; withoutAssociate: boolean }> {
  if (!filters.divisionTokens?.length) return { ids: filters.associateIds, withoutAssociate: filters.withoutAssociate };
  const division = expandDivisionTokens(filters.divisionTokens, await associateFilterData(db, groupId));
  const ids = [...new Set([...filters.associateIds, ...division.associateIds])];
  const withoutAssociate = filters.withoutAssociate || division.withoutAssociate;
  return { ids: ids.length || withoutAssociate ? ids : ["00000000-0000-0000-0000-000000000000"], withoutAssociate };
}

/** Uma página da lista (Movimentações ou Detalhamento) com os filtros e a ordem pedidos. */
export async function fetchEntryPage(
  db: Db, groupId: string, view: EntryView, filters: EntryFilters, sort: EntrySort, offset: number, withTotal: boolean,
): Promise<EntryPage> {
  const supabase = untyped(db);
  const ascending = sort.dir === "asc";
  // coluna escolhida primeiro; desempate estável por data (e id) no sentido padrão (mais recentes primeiro),
  // salvo quando a própria ordem é por data. A ordem é total, então o deslocamento não repete nem pula linhas.
  const tieAscending = sort.key === "data" ? ascending : false;
  const sortColumn = (columns: Record<Exclude<EntrySortKey, "data">, string>) => sort.key === "data" ? null : columns[sort.key];
  const range = [offset, offset + PAGE_SIZE - 1] as const;
  const count = withTotal ? "exact" as const : undefined;
  const { ids: categoryIds, error: categoryError } = await resolveCategoryTokens(supabase, groupId, filters.categoryTokens);
  if (categoryError) return { view, rows: [], total: null, error: categoryError };
  const { ids: associateIds, withoutAssociate } = await resolveAssociateIds(db, groupId, filters);

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
    if (associateIds.length && withoutAssociate) query = query.or(`associate_id.is.null,associate_id.in.(${associateIds.join(",")})`);
    else if (associateIds.length) query = query.in("associate_id", associateIds);
    else if (withoutAssociate) query = query.is("associate_id", null);
    if (categoryIds) query = query.in("category_id", categoryIds);
    if (filters.q) query = query.ilike("search_text", likePattern(filters.q));
    if (filters.ofx) query = query.contains("external_ids", [filters.ofx]);
    if (filters.minCents !== undefined) query = query.gte("amount_cents", filters.minCents);
    if (filters.maxCents !== undefined) query = query.lte("amount_cents", filters.maxCents);
    if (filters.toReview) query = query.eq("review_status", "para_revisar");
    const column = sortColumn({ historico: "entry_name", conta: "account_name", forma: "payment_method_name", valor: "amount_cents" });
    if (column) query = query.order(column, { ascending, nullsFirst: false });
    const { data, error, count: total } = await query
      .order("entry_date", { ascending: tieAscending }).order("entry_id", { ascending: tieAscending }).order("split_id", { ascending: tieAscending })
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
  if (associateIds.length && withoutAssociate) query = query.or(`has_split_without_associate.is.true,associate_ids.ov.{${associateIds.join(",")}}`);
  else if (associateIds.length) query = query.overlaps("associate_ids", associateIds);
  else if (withoutAssociate) query = query.eq("has_split_without_associate", true);
  if (categoryIds) query = query.overlaps("category_ids", categoryIds);
  if (filters.q) query = query.ilike("search_text", likePattern(filters.q));
  if (filters.ofx) query = query.contains("external_ids", [filters.ofx]);
  if (filters.minCents !== undefined) query = query.gte("total_cents", filters.minCents);
  if (filters.maxCents !== undefined) query = query.lte("total_cents", filters.maxCents);
  if (filters.toReview) query = query.eq("review_status", "para_revisar");
  const column = sortColumn({ historico: "name", conta: "account_name", forma: "payment_method_name", valor: "total_cents" });
  if (column) query = query.order(column, { ascending, nullsFirst: false });
  const { data, error, count: total } = await query
    .order("entry_date", { ascending: tieAscending }).order("created_at", { ascending: tieAscending }).order("entry_id", { ascending: tieAscending })
    .range(...range);
  return { view, rows: await withAttachmentCounts(supabase, (data ?? []) as LedgerRow[]), total: total ?? null, error: error?.message };
}

/**
 * Quantos comprovantes cada lançamento da página tem (o clipe da lista). Uma consulta indexada
 * por página, fora das visões, para não pesar na busca e na contagem de `ledger_entry_rows`.
 */
async function withAttachmentCounts<T extends { entry_id: string }>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  if (!ATTACHMENTS_ENABLED) return rows;
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
    .select("id, entry_date, name, payment_method_id, account_id, document, document_filed, notes, total_cents, created_at, updated_at, review_status, entry_splits(id, category_id, amount_cents, description, associate_id, created_at)")
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
    toReview: data.review_status === "para_revisar",
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

/** Lançamentos do registro rápido ainda não revisados (049). */
export async function countToReview(db: Db, groupId: string): Promise<number> {
  const { count } = await untyped(db).from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("review_status", "para_revisar");
  return count ?? 0;
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

/** Lançamento do registro rápido (049): uma rubrica, conta padrão da forma ou "A definir"; fica para revisar. */
export type QuickEntryInput = { date: string; name: string; paymentMethodId: string; totalCents: number; categoryId: string; description: string | null; notes: string | null };

export async function createQuick(db: Db, groupId: string, input: QuickEntryInput): Promise<string> {
  return await rpc(db, "create_quick_ledger_entry", {
    p_group_id: groupId, p_entry_date: input.date, p_name: input.name, p_payment_method_id: input.paymentMethodId, p_total_cents: input.totalCents,
    p_category_id: input.categoryId, p_description: input.description ?? undefined, p_notes: input.notes ?? undefined,
  }) as string;
}

/** Marca como revisados; devolve quantos estavam para revisar. */
export async function review(db: Db, groupId: string, entryIds: string[]): Promise<number> {
  return await rpc(db, "review_ledger_entries", { p_group_id: groupId, p_entry_ids: entryIds }) as number;
}

/** Move vários lançamentos para outra conta; conciliados perdem o vínculo. */
export async function moveToAccount(db: Db, entryIds: string[], accountId: string) {
  return await rpc(db, "move_ledger_entries_account", { p_entry_ids: entryIds, p_account_id: accountId }) as unknown as { moved: number; unchanged: number; unlinked: number };
}
