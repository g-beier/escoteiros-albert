import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { RecentImports } from "@/components/import/recent-imports";
import { StatementImporter, type ImportAccount } from "@/components/import/statement-importer";
import { SetupNeeded } from "@/components/setup-needed";
import { extratoCrumbs, ExtratoTabs, NARROW_CONTENT, PageBody, PageHeader } from "@/components/nav/page-header";
import { SectionCard } from "@/components/section-card";
import { PLACEHOLDER_ACCOUNT_NAME } from "@/lib/accounts";
import { fetchImportProfiles, fetchLastProfileByAccount, fetchRecentImports } from "@/lib/import-queries";
import { pageSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { supabase, user, member: membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const groupId = membership.groupId;
  const canEdit = membership.canEdit;

  const [{ data: accountRows }, { profiles }, lastProfiles] = await Promise.all([
    // Caixa (dinheiro) não tem extrato bancário: fica fora do import OFX
    supabase.from("accounts").select("id, name, bank").eq("group_id", groupId).eq("active", true).neq("kind", "caixa").order("name"),
    canEdit ? fetchImportProfiles(supabase, groupId) : Promise.resolve({ profiles: [] }),
    canEdit ? fetchLastProfileByAccount(supabase, groupId) : Promise.resolve({} as Record<string, string>),
  ]);
  // "A definir" é só um destino provisório de lançamentos antigos; não recebe extrato.
  const accounts = ((accountRows ?? []) as ImportAccount[]).filter((account) => account.name !== PLACEHOLDER_ACCOUNT_NAME);
  const requested = typeof params.conta === "string" ? params.conta : "";
  // A conta (banco) é escolhida em cada importação; só vem preenchida quando a URL já indica uma.
  const accountId = accounts.some((account) => account.id === requested) ? requested : "";
  const recent = accountId ? await fetchRecentImports(supabase, groupId, accountId) : { rows: [], error: undefined };
  const accountName = accounts.find((account) => account.id === accountId)?.name ?? "";

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/extrato/importar" />
    <PageBody>
      <PageHeader title="Extrato" crumbs={extratoCrumbs("importar")} tabs={<ExtratoTabs current="importar" accountId={accountId || undefined} />}
        description="Escolha o banco (a conta) e envie o extrato OFX, exportado pelo banco ou convertido. Confira as linhas antes de importar; depois, concilie com os lançamentos." />
      <div className={cn("grid gap-5", NARROW_CONTENT)}>
        {!canEdit && <SectionCard><p className="m-0 p-5 text-sm text-muted-foreground">Somente tesouraria e administração podem importar extratos. Você pode consultar as importações já feitas.</p></SectionCard>}
        {canEdit && accounts.length === 0 && <SectionCard><p className="m-0 p-5 text-sm text-muted-foreground">Nenhuma conta ativa. Cadastre a conta do banco em <Link href="/configuracoes/contas" className="underline">Configurações › Contas</Link> antes de importar.</p></SectionCard>}
        {canEdit && accounts.length > 0 && <StatementImporter accounts={accounts} profiles={profiles} lastProfiles={lastProfiles} accountId={accountId} />}
        {accountId && <RecentImports accountId={accountId} accountName={accountName} rows={recent.rows} error={recent.error} canEdit={canEdit} />}
      </div>
    </PageBody>
  </div>;
}
