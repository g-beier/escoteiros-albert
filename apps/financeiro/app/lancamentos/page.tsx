import Link from "next/link";
import { IconFolderExclamation, IconHelpCircle } from "@tabler/icons-react";
import { pageSession } from "@/lib/session";
import { AppHeader } from "@/components/app-header";
import { PageHeader, SectionTabs } from "@/components/nav/page-header";
import { InfiniteEntries } from "@/components/entries/infinite-entries";
import { fetchEntryPage } from "@/lib/entry-queries";
import { EntryListProvider, NewEntryButton } from "@/components/entries/entry-editor";
import { EntryFilters } from "@/components/entries/entry-filters";
import { BulkAccountBar } from "@/components/entries/bulk-account-bar";
import { PLACEHOLDER_ACCOUNT_NAME } from "@/lib/accounts";
import { ExportMenu } from "@/components/export/export-menu";
import { SetupNeeded } from "@/components/setup-needed";
import { exportYears } from "@/lib/export/period";
import { listQuery } from "@/lib/entries";
import { ALL_DATES, hasAnyFilter, NO_ASSOCIATE, parseFilters, parseOrder, type RawSearchParams } from "@/lib/filters";
import { depthOf, descendantsMap, sortCategories, type CategoryItem } from "@/lib/categories";
import { FilterOptionsProvider, type FilterDimensions } from "@/components/entries/filter-options";


type CatalogItem = { id: string; name: string; active: boolean };
const toOptions = (items: CatalogItem[] | null) => (items ?? []).map((item) => ({ value: item.id, label: item.active ? item.name : `${item.name} (inativo)` }));

export default async function EntriesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = await searchParams;
  const byCategory = params.visao === "rubricas";
  const filters = parseFilters(params);
  const order = parseOrder(params);
  const filtered = hasAnyFilter(filters);
  const returnQuery = listQuery(params);
  const { supabase, user, member: membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const groupId = membership.groupId;
  const canEdit = membership.canEdit;

  const [{ data: categories }, { data: paymentMethods }, { data: associates }, { data: accounts }, firstPage, { count: pendingDocs }, { data: firstEntry }, { data: lastEntry }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id").eq("group_id", groupId),
    supabase.from("payment_methods").select("id, name, active").eq("group_id", groupId).order("name"),
    supabase.from("associates").select("id, name, active").eq("group_id", groupId).order("name"),
    supabase.from("accounts").select("id, name, active").eq("group_id", groupId).order("name"),
    fetchEntryPage(supabase, groupId, byCategory ? "rubricas" : "lancamentos", filters, order, 0, true),
    supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("document_filed", false),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date").limit(1).maybeSingle(),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // lançamentos digitados sem conta ficam em "A definir" (011) até serem movidos ou conciliados
  const undefinedAccount = (accounts ?? []).find((account) => account.name === PLACEHOLDER_ACCOUNT_NAME);
  const { count: undefinedCount } = undefinedAccount
    ? await supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("account_id", undefinedAccount.id)
    : { count: 0 };
  const onlyUndefined = undefinedAccount && filters.accountIds.length === 1 && filters.accountIds[0] === undefinedAccount.id;
  const years = exportYears(firstEntry?.entry_date, lastEntry?.entry_date);
  const tree = sortCategories((categories ?? []) as CategoryItem[]);
  const dimensions: FilterDimensions = {
    conta: { label: "Conta", options: toOptions(accounts) },
    forma: { label: "Forma pgto", options: toOptions(paymentMethods) },
    pasta: { label: "Documentos", options: [{ value: "pendente", label: "Pendente" }, { value: "na-pasta", label: "Arquivado" }] },
    conciliado: { label: "Conciliado", options: [{ value: "sim", label: "Conciliado" }, { value: "nao", label: "Não conciliado" }] },
    associado: { label: "Associado", options: [{ value: NO_ASSOCIATE, label: "(Sem associado)" }, ...toOptions(associates)] },
    rubrica: {
      label: "Rubrica",
      options: tree.map((c) => ({ value: c.id, label: `${c.code ? `${c.code} ` : ""}${c.name}${c.active ? "" : " (inativa)"}`, depth: depthOf(c.code), tone: c.kind ?? undefined })),
      descendants: descendantsMap(tree),
      shortcuts: [
        { label: "Só receitas", values: tree.filter((c) => c.kind === "receita").map((c) => c.id) },
        { label: "Só despesas", values: tree.filter((c) => c.kind === "despesa").map((c) => c.id) },
        { label: "Só inativas", values: tree.filter((c) => !c.active).map((c) => c.id) },
      ],
    },
  };
  const sortQuery = new URLSearchParams(returnQuery);
  if (order === "desc") sortQuery.set("ordem", "antigos"); else sortQuery.delete("ordem");
  const sortHref = `/lancamentos?${sortQuery}`;
  const viewHref = (visao: string) => { const next = new URLSearchParams(returnQuery); next.set("visao", visao); return `/lancamentos?${next}`; };

  // No desktop a página não rola; só as linhas da tabela rolam, sob cabeçalhos fixos.
  // No celular (cartões) a página inteira rola; overflow-clip mantém o cabeçalho e o rodapé fixos funcionando.
  return <div className="shell flex min-h-dvh flex-col overflow-clip before:hidden after:hidden md:h-dvh md:min-h-0 md:overflow-hidden">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/lancamentos" />
    <main className="flex flex-1 flex-col gap-2.5 px-4 pt-4 pb-3 md:min-h-0">
      <FilterOptionsProvider dimensions={dimensions}>
      <EntryListProvider canEdit={canEdit} returnQuery={returnQuery}>
        <PageHeader title="Lançamentos" crumbs={[{ label: "Lançamentos" }]}
          tabs={<SectionTabs label="Visões" tabs={[
            { href: viewHref("lancamentos"), label: "Por lançamento", active: !byCategory },
            { href: viewHref("rubricas"), label: "Por rubrica", active: byCategory },
          ]} />}
          actions={<>
            {(pendingDocs ?? 0) > 0 && filters.folder !== "pendente" && <Link href={`/lancamentos?pasta=pendente&de=${ALL_DATES}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#f5eed1] px-3 py-1 text-xs font-semibold text-[#725d0d] hover:ring-1 hover:ring-current"><IconFolderExclamation className="size-4" aria-hidden /> {pendingDocs} {pendingDocs === 1 ? "documento pendente" : "documentos pendentes"}</Link>}
            <ExportMenu view={byCategory ? "rubricas" : "lancamentos"} from={filters.from} to={filters.to} years={years} accounts={toOptions(accounts)} />
            {undefinedAccount && (undefinedCount ?? 0) > 0 && !onlyUndefined && <Link href={`/lancamentos?conta=${undefinedAccount.id}&de=${ALL_DATES}`} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground hover:ring-1 hover:ring-current" title="Lançamentos sem conta definida; marque-os e escolha a conta certa"><IconHelpCircle className="size-4" aria-hidden /> {undefinedCount} em “{PLACEHOLDER_ACCOUNT_NAME}”</Link>}
            {canEdit && <NewEntryButton returnQuery={returnQuery} />}
          </>} />
        <EntryFilters />
        {canEdit && !byCategory && <BulkAccountBar accounts={(accounts ?? []).filter((account) => account.active).map((account) => ({ value: account.id, label: account.name }))} />}
        <section aria-label={byCategory ? "Rateios por rubrica" : "Lançamentos"} className="flex flex-col overflow-clip rounded-lg border bg-card md:min-h-0 md:flex-1 md:overflow-hidden">
          <InfiniteEntries key={returnQuery} initial={firstPage} query={returnQuery} filtered={filtered} order={order} sortHref={sortHref} />
        </section>
      </EntryListProvider>
      </FilterOptionsProvider>
    </main>
  </div>;
}
