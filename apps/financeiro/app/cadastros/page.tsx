import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { CatalogManager } from "@/components/catalog-manager";
import { canManageEntries } from "@/lib/auth";
import { CATALOG_KINDS } from "@/lib/catalogs";
import { depthOf, descendantsMap, sortCategories, type CategoryItem } from "@/lib/categories";

type Row = { id: string; name: string; active: boolean; usage: { count: number }[] };

export default async function CatalogsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!membership) redirect("/");
  const canEdit = canManageEntries(membership.role);
  if (!canEdit) notFound();

  const [{ data: categories }, { data: paymentMethods }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id, usage:entry_splits(count)").eq("group_id", membership.group_id),
    supabase.from("payment_methods").select("id, name, active, usage:ledger_entries(count)").eq("group_id", membership.group_id).order("active", { ascending: false }).order("name"),
  ]);
  const normalize = (rows: Row[] | null) => (rows ?? []).map((row) => ({ id: row.id, name: row.name, active: row.active, usage: row.usage?.[0]?.count ?? 0 }));

  const tree = sortCategories((categories ?? []) as (CategoryItem & { usage: { count: number }[] })[]);
  const descendants = descendantsMap(tree);
  const parents = new Set(tree.map((c) => c.parent_id).filter(Boolean));
  const categoryItems = tree.map((c) => ({
    id: c.id, name: c.name, active: c.active, code: c.code, kind: c.kind, depth: depthOf(c.code), isGroup: parents.has(c.id),
    usage: c.usage?.[0]?.count ?? 0,
    // abre a visão por rubrica filtrada nesta rubrica (e nas de baixo) para recategorizar
    usageHref: `/lancamentos?visao=rubricas&de=tudo&rubrica=${[c.id, ...(descendants[c.id] ?? [])].join(",")}`,
  }));

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/cadastros" />
    <main className="main">
      <div className="page-head"><div><span className="eyebrow">Cadastros</span><h1>Rubricas e formas de pagamento</h1><p className="lede">Inativos saem dos novos lançamentos e continuam nos antigos. Para recategorizar, clique no número de uso ou filtre a lista por rubricas inativas.</p></div></div>
      <div className="grid gap-5">
        <CatalogManager kind="categories" {...CATALOG_KINDS.categories} items={categoryItems} canEdit={canEdit} />
        <CatalogManager kind="payment_methods" {...CATALOG_KINDS.payment_methods} items={normalize(paymentMethods as Row[] | null)} canEdit={canEdit} />
      </div>
    </main>
  </div>;
}
