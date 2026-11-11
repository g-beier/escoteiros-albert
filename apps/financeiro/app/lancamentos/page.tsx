import Link from "next/link";
import { redirect } from "next/navigation";
import { IconFolderExclamation } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { InfiniteEntries } from "@/components/entries/infinite-entries";
import { fetchEntryPage } from "@/lib/entry-queries";
import { EntryListProvider, NewEntryButton } from "@/components/entries/entry-editor";
import { EntryFilters } from "@/components/entries/entry-filters";
import { ExportMenu } from "@/components/export/export-menu";
import { SetupNeeded } from "@/components/setup-needed";
import { exportYears } from "@/lib/export/period";
import { canManageEntries } from "@/lib/auth";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const groupId = membership.group_id;
  const canEdit = canManageEntries(membership.role);

  const [{ data: categories }, { data: paymentMethods }, { data: associates }, firstPage, { count: pendingDocs }, { data: firstEntry }, { data: lastEntry }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id").eq("group_id", groupId),
    supabase.from("payment_methods").select("id, name, active").eq("group_id", groupId).order("name"),
    supabase.from("associates").select("id, name, active").eq("group_id", groupId).order("name"),
    fetchEntryPage(supabase, groupId, byCategory ? "rubricas" : "extrato", filters, order, 0, true),
    supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("document_filed", false),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date").limit(1).maybeSingle(),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const years = exportYears(firstEntry?.entry_date, lastEntry?.entry_date);
  const tree = sortCategories((categories ?? []) as CategoryItem[]);
  const dimensions: FilterDimensions = {
    forma: { label: "Forma pgto", options: toOptions(paymentMethods) },
    pasta: { label: "Documentos", options: [{ value: "pendente", label: "Pendente" }, { value: "na-pasta", label: "Arquivado" }] },
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

  const tab = (active: boolean) => `rounded-full px-3 py-1 text-xs font-semibold transition-colors ${active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`;

  return <div className="shell shell-workspace">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/lancamentos" wide />
    <main className="workspace">
      <FilterOptionsProvider dimensions={dimensions}>
      <EntryListProvider canEdit={canEdit} returnQuery={returnQuery}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="m-0 text-xl leading-tight font-bold tracking-tight">Lançamentos</h1>
          <nav aria-label="Visões" className="inline-flex rounded-full bg-secondary p-0.5">
            <Link aria-current={!byCategory ? "page" : undefined} className={tab(!byCategory)} href={viewHref("extrato")}>Por extrato</Link>
            <Link aria-current={byCategory ? "page" : undefined} className={tab(byCategory)} href={viewHref("rubricas")}>Por rubrica</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {(pendingDocs ?? 0) > 0 && filters.folder !== "pendente" && <Link href={`/lancamentos?pasta=pendente&de=${ALL_DATES}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#f5eed1] px-3 py-1 text-xs font-semibold text-[#725d0d] hover:ring-1 hover:ring-current"><IconFolderExclamation className="size-4" aria-hidden /> {pendingDocs} {pendingDocs === 1 ? "documento pendente" : "documentos pendentes"}</Link>}
            <ExportMenu view={byCategory ? "rubricas" : "extrato"} from={filters.from} to={filters.to} years={years} />
            {canEdit && <NewEntryButton returnQuery={returnQuery} />}
          </div>
        </div>
        <EntryFilters />
        <section aria-label={byCategory ? "Rateios por rubrica" : "Movimentações do extrato"} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          <InfiniteEntries key={returnQuery} initial={firstPage} query={returnQuery} filtered={filtered} order={order} sortHref={sortHref} />
        </section>
      </EntryListProvider>
      </FilterOptionsProvider>
    </main>
  </div>;
}
