import { Link } from "@geas/ui/components/link";
import { AppHeader } from "@/components/finance/app-header";
import { RecentImports } from "@/components/finance/import/recent-imports";
import { StatementImporter, type ImportAccount } from "@/components/finance/import/statement-importer";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { extratoCrumbs, ExtratoTabs, NARROW_CONTENT, PageBody, PageHeader } from "@/components/finance/nav/page-header";
import { SectionCard } from "@geas/ui/components/section-card";
import { PLACEHOLDER_ACCOUNT_NAME } from "@/lib/finance/accounts";
import { fetchImportProfiles, fetchLastProfileByAccount, fetchRecentImports, importAccounts } from "@/lib/server/finance/statements";
import { pageSession } from "@/lib/server/session";
import { cn } from "@geas/ui/lib/utils";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { user, member: membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email} />;
  const { db, groupId } = membership;
  const canEdit = membership.finance.canReview;

  const [accountRows, { profiles }, lastProfiles] = await Promise.all([
    // Caixa (dinheiro) não tem extrato bancário: fica fora do import OFX
    importAccounts(db, groupId),
    canEdit ? fetchImportProfiles(db, groupId) : Promise.resolve({ profiles: [] }),
    canEdit ? fetchLastProfileByAccount(db, groupId) : Promise.resolve({} as Record<string, string>),
  ]);
  // "A definir" é só um destino provisório de lançamentos antigos; não recebe extrato.
  const accounts = (accountRows as ImportAccount[]).filter((account) => account.name !== PLACEHOLDER_ACCOUNT_NAME);
  const requested = typeof params.conta === "string" ? params.conta : "";
  // A conta (banco) é escolhida em cada importação; só vem preenchida quando a URL já indica uma.
  const accountId = accounts.some((account) => account.id === requested) ? requested : "";
  const recent = accountId ? await fetchRecentImports(db, groupId, accountId) : { rows: [], error: undefined };
  const accountName = accounts.find((account) => account.id === accountId)?.name ?? "";

  return <div className="shell">
    <AppHeader member={membership} current="/financeiro/extrato/importar" />
    <PageBody>
      <PageHeader title="Extrato" crumbs={extratoCrumbs("importar")} tabs={<ExtratoTabs current="importar" accountId={accountId || undefined} />}
        description="Escolha o banco (a conta) e envie o extrato OFX, exportado pelo banco ou convertido. Confira as linhas antes de importar; depois, concilie com os lançamentos." />
      <div className={cn("grid gap-5", NARROW_CONTENT)}>
        {!canEdit && <SectionCard><p className="m-0 p-5 text-sm text-muted-foreground">Somente tesouraria e administração podem importar extratos. Você pode consultar as importações já feitas.</p></SectionCard>}
        {canEdit && accounts.length === 0 && <SectionCard><p className="m-0 p-5 text-sm text-muted-foreground">Nenhuma conta ativa. Cadastre a conta do banco em <Link href="/financeiro/configuracoes/contas" className="underline">Configurações › Contas</Link> antes de importar.</p></SectionCard>}
        {canEdit && accounts.length > 0 && <StatementImporter accounts={accounts} profiles={profiles} lastProfiles={lastProfiles} accountId={accountId} />}
        {accountId && <RecentImports accountId={accountId} accountName={accountName} rows={recent.rows} error={recent.error} canEdit={canEdit} />}
      </div>
    </PageBody>
  </div>;
}
