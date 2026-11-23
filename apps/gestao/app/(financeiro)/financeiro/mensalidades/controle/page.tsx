import { AppHeader } from "@/components/finance/app-header";
import { FeeGrid } from "@/components/finance/fees/fee-grid";
import { FeeTabs, feeCrumbs, PageBody, PageHeader } from "@/components/finance/nav/page-header";
import { YearSelect } from "@/components/finance/nav/year-select";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { matchesSections, NO_SECTION, NO_SECTION_PARAM, sectionsOf } from "@/lib/finance/associates";
import { fetchFeeYear, fetchFeeYears } from "@/lib/server/finance/fees";
import { currentYear } from "@/lib/finance/filters";
import { DUE_RULE_LABELS } from "@/lib/finance/fees";
import { pageSession } from "@/lib/server/session";

export const metadata = { title: "Mensalidades · GEAS Financeiro" };

type Params = { ano?: string; secao?: string; atrasados?: string };

export default async function FeesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const thisYear = currentYear();
  const requested = Number(params.ano);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : thisYear;
  const [data, feeYears] = await Promise.all([fetchFeeYear(member.db, member.groupId, year), fetchFeeYears(member.db, member.groupId)]);

  const sections = sectionsOf(data.rows.map((r) => r.associate));
  // secao=A,B,nenhuma: uma ou mais seções; valores desconhecidos são ignorados
  const sectionValues = sections.map((section) => section ?? NO_SECTION_PARAM);
  const selectedSections = (params.secao ?? "").split(",").map((v) => v.trim()).filter((v) => sectionValues.includes(v));
  const sectionFilter = selectedSections.length && selectedSections.length < sectionValues.length ? selectedSections.join(",") : undefined;
  const rows = sectionFilter ? data.rows.filter((r) => matchesSections(r.associate, selectedSections)) : data.rows;
  const sectionIds = new Set(rows.map((r) => r.associate.id));
  const suggestions = data.suggestions.filter((s) => sectionIds.has(s.associateId));
  const href = (patch: Params) => {
    const next = new URLSearchParams();
    const merged = { ano: year === thisYear ? undefined : String(year), secao: sectionFilter, ...patch };
    if (merged.ano) next.set("ano", merged.ano);
    if (merged.secao) next.set("secao", merged.secao);
    return next.size ? `/financeiro/mensalidades/controle?${next}` : "/financeiro/mensalidades/controle";
  };
  // só os anos com dados (e o atual); um ano pedido pela URL fora dessa faixa também aparece
  const years = feeYears.includes(year) ? feeYears : [...feeYears, year].sort((a, b) => b - a);
  const rule = data.settings.dueRule === "fim_do_mes" ? DUE_RULE_LABELS.fim_do_mes
    : data.settings.dueRule === "dia_util" ? `até o ${data.settings.dueDay}º dia útil` : `até o dia ${data.settings.dueDay}`;

  // No desktop a página não rola: a grade ocupa o resto da tela e só as linhas rolam, com cabeçalho e totais fixos.
  return <div className="shell flex min-h-dvh flex-col overflow-clip md:h-dvh md:min-h-0 md:overflow-hidden">
    <AppHeader member={member} current="/financeiro/mensalidades/controle" />
    <PageBody width="narrow" className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      <PageHeader title="Mensalidades" tabs={<FeeTabs current="controle" />} crumbs={feeCrumbs("controle")}
        actions={<YearSelect year={year} links={years.map((y) => ({ year: y, href: href({ ano: y === thisYear ? undefined : String(y) }) }))} />}
        description={<>Março a dezembro. Vencimento {rule.toLowerCase()}; depois disso, sem registro, fica atrasado. Pagamentos lançados na rubrica de mensalidade com o associado aparecem como sugestão.{member.finance.canReview && " Regra e rubrica em Configurações › Mensalidades."}</>} />
      {data.error && <p role="alert" className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">Não foi possível carregar as mensalidades: {data.error}</p>}
      <FeeGrid key={year} year={year} rows={rows} suggestions={suggestions} splitsByAssociate={data.splitsByAssociate} canEdit={member.finance.canReview} price={data.price} individualPrices={data.individualPrices} onlyOverdue={params.atrasados === "1"}
        sectionOptions={sections.length > 1 ? sections.map((section) => ({ value: section ?? NO_SECTION_PARAM, label: section ?? NO_SECTION })) : []} />
    </PageBody>
  </div>;
}
