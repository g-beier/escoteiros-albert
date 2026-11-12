import { AppHeader } from "@/components/app-header";
import { FeeGrid } from "@/components/fees/fee-grid";
import { PageBody, PageHeader, SectionTabs } from "@/components/nav/page-header";
import { YearSelect } from "@/components/nav/year-select";
import { SetupNeeded } from "@/components/setup-needed";
import { matchesSection, NO_SECTION, NO_SECTION_PARAM, sectionsOf } from "@/lib/associates";
import { fetchFeeYear, fetchFeeYears } from "@/lib/fee-queries";
import { currentYear } from "@/lib/filters";
import { DUE_RULE_LABELS } from "@/lib/fees";
import { pageSession } from "@/lib/session";

export const metadata = { title: "Mensalidades · GEAS Financeiro" };

type Params = { ano?: string; secao?: string; atrasados?: string };

export default async function FeesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const thisYear = currentYear();
  const requested = Number(params.ano);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : thisYear;
  const [data, feeYears] = await Promise.all([fetchFeeYear(supabase, member.groupId, year), fetchFeeYears(supabase, member.groupId)]);

  const sections = sectionsOf(data.rows.map((r) => r.associate));
  const sectionFilter = params.secao && (params.secao === NO_SECTION_PARAM || sections.includes(params.secao)) ? params.secao : undefined;
  const rows = data.rows.filter((r) => matchesSection(r.associate, sectionFilter));
  const sectionIds = new Set(rows.map((r) => r.associate.id));
  const suggestions = data.suggestions.filter((s) => sectionIds.has(s.associateId));
  const href = (patch: Params) => {
    const next = new URLSearchParams();
    const merged = { ano: year === thisYear ? undefined : String(year), secao: sectionFilter, ...patch };
    if (merged.ano) next.set("ano", merged.ano);
    if (merged.secao) next.set("secao", merged.secao);
    return next.size ? `/mensalidades?${next}` : "/mensalidades";
  };
  // só os anos com dados (e o atual); um ano pedido pela URL fora dessa faixa também aparece
  const years = feeYears.includes(year) ? feeYears : [...feeYears, year].sort((a, b) => b - a);
  const rule = data.settings.dueRule === "fim_do_mes" ? DUE_RULE_LABELS.fim_do_mes
    : data.settings.dueRule === "dia_util" ? `até o ${data.settings.dueDay}º dia útil` : `até o dia ${data.settings.dueDay}`;

  // No desktop a página não rola: a grade ocupa o resto da tela e só as linhas rolam, com cabeçalho e totais fixos.
  return <div className="shell flex min-h-dvh flex-col overflow-clip md:h-dvh md:min-h-0 md:overflow-hidden">
    <AppHeader role={member.role} email={user.email ?? ""} current="/mensalidades" />
    <PageBody className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      <PageHeader title="Mensalidades" crumbs={[{ label: "Mensalidades" }]}
        actions={<YearSelect year={year} links={years.map((y) => ({ year: y, href: href({ ano: y === thisYear ? undefined : String(y) }) }))} />}
        description={<>Março a dezembro. Vencimento {rule.toLowerCase()}; depois disso, sem registro, fica atrasado. Pagamentos lançados na rubrica de mensalidade com o associado aparecem como sugestão.{member.canEdit && " Regra e rubrica em Configurações › Mensalidades."}</>}>
        {sections.length > 1 && <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Seção</span>
          <SectionTabs label="Filtrar por seção" tabs={[
            { href: href({ secao: undefined }), label: "Todas", active: !sectionFilter },
            ...sections.map((section) => ({ href: href({ secao: section ?? NO_SECTION_PARAM }), label: section ?? NO_SECTION, active: sectionFilter === (section ?? NO_SECTION_PARAM) })),
          ]} />
        </div>}
      </PageHeader>
      {data.error && <p role="alert" className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">Não foi possível carregar as mensalidades: {data.error}</p>}
      <FeeGrid key={`${year}|${sectionFilter ?? ""}`} year={year} rows={rows} suggestions={suggestions} splitsByAssociate={data.splitsByAssociate} canEdit={member.canEdit} price={data.price} individualPrices={data.individualPrices} onlyOverdue={params.atrasados === "1"} />
    </PageBody>
  </div>;
}
