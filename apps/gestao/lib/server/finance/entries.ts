import { decodeCategorySelection } from "@/lib/finance/categories";
import { LEDGER_COLUMNS, PAGE_SIZE, SPLIT_COLUMNS, type EntryPage, type EntryView, type LedgerRow, type SplitRow } from "@/lib/finance/entry-rows";
import type { EditableEntry } from "@/lib/finance/entries";
import { likePattern, type EntryFilters, type EntrySort, type EntrySortKey } from "@/lib/finance/filters";
import type { Db } from "@/lib/server/db";
import { count, one, rows, rpc, run, where, type Tx } from "@/lib/server/pg/db";
import { ATTACHMENT_BUCKET } from "@/lib/finance/attachments";
import { ATTACHMENTS_ENABLED } from "@/lib/features";
import type { AuditRow } from "@/lib/finance/entry-history";
import { toRpcSplits, type EntryInput } from "@/lib/finance/entry-schema";
import { removeFiles } from "@/lib/server/files";
import { pathsForEntry } from "./attachments";
import { associateFilterData } from "./associates";
import { expandDivisionTokens } from "@/lib/finance/associate-filter";

// Lançamentos: listas paginadas (Movimentações, Detalhamento) e um lançamento para edição.

const NO_ID = "00000000-0000-0000-0000-000000000000";

/** IDs das rubricas do filtro (null = sem filtro). Seleção vazia vira um ID impossível, para não listar nada. */
async function resolveCategoryTokens(db: Db, groupId: string, tokens: string[]): Promise<string[] | null> {
  if (!tokens.length) return null;
  const categories = await rows<{ id: string; parent_id: string | null }>(db, (sql) => sql`select id, parent_id from public.categories where group_id = ${groupId}`);
  const ids = decodeCategorySelection(tokens, categories);
  return ids.length ? ids : [NO_ID];
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
  return { ids: ids.length || withoutAssociate ? ids : [NO_ID], withoutAssociate };
}

/** Uma página da lista (Movimentações ou Detalhamento) com os filtros e a ordem pedidos. */
export async function fetchEntryPage(
  db: Db, groupId: string, view: EntryView, filters: EntryFilters, sort: EntrySort, offset: number, withTotal: boolean,
): Promise<EntryPage> {
  // coluna escolhida primeiro; desempate estável por data (e id) no sentido padrão (mais recentes primeiro),
  // salvo quando a própria ordem é por data. A ordem é total, então o deslocamento não repete nem pula linhas.
  const tieDir = (sql: Tx) => (sort.key === "data" && sort.dir === "asc" ? sql`asc` : sql`desc`);
  const sortColumn = (columns: Record<Exclude<EntrySortKey, "data">, string>) => sort.key === "data" ? null : columns[sort.key];
  try {
    const categoryIds = await resolveCategoryTokens(db, groupId, filters.categoryTokens);
    const { ids: associateIds, withoutAssociate } = await resolveAssociateIds(db, groupId, filters);
    const detail = view === "detalhamento";

    // filtros comuns às duas visões; associado e rubrica mudam (por rateio × por lançamento)
    const conditions = (sql: Tx) => where(sql, [
      sql`group_id = ${groupId}`,
      filters.from && sql`entry_date >= ${filters.from}`,
      filters.to && sql`entry_date <= ${filters.to}`,
      filters.accountIds.length > 0 && sql`account_id = any(${filters.accountIds}::uuid[])`,
      filters.paymentMethodIds.length > 0 && sql`payment_method_id = any(${filters.paymentMethodIds}::uuid[])`,
      filters.folder && sql`document_filed = ${filters.folder === "na-pasta"}`,
      filters.reconciled !== undefined && sql`reconciled = ${filters.reconciled}`,
      detail
        ? (associateIds.length && withoutAssociate ? sql`(associate_id is null or associate_id = any(${associateIds}::uuid[]))`
          : associateIds.length ? sql`associate_id = any(${associateIds}::uuid[])`
            : withoutAssociate && sql`associate_id is null`)
        : (associateIds.length && withoutAssociate ? sql`(has_split_without_associate or associate_ids && ${associateIds}::uuid[])`
          : associateIds.length ? sql`associate_ids && ${associateIds}::uuid[]`
            : withoutAssociate && sql`has_split_without_associate`),
      categoryIds && (detail ? sql`category_id = any(${categoryIds}::uuid[])` : sql`category_ids && ${categoryIds}::uuid[]`),
      filters.q && sql`search_text ilike ${likePattern(filters.q)}`,
      filters.ofx && sql`external_ids @> ${[filters.ofx]}::text[]`,
      filters.minCents !== undefined && sql`${sql(detail ? "amount_cents" : "total_cents")} >= ${filters.minCents}`,
      filters.maxCents !== undefined && sql`${sql(detail ? "amount_cents" : "total_cents")} <= ${filters.maxCents}`,
      filters.toReview && sql`review_status = 'para_revisar'`,
    ]);
    const column = detail
      ? sortColumn({ historico: "entry_name", conta: "account_name", forma: "payment_method_name", valor: "amount_cents" })
      : sortColumn({ historico: "name", conta: "account_name", forma: "payment_method_name", valor: "total_cents" });

    const { data, total } = await run(db, async (sql) => {
      const first = column ? sql`${sql(column)} ${sort.dir === "asc" ? sql`asc` : sql`desc`} nulls last,` : sql``;
      const order = detail
        ? sql`order by ${first} entry_date ${tieDir(sql)}, entry_id ${tieDir(sql)}, split_id ${tieDir(sql)}`
        : sql`order by ${first} entry_date ${tieDir(sql)}, created_at ${tieDir(sql)}, entry_id ${tieDir(sql)}`;
      const source = detail ? sql`public.entry_split_rows` : sql`public.ledger_entry_rows`;
      const columns = sql.unsafe(detail ? SPLIT_COLUMNS : LEDGER_COLUMNS);
      const page = await sql`select ${columns} from ${source} ${conditions(sql)} ${order} limit ${PAGE_SIZE} offset ${offset}`;
      const counted = withTotal ? await sql`select count(*) as n from ${source} ${conditions(sql)}` : null;
      return { data: [...page], total: counted ? Number(counted[0].n) : null };
    });
    return detail
      ? { view, rows: await withAttachmentCounts(db, data as SplitRow[]), total }
      : { view, rows: await withAttachmentCounts(db, data as LedgerRow[]), total };
  } catch (error) {
    return { view, rows: [], total: null, error: (error as Error).message };
  }
}

/**
 * Quantos comprovantes cada lançamento da página tem (o clipe da lista). Uma consulta indexada
 * por página, fora das visões, para não pesar na busca e na contagem de `ledger_entry_rows`.
 */
async function withAttachmentCounts<T extends { entry_id: string }>(db: Db, list: T[]): Promise<T[]> {
  if (!ATTACHMENTS_ENABLED) return list;
  const ids = [...new Set(list.map((row) => row.entry_id))];
  if (!ids.length) return list;
  const counts = new Map((await rows<{ entry_id: string; n: number }>(db, (sql) =>
    sql`select entry_id, count(*) as n from public.entry_attachments where entry_id = any(${ids}::uuid[]) group by entry_id`))
    .map((row) => [row.entry_id, Number(row.n)]));
  return list.map((row) => ({ ...row, attachment_count: counts.get(row.entry_id) ?? 0 }));
}

type EntrySplitRow = { category_id: string; amount_cents: number; description: string; associate_id: string | null; created_at: string; id: string };

/** Carrega um lançamento com seus rateios na ordem em que foram gravados (RLS restringe ao grupo). */
export async function fetchEntry(db: Db, id: string): Promise<EditableEntry | null> {
  const data = await one<{
    id: string; entry_date: string; name: string; payment_method_id: string; account_id: string; document: string | null; document_filed: boolean;
    notes: string | null; total_cents: number; created_at: string; updated_at: string; review_status: string; entry_splits: EntrySplitRow[];
  }>(db, (sql) => sql`
    select e.id, e.entry_date, e.name, e.payment_method_id, e.account_id, e.document, e.document_filed, e.notes, e.total_cents, e.created_at,
      e.updated_at, e.review_status,
      coalesce((select json_agg(json_build_object('id', s.id, 'category_id', s.category_id, 'amount_cents', s.amount_cents,
        'description', s.description, 'associate_id', s.associate_id, 'created_at', s.created_at))
        from public.entry_splits s where s.entry_id = e.id), '[]') as entry_splits
    from public.ledger_entries e where e.id = ${id}`);
  if (!data) return null;
  const splits = [...data.entry_splits].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
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
  return rows<LinkedLine>(db, (sql) => sql`
    select statement_line_id, line_date, line_description, line_kind, line_counterparty, line_amount_cents, line_external_id, line_trn_type
    from public.reconciliation_link_rows where ledger_entry_id = ${entryId} order by line_date`);
}

/** Trilha de auditoria do lançamento (ledger_entry_history). */
export async function history(db: Db, entryId: string): Promise<AuditRow[]> {
  return ((await rpc(db, "ledger_entry_history", { p_entry_id: entryId })) ?? []) as unknown as AuditRow[];
}

// Lista ---------------------------------------------------------------------------------------------

/** Números da tela de lista: documentos pendentes, primeira e última data (anos da exportação). */
export async function listStats(db: Db, groupId: string) {
  const stats = await one<{ pending: number; first: string | null; last: string | null }>(db, (sql) => sql`
    select count(*) filter (where not document_filed) as pending, min(entry_date) as first, max(entry_date) as last
    from public.ledger_entries where group_id = ${groupId}`);
  return { pendingDocs: stats?.pending ?? 0, firstDate: stats?.first ?? undefined, lastDate: stats?.last ?? undefined };
}

/** Lançamentos do registro rápido ainda não revisados (049). */
export async function countToReview(db: Db, groupId: string): Promise<number> {
  return count(db, (sql) => sql`select count(*) from public.ledger_entries where group_id = ${groupId} and review_status = 'para_revisar'`);
}

/** Quantos lançamentos estão numa conta (ex.: "A definir"). */
export async function countInAccount(db: Db, groupId: string, accountId: string): Promise<number> {
  return count(db, (sql) => sql`select count(*) from public.ledger_entries where group_id = ${groupId} and account_id = ${accountId}`);
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
