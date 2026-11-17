import { AppHeader } from "@/components/finance/app-header";
import { DebtsManager } from "@/components/finance/debts/debts-manager";
import { FeeTabs, feeCrumbs, PageBody, PageHeader } from "@/components/finance/nav/page-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { fetchDebts } from "@/lib/finance/debts";
import { pageSession } from "@/lib/session";

export const metadata = { title: "Devedores · GEAS Financeiro" };

export default async function DebtsPage() {
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const [{ debts, error }, associates] = await Promise.all([
    fetchDebts(supabase, member.groupId),
    // só tesouraria/administração escolhe o associado; a consulta não recebe a lista
    member.canEdit
      ? supabase.from("associate_rows").select("id, name, section, active").eq("group_id", member.groupId).order("name").limit(5000)
        .then(({ data }) => (data ?? []) as { id: string; name: string; section: string | null; active: boolean }[])
      : Promise.resolve([]),
  ]);

  return <div className="shell">
    <AppHeader role={member.role} email={user.email ?? ""} current="/mensalidades/devedores" />
    <PageBody width="narrow">
      <PageHeader title="Mensalidades" tabs={<FeeTabs current="devedores" />} crumbs={feeCrumbs("devedores")}
        description={member.canEdit
          ? "Anotações de dívidas de associados, com o acordo de pagamento e os lançamentos que as pagaram. A consulta vê as dívidas e os valores, mas não de quem são."
          : "Dívidas anotadas pela tesouraria, sem o nome dos associados."} />
      {error && <p role="alert" className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">Não foi possível carregar as dívidas: {error}</p>}
      <DebtsManager debts={debts} canEdit={member.canEdit}
        associates={associates.map((a) => ({ value: a.id, label: a.section ? `${a.name} (${a.section})` : a.name, active: a.active }))} />
    </PageBody>
  </div>;
}
