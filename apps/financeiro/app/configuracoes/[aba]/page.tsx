import { notFound } from "next/navigation";
import { pageMember } from "@/lib/session";
import { AppHeader } from "@/components/app-header";
import { FeeSettingsForm, FeeYearForm } from "@/components/fees/fee-settings-form";
import { fetchFeePrices, fetchFeeSettings } from "@/lib/fee-queries";
import { currentYear } from "@/lib/filters";
import { PageBody, PageHeader, settingsCrumbs, SettingsTabs } from "@/components/nav/page-header";
import { AccountsManager, type AccountItem } from "@/components/accounts-manager";
import { CatalogManager } from "@/components/catalog-manager";
import { CategoriesManager } from "@/components/categories-manager";
import type { SavedCategory } from "@/lib/category-draft";
import { ProfilesManager, type ProfileItem } from "@/components/import/profiles-manager";
import { profileAccountUses, profileSettingsSummary, type ProfileImport } from "@/lib/import-flow";
import { fetchImportProfiles } from "@/lib/import-queries";
import { CATALOG_KINDS } from "@/lib/catalogs";
import { sortCategories, type CategoryItem } from "@/lib/categories";

type Row = { id: string; name: string; active: boolean; usage: { count: number }[] };
type PaymentMethodRow = Row & { default_account_id: string | null };
type AccountRow = Omit<AccountItem, "usage"> & { usage: { count: number }[] };

const TABS = {
  contas: "Onde o dinheiro está (conta corrente, poupança, caixa), com saldo inicial e conta contábil de contrapartida.",
  rubricas: "Classificação dos rateios, em árvore pelo código, com a conta contábil usada na exportação para a contabilidade. Para recategorizar alguns rateios, clique no número de uso; para juntar todos na rubrica de cima, exclua a rubrica.",
  formas: "Como o dinheiro se moveu; a conta padrão é sugerida nos novos lançamentos.",
  perfis: "Como o extrato OFX de cada banco é lido: um perfil por banco, aplicado sozinho na próxima importação da conta.",
  mensalidades: "Regra de vencimento das mensalidades e rubrica usada para sugerir pagamentos.",
} as const;
type Tab = keyof typeof TABS;

/** Configurações › Contas, Rubricas, Formas de pagamento, Perfis de leitura e Mensalidades (`/configuracoes/<aba>`). */
export default async function SettingsPage({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  if (!(aba in TABS)) notFound();
  const tab = aba as Tab;
  const membership = await pageMember();
  const { supabase, user } = membership;
  const canEdit = membership.canEdit;
  if (!canEdit) notFound();

  const [{ data: categories }, { data: paymentMethods }, { data: accountRows }, feeSettings, feePrices] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id, ledger_code, usage:entry_splits(count)").eq("group_id", membership.groupId),
    supabase.from("payment_methods").select("id, name, active, default_account_id, usage:ledger_entries(count)").eq("group_id", membership.groupId).order("active", { ascending: false }).order("name"),
    supabase.from("accounts").select("id, name, kind, bank, branch, number, opening_balance_cents, opening_date, active, ledger_code, usage:ledger_entries(count)").eq("group_id", membership.groupId).order("active", { ascending: false }).order("name"),
    fetchFeeSettings(supabase, membership.groupId),
    fetchFeePrices(supabase, membership.groupId),
  ]);
  const accounts: AccountItem[] = ((accountRows ?? []) as AccountRow[]).map((row) => ({ ...row, usage: row.usage?.[0]?.count ?? 0 }));
  const accountOptions = accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));
  const paymentMethodItems = ((paymentMethods ?? []) as PaymentMethodRow[]).map((row) => ({
    id: row.id, name: row.name, active: row.active, usage: row.usage?.[0]?.count ?? 0, defaultAccountId: row.default_account_id,
  }));

  let profileItems: ProfileItem[] = [];
  if (tab === "perfis") {
    const [{ profiles }, { data: importRows }] = await Promise.all([
      fetchImportProfiles(supabase, membership.groupId),
      supabase.from("statement_imports").select("profile_id, account_id, imported_at").eq("group_id", membership.groupId).not("profile_id", "is", null),
    ]);
    const uses = profileAccountUses((importRows ?? []) as ProfileImport[], accounts);
    profileItems = profiles.map((p) => ({
      id: p.id, name: p.name, format: p.format, updatedAt: p.updated_at, accounts: uses[p.id] ?? [],
      summary: p.format === "ofx" ? profileSettingsSummary(p.settings) : "—",
    }));
  }

  const tree = sortCategories((categories ?? []) as (CategoryItem & { ledger_code: string | null; usage: { count: number }[] })[]);
  // rascunho da tela de rubricas; ao salvar, o refresh traz o estado novo e a tela recomeça dele
  const savedCategories: SavedCategory[] = tree.map((c) => ({
    id: c.id, parent_id: c.parent_id, code: c.code, name: c.name, kind: c.kind, ledger_code: c.ledger_code, active: c.active, usage: c.usage?.[0]?.count ?? 0,
  }));
  const categoriesVersion = savedCategories.map((c) => [c.id, c.parent_id, c.code, c.name, c.ledger_code, c.active, c.usage].join("|")).join(";");

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/configuracoes" />
    <PageBody width="narrow" className="gap-4">
      <PageHeader title="Configurações" crumbs={settingsCrumbs(tab, canEdit)} tabs={<SettingsTabs current={tab} canEdit={canEdit} />}
        description={tab === "perfis" || tab === "mensalidades" ? TABS[tab] : `${TABS[tab]} Inativos saem dos novos lançamentos e continuam nos antigos.`} />
      {tab === "contas" && <AccountsManager accounts={accounts} canEdit={canEdit} />}
      {tab === "perfis" && <ProfilesManager profiles={profileItems} />}
      {tab === "formas" && <CatalogManager kind="payment_methods" {...CATALOG_KINDS.payment_methods} items={paymentMethodItems} canEdit={canEdit} accounts={accountOptions} />}
      {tab === "mensalidades" && <div className="grid items-start gap-4 lg:grid-cols-2">
        <FeeYearForm prices={feePrices} currentYear={currentYear()} />
        <FeeSettingsForm settings={feeSettings} categories={tree} year={currentYear()} />
      </div>}
      {tab === "rubricas" && <CategoriesManager key={categoriesVersion} categories={savedCategories} canEdit={canEdit} />}
    </PageBody>
  </div>;
}
