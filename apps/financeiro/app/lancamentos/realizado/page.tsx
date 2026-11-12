import { IconDownload } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { EntryViewTabs, PageBody, PageHeader } from "@/components/nav/page-header";
import { YearSelect } from "@/components/nav/year-select";
import { RealizedTable } from "@/components/realized/realized-table";
import { SetupNeeded } from "@/components/setup-needed";
import { Button } from "@/components/ui/button";
import { exportYears } from "@/lib/export/period";
import { fetchRealizedModel } from "@/lib/export/queries";
import { currentYear } from "@/lib/filters";
import { pageSession } from "@/lib/session";

export const metadata = { title: "Realizado · GEAS Financeiro" };

/** Realizado do ano na tela: o mesmo conteúdo da planilha de /exportar/realizado, sem baixar. */
export default async function RealizedPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const params = await searchParams;
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const thisYear = currentYear();
  const requested = Number(params.ano);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : thisYear;

  const [{ data: firstEntry }, { data: lastEntry }] = await Promise.all([
    supabase.from("ledger_entries").select("entry_date").eq("group_id", member.groupId).order("entry_date").limit(1).maybeSingle(),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", member.groupId).order("entry_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const years = exportYears(firstEntry?.entry_date, lastEntry?.entry_date);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);

  let model = null;
  let error: string | null = null;
  try {
    model = await fetchRealizedModel(supabase, member.groupId, year);
  } catch (e) {
    console.error("realizado", e);
    error = e instanceof Error ? e.message : "erro desconhecido";
  }

  // No desktop a página não rola: a tabela ocupa o resto da tela, com cabeçalho, primeira coluna e saldo fixos.
  return <div className="shell flex min-h-dvh flex-col overflow-clip md:h-dvh md:min-h-0 md:overflow-hidden">
    <AppHeader role={member.role} email={user.email ?? ""} current="/lancamentos/realizado" />
    <PageBody className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      <PageHeader title="Lançamentos" crumbs={[{ label: "Lançamentos", href: "/lancamentos" }, { label: `Realizado ${year}` }]}
        tabs={<EntryViewTabs current="realizado" />}
        actions={<>
          <YearSelect year={year} links={years.map((y) => ({ year: y, href: y === thisYear ? "/lancamentos/realizado" : `/lancamentos/realizado?ano=${y}` }))} />
          <Button variant="outline" size="lg" nativeButton={false} render={<a href={`/exportar/realizado?ano=${year}`} download />}><IconDownload /> Baixar planilha</Button>
        </>}
        description="Receitas e despesas por rubrica, mês a mês, pela data do lançamento. Rubricas pai somam as filhas; inativas aparecem só se tiveram movimento no ano." />
      {error && <p role="alert" className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">Não foi possível carregar o Realizado: {error}</p>}
      {model && <RealizedTable key={year} model={model} />}
    </PageBody>
  </div>;
}
