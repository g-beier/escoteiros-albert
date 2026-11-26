import { AppHeader } from "@/components/finance/app-header";
import { DebtsManager } from "@/components/finance/debts/debts-manager";
import { FeeTabs, feeCrumbs, PageBody, PageHeader } from "@/components/finance/nav/page-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { fetchDebts } from "@/lib/server/finance/debts";
import { listForPicker } from "@/lib/server/finance/associates";
import { entryCatalogs } from "@/lib/server/finance/registry";
import { categoryLabel, sortCategories } from "@/lib/finance/categories";
import { pageSession } from "@/lib/server/session";

export const metadata = { title: "Devedores · GEAS Financeiro" };

export default async function DebtsPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const [{ debts, error }, associates, catalogs] = await Promise.all([
    fetchDebts(member.db, member.groupId),
    // só tesouraria/administração escolhe o associado; a consulta não recebe a lista
    member.finance.canReview
      ? listForPicker(member.db, member.groupId)
      : Promise.resolve([]),
    member.finance.canReview ? entryCatalogs(member.db, member.groupId) : Promise.resolve(null),
  ]);
  // Rubricas de receita (023): toda dívida diz do que é (mensalidade, lojinha, atividade…).
  const byId = new Map((catalogs?.categories ?? []).map((c) => [c.id, c]));
  const categories = sortCategories((catalogs?.categories ?? []).filter((c) => c.kind === "receita" && c.active && c.parent_id))
    .map((c) => ({ value: c.id, label: categoryLabel(c, byId) }));

  return <div className="shell">
    <AppHeader member={member} current="/financeiro/mensalidades/devedores" />
    <PageBody width="narrow">
      <PageHeader title="Mensalidades" tabs={<FeeTabs current="devedores" />} crumbs={feeCrumbs("devedores")}
        description={member.finance.canReview
          ? "O que cada associado deve, por rubrica (mensalidade, lojinha, atividades…). Só é pago por rateios ligados à dívida, que entram na rubrica dela (use “Receber…”). A consulta vê as dívidas e os valores, mas não de quem são."
          : "Dívidas anotadas pela tesouraria, sem o nome dos associados."} />
      {error && <p role="alert" className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">Não foi possível carregar as dívidas: {error}</p>}
      <DebtsManager debts={debts} canEdit={member.finance.canReview} categories={categories}
        associates={associates.map((a) => ({ value: a.id, label: a.section ? `${a.name} (${a.section})` : a.name, active: a.active }))} />
    </PageBody>
  </div>;
}
