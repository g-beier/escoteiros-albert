import { notFound } from "next/navigation";
import { pageMember } from "@/lib/session";
import { AppHeader } from "@/components/app-header";
import { AccountsManager, type AccountItem } from "@/components/accounts-manager";
import { CatalogManager } from "@/components/catalog-manager";
import { CATALOG_KINDS } from "@/lib/catalogs";
import { depthOf, descendantsMap, sortCategories, type CategoryItem } from "@/lib/categories";

type Row = { id: string; name: string; active: boolean; usage: { count: number }[] };
type PaymentMethodRow = Row & { default_account_id: string | null };
type AccountRow = Omit<AccountItem, "usage"> & { usage: { count: number }[] };

export default async function CatalogsPage() {
  const membership = await pageMember();
  const { supabase, user } = membership;
  const canEdit = membership.canEdit;
  if (!canEdit) notFound();

  const [{ data: categories }, { data: paymentMethods }, { data: accountRows }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id, ledger_code, usage:entry_splits(count)").eq("group_id", membership.groupId),
    supabase.from("payment_methods").select("id, name, active, default_account_id, usage:ledger_entries(count)").eq("group_id", membership.groupId).order("active", { ascending: false }).order("name"),
    supabase.from("accounts").select("id, name, kind, bank, branch, number, opening_balance_cents, opening_date, active, ledger_code, ofx_key, usage:ledger_entries(count)").eq("group_id", membership.groupId).order("active", { ascending: false }).order("name"),
  ]);
  const accounts: AccountItem[] = ((accountRows ?? []) as AccountRow[]).map((row) => ({ ...row, usage: row.usage?.[0]?.count ?? 0 }));
  const accountOptions = accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));
  const paymentMethodItems = ((paymentMethods ?? []) as PaymentMethodRow[]).map((row) => ({
    id: row.id, name: row.name, active: row.active, usage: row.usage?.[0]?.count ?? 0, defaultAccountId: row.default_account_id,
  }));

  const tree = sortCategories((categories ?? []) as (CategoryItem & { ledger_code: string | null; usage: { count: number }[] })[]);
  const descendants = descendantsMap(tree);
  const parents = new Set(tree.map((c) => c.parent_id).filter(Boolean));
  const categoryItems = tree.map((c) => ({
    id: c.id, name: c.name, active: c.active, code: c.code, kind: c.kind, depth: depthOf(c.code), isGroup: parents.has(c.id), ledgerCode: c.ledger_code,
    usage: c.usage?.[0]?.count ?? 0,
    // abre a visão por rubrica filtrada nesta rubrica (e nas de baixo) para recategorizar
    usageHref: `/lancamentos?visao=rubricas&de=tudo&rubrica=${[c.id, ...(descendants[c.id] ?? [])].join(",")}`,
  }));

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/cadastros" />
    <main className="main">
      <div className="page-head"><div><span className="eyebrow">Cadastros</span><h1>Contas, rubricas e formas de pagamento</h1><p className="lede">Inativos saem dos novos lançamentos e continuam nos antigos. Para recategorizar, clique no número de uso ou filtre a lista por rubricas inativas.</p></div></div>
      <div className="grid gap-5">
        <AccountsManager accounts={accounts} canEdit={canEdit} />
        <CatalogManager kind="payment_methods" {...CATALOG_KINDS.payment_methods} items={paymentMethodItems} canEdit={canEdit} accounts={accountOptions} />
        <CatalogManager kind="categories" {...CATALOG_KINDS.categories} items={categoryItems} canEdit={canEdit} />
      </div>
    </main>
  </div>;
}
