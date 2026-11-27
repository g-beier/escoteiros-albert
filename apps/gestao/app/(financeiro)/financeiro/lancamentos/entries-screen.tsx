import { Link } from "@geas/ui/components/link";
import { IconBolt, IconFolderExclamation, IconHelpCircle, IconX } from "@tabler/icons-react";
import { pageSession } from "@/lib/server/session";
import { AppHeader } from "@/components/finance/app-header";
import { EntryViewTabs, PageHeader } from "@/components/finance/nav/page-header";
import { InfiniteEntries } from "@/components/finance/entries/infinite-entries";
import { countInAccount, countToReview, fetchEntryPage, listStats } from "@/lib/server/finance/entries";
import { entryCatalogs } from "@/lib/server/finance/registry";
import { associateFilterData } from "@/lib/server/finance/associates";
import { EntryListProvider, NewEntryButton } from "@/components/finance/entries/entry-editor";
import { EntryFilters } from "@/components/finance/entries/entry-filters";
import { BulkAccountBar, BulkSplitBar } from "@/components/finance/entries/bulk-account-bar";
import { PLACEHOLDER_ACCOUNT_NAME } from "@/lib/finance/accounts";
import { ExportMenu } from "@/components/finance/export/export-menu";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { exportYears } from "@/lib/finance/export/period";
import { entriesPath, listQuery } from "@/lib/finance/entries";
import type { EntryView } from "@/lib/finance/entry-rows";
import { ALL_DATES, hasAnyFilter, parseEntrySort, parseFilters, type RawSearchParams } from "@/lib/finance/filters";
import { depthOf, descendantsMap, sortCategories, type CategoryItem } from "@/lib/finance/categories";
import { FilterOptionsProvider, type FilterDimensions } from "@/components/finance/entries/filter-options";
import { EntryColumnsProvider } from "@/components/finance/entries/columns";
import { columnsCookie, hiddenEntryColumns } from "@/lib/finance/entry-columns";
import { cookies } from "next/headers";

type CatalogItem = { id: string; name: string; active: boolean };
const toOptions = (items: CatalogItem[] | null) =>
  (items ?? []).map((item) => ({ value: item.id, label: item.active ? item.name : `${item.name} (inativo)` }));

/**
 * Lista de lançamentos, compartilhada pelas visões Movimentações (um lançamento por linha) e Detalhamento
 * (um rateio por linha). Os filtros ficam na query e seguem de uma visão para a outra.
 */
export async function EntriesScreen({
  view,
  searchParams,
}: {
  view: EntryView;
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const byCategory = view === "detalhamento";
  const filters = parseFilters(params);
  const sort = parseEntrySort(params);
  /** Sentido da ordem atual (prop antiga `order` das tabelas). */
  const order = sort.dir;
  const filtered = hasAnyFilter(filters);
  const returnQuery = listQuery(params);
  const returnHref = entriesPath(view, returnQuery);
  const { user, member: membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email} />;
  const { db, groupId } = membership;
  const canEdit = membership.finance.canReview;
  const canWrite = membership.finance.canWrite;
  // ações em lote: só o Administrador do Financeiro (015)
  const canBulk = membership.finance.canAdmin;

  const hiddenColumns = hiddenEntryColumns(view, (await cookies()).get(columnsCookie(view))?.value);
  const [
    { categories, paymentMethods, accounts, associates: entryAssociates },
    firstPage,
    { pendingDocs, firstDate, lastDate },
    associates,
  ] = await Promise.all([
    entryCatalogs(db, groupId),
    fetchEntryPage(db, groupId, view, filters, sort, 0, true),
    listStats(db, groupId),
    associateFilterData(db, groupId),
  ]);
  // lançamentos digitados sem conta ficam em "A definir" (011) até serem movidos ou conciliados
  const undefinedAccount = accounts.find((account) => account.name === PLACEHOLDER_ACCOUNT_NAME);
  const [undefinedCount, toReview] = await Promise.all([
    undefinedAccount ? countInAccount(db, groupId, undefinedAccount.id) : 0,
    countToReview(db, groupId),
  ]);
  // filtro do registro rápido: fora do painel de filtros, com um "×" que o tira mantendo os demais
  const withoutReview = new URLSearchParams(returnQuery);
  withoutReview.delete("revisao");
  const onlyUndefined =
    undefinedAccount && filters.accountIds.length === 1 && filters.accountIds[0] === undefinedAccount.id;
  const years = exportYears(firstDate, lastDate);
  const tree = sortCategories(categories as CategoryItem[]);
  const dimensions: FilterDimensions = {
    conta: { label: "Conta", options: toOptions(accounts) },
    forma: { label: "Forma pgto", options: toOptions(paymentMethods) },
    pasta: {
      label: "Documentos",
      options: [
        { value: "pendente", label: "Pendente" },
        { value: "na-pasta", label: "Arquivado" },
      ],
    },
    // conciliado = tem linha do extrato vinculada, isto é, ID OFX na coluna
    conciliado: {
      label: "ID OFX",
      options: [
        { value: "sim", label: "Tem ID" },
        { value: "nao", label: "Não tem ID" },
      ],
    },
    rubrica: {
      label: "Rubrica",
      options: tree.map((c) => ({
        value: c.id,
        label: `${c.code ? `${c.code} ` : ""}${c.name}${c.active ? "" : " (inativa)"}`,
        depth: depthOf(c.code),
        tone: c.kind ?? undefined,
      })),
      descendants: descendantsMap(tree),
      hierarchy: tree.map((c) => ({ id: c.id, parent_id: c.parent_id })),
      shortcuts: [
        { label: "Só receitas", values: tree.filter((c) => c.kind === "receita").map((c) => c.id) },
        { label: "Só despesas", values: tree.filter((c) => c.kind === "despesa").map((c) => c.id) },
        { label: "Só inativas", values: tree.filter((c) => !c.active).map((c) => c.id) },
      ],
    },
  };
  const sortQuery = new URLSearchParams(returnQuery);
  // `sortHref` (prop antiga): alterna a data entre recentes e antigos primeiro
  sortQuery.delete("dir");
  if (sort.key === "data" && sort.dir === "desc") sortQuery.set("ordem", "antigos");
  else sortQuery.delete("ordem");
  const sortHref = entriesPath(view, sortQuery.toString());

  // No desktop a página não rola; só as linhas da tabela rolam, sob cabeçalhos fixos.
  // No celular (cartões) a página inteira rola; overflow-clip mantém o cabeçalho e o rodapé fixos funcionando.
  return (
    <div className="shell flex min-h-dvh flex-col overflow-clip before:hidden after:hidden md:h-dvh md:min-h-0 md:overflow-hidden">
      <AppHeader member={membership} current={`/financeiro/lancamentos/${view}`} />
      <main className="flex flex-1 flex-col gap-2.5 px-4 pt-4 pb-3 md:min-h-0">
        <FilterOptionsProvider dimensions={dimensions} associates={associates}>
          <EntryColumnsProvider view={view} hidden={hiddenColumns}>
            <EntryListProvider canEdit={canEdit} canBulk={canBulk} returnHref={returnHref}>
              <PageHeader
                title="Lançamentos"
                crumbs={[
                  { label: "Lançamentos", href: "/financeiro/lancamentos" },
                  { label: byCategory ? "Detalhamento" : "Movimentações" },
                ]}
                tabs={
                  <EntryViewTabs
                    current={view}
                    hrefs={{
                      movimentacoes: entriesPath("movimentacoes", returnQuery),
                      detalhamento: entriesPath("detalhamento", returnQuery),
                    }}
                  />
                }
                actions={
                  <>
                    {filters.toReview ? (
                      <Link
                        href={entriesPath(view, withoutReview.toString())}
                        className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-3 py-1 text-xs font-semibold text-caution hover:ring-1 hover:ring-current"
                        title="Mostrar todos os lançamentos"
                      >
                        <IconBolt className="size-4" aria-hidden /> Só os para revisar{" "}
                        <IconX className="size-3.5" aria-label="tirar o filtro" />
                      </Link>
                    ) : (
                      toReview > 0 && (
                        <Link
                          href={entriesPath(view, `revisao=para_revisar&de=${ALL_DATES}`)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-3 py-1 text-xs font-semibold text-caution hover:ring-1 hover:ring-current"
                          title={
                            canBulk
                              ? "Lançamentos do registro rápido ainda não conferidos; marque-os e use “Marcar revisados”"
                              : "Lançamentos do registro rápido ainda não conferidos; abra cada um e marque como revisado"
                          }
                        >
                          <IconBolt className="size-4" aria-hidden /> {toReview} para revisar
                        </Link>
                      )
                    )}
                    {(pendingDocs ?? 0) > 0 && filters.folder !== "pendente" && (
                      <Link
                        href={entriesPath(view, `pasta=pendente&de=${ALL_DATES}`)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-3 py-1 text-xs font-semibold text-caution hover:ring-1 hover:ring-current"
                      >
                        <IconFolderExclamation className="size-4" aria-hidden /> {pendingDocs}{" "}
                        {pendingDocs === 1 ? "documento pendente" : "documentos pendentes"}
                      </Link>
                    )}
                    <ExportMenu
                      view={view}
                      from={filters.from}
                      to={filters.to}
                      years={years}
                      accounts={toOptions(accounts)}
                    />
                    {undefinedAccount && (undefinedCount ?? 0) > 0 && !onlyUndefined && (
                      <Link
                        href={entriesPath("movimentacoes", `conta=${undefinedAccount.id}&de=${ALL_DATES}`)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground hover:ring-1 hover:ring-current"
                        title="Lançamentos sem conta definida; marque-os e escolha a conta certa"
                      >
                        <IconHelpCircle className="size-4" aria-hidden /> {undefinedCount} em “
                        {PLACEHOLDER_ACCOUNT_NAME}”
                      </Link>
                    )}
                    {canWrite && <NewEntryButton returnHref={returnHref} />}
                  </>
                }
              />
              <EntryFilters view={view} />
              {canBulk && !byCategory && (
                <BulkAccountBar
                  accounts={(accounts ?? [])
                    .filter((account) => account.active)
                    .map((account) => ({ value: account.id, label: account.name }))}
                  paymentMethods={(paymentMethods ?? [])
                    .filter((method) => method.active)
                    .map((method) => ({ value: method.id, label: method.name }))}
                />
              )}
              {canBulk && byCategory && (
                <BulkSplitBar
                  categories={categories as CategoryItem[]}
                  accounts={(accounts ?? [])
                    .filter((account) => account.active)
                    .map((account) => ({ value: account.id, label: account.name }))}
                  paymentMethods={(paymentMethods ?? [])
                    .filter((method) => method.active)
                    .map((method) => ({ value: method.id, label: method.name }))}
                  associates={(entryAssociates ?? [])
                    .filter((associate) => associate.active)
                    .map((associate) => ({ value: associate.id, label: associate.name }))}
                />
              )}
              <section
                aria-label={byCategory ? "Detalhamento" : "Movimentações"}
                className="flex flex-col overflow-clip surface md:min-h-0 md:flex-1 md:overflow-hidden"
              >
                <InfiniteEntries
                  key={returnHref}
                  initial={firstPage}
                  query={returnQuery}
                  filtered={filtered}
                  order={order}
                  sort={sort}
                  sortHref={sortHref}
                />
              </section>
            </EntryListProvider>
          </EntryColumnsProvider>
        </FilterOptionsProvider>
      </main>
    </div>
  );
}
