import { notFound } from "next/navigation";
import { pageMember } from "@/lib/server/session";
import { AppHeader } from "@/components/finance/app-header";
import { FeeSettingsForm, FeeYearForm } from "@/components/finance/fees/fee-settings-form";
import { fetchFeePrices, fetchFeeSettings } from "@/lib/server/finance/fees";
import { currentYear } from "@/lib/finance/filters";
import { PageBody, PageHeader, settingsCrumbs, SettingsTabs } from "@/components/finance/nav/page-header";
import { AccountsManager } from "@/components/finance/accounts-manager";
import { CatalogManager } from "@/components/finance/catalog-manager";
import { CategoriesManager } from "@/components/finance/categories-manager";
import type { SavedCategory } from "@/lib/finance/category-draft";
import { ProfilesManager, type ProfileItem } from "@/components/finance/import/profiles-manager";
import { profileAccountUses, profileSettingsSummary } from "@/lib/finance/import-flow";
import { fetchImportProfiles } from "@/lib/server/finance/statements";
import { CATALOG_KINDS } from "@/lib/finance/catalogs";
import { sortCategories } from "@/lib/finance/categories";
import * as registry from "@/lib/server/finance/registry";

const TABS = {
  contas:
    "Onde o dinheiro está (conta corrente, poupança, caixa), com saldo inicial e conta contábil de contrapartida.",
  rubricas:
    "Classificação dos rateios, em árvore pelo código, com a conta contábil usada na exportação para a contabilidade. Para recategorizar alguns rateios, clique no número de uso; para juntar todos na rubrica de cima, exclua a rubrica.",
  formas: "Como o dinheiro se moveu; a conta padrão é sugerida nos novos lançamentos.",
  perfis:
    "Como o extrato OFX de cada banco é lido: um perfil por banco, aplicado sozinho na próxima importação da conta.",
  mensalidades: "Regra de vencimento das mensalidades e rubrica usada para sugerir pagamentos.",
} as const;
type Tab = keyof typeof TABS;

/** Configurações › Contas, Rubricas, Formas de pagamento, Perfis de leitura e Mensalidades (`/financeiro/configuracoes/<aba>`). */
export default async function SettingsPage({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  if (!(aba in TABS)) notFound();
  const tab = aba as Tab;
  const membership = await pageMember();
  const { db, groupId } = membership;
  const canEdit = membership.finance.canReview;
  if (!canEdit) notFound();

  const [{ categories, paymentMethods: paymentMethodItems, accounts }, feeSettings, feePrices] = await Promise.all([
    registry.settingsCatalogs(db, groupId),
    fetchFeeSettings(db, groupId),
    fetchFeePrices(db, groupId),
  ]);
  const accountOptions = accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));

  let profileItems: ProfileItem[] = [];
  if (tab === "perfis") {
    const [{ profiles }, importRows] = await Promise.all([
      fetchImportProfiles(db, groupId),
      registry.profileImports(db, groupId),
    ]);
    const uses = profileAccountUses(importRows, accounts);
    profileItems = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      format: p.format,
      updatedAt: p.updated_at,
      accounts: uses[p.id] ?? [],
      summary: p.format === "ofx" ? profileSettingsSummary(p.settings) : "—",
    }));
  }

  const tree = sortCategories(categories);
  // rascunho da tela de rubricas; ao salvar, o refresh traz o estado novo e a tela recomeça dele
  const savedCategories: SavedCategory[] = tree.map((c) => ({
    id: c.id,
    parent_id: c.parent_id,
    code: c.code,
    name: c.name,
    kind: c.kind,
    ledger_code: c.ledger_code,
    active: c.active,
    usage: c.usage,
    sells_items: c.sells_items,
    transfer: c.transfer,
  }));
  const categoriesVersion = savedCategories
    .map((c) =>
      [c.id, c.parent_id, c.code, c.name, c.ledger_code, c.active, c.sells_items, c.transfer, c.usage].join("|"),
    )
    .join(";");

  return (
    <div className="shell">
      <AppHeader member={membership} current="/financeiro/configuracoes" />
      <PageBody width="narrow" className="gap-4">
        <PageHeader
          title="Configurações"
          crumbs={settingsCrumbs(tab)}
          tabs={<SettingsTabs current={tab} />}
          description={
            tab === "perfis" || tab === "mensalidades"
              ? TABS[tab]
              : `${TABS[tab]} Inativos saem dos novos lançamentos e continuam nos antigos.`
          }
        />
        {tab === "contas" && <AccountsManager accounts={accounts} canEdit={canEdit} />}
        {tab === "perfis" && <ProfilesManager profiles={profileItems} />}
        {tab === "formas" && (
          <CatalogManager
            kind="payment_methods"
            {...CATALOG_KINDS.payment_methods}
            items={paymentMethodItems}
            canEdit={canEdit}
            accounts={accountOptions}
          />
        )}
        {tab === "mensalidades" && (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <FeeYearForm prices={feePrices} currentYear={currentYear()} />
            <FeeSettingsForm settings={feeSettings} categories={tree} year={currentYear()} />
          </div>
        )}
        {tab === "rubricas" && (
          <CategoriesManager key={categoriesVersion} categories={savedCategories} canEdit={canEdit} />
        )}
      </PageBody>
    </div>
  );
}
