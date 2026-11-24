import { IconFileTypePdf } from "@tabler/icons-react";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { buttonVariants } from "@geas/ui/components/button";
import { Link } from "@geas/ui/components/link";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@geas/ui/components/tooltip";
import { cn } from "@geas/ui/lib/utils";
import { AssociateFilters } from "@/components/associates/associate-filters";
import { AppHeader } from "@/components/associates/app-header";
import { LifeBar, LifeLegend } from "@/components/associates/life/life-bar";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { matchesQuery } from "@/lib/associates/list";
import { statusFilter, todayISO, type ScoutBranch } from "@/lib/associates/model";
import { expectedBranch, lifeBranchColor, lifeBranchShort, lifeSummary, starsLabel, type LifeSummary } from "@/lib/associates/scout-life";
import { dateBR } from "@/lib/format";
import * as associatesData from "@/lib/server/associates/associates";
import * as functionsData from "@/lib/server/associates/functions";
import * as life from "@/lib/server/associates/scout-life";
import { pageSession } from "@/lib/server/session";

type Search = { situacao?: string; q?: string; ver?: string };

const VIEWS = [
  { value: "", label: "Todos" },
  { value: "entregar", label: "Estrelas a entregar" },
  { value: "lacunas", label: "Com lacunas" },
  { value: "sem-periodo", label: "Sem período" },
] as const;

/**
 * Vida escoteira do grupo (substitui a planilha de linha do tempo): uma faixa por pessoa num eixo de anos comum, com
 * as cores dos ramos, as estrelas e o controle (anos, estrelas por ramo, a entregar). Só quem conta: jovens e adultos
 * com função de escotista ou dirigente, mais quem já tem período registrado. Abaixo de `lg`, só o nome e a contagem: a faixa
 * não cabe. O eixo dos anos fica fixo no topo ao rolar.
 */
export default async function GroupLifePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const [all, functions, data] = await Promise.all([associatesData.list(db, groupId), functionsData.list(db, groupId), life.ofGroup(db, groupId)]);
  const today = todayISO();
  const status = statusFilter(params.situacao);
  const view = VIEWS.find((v) => v.value === params.ver)?.value ?? "";

  const functionsOf = Map.groupBy(functions, (fn) => fn.associate_id);
  const people = all
    .filter((a) => (status === "todos" || (status === "ativos") === a.active) && matchesQuery(a.name, params.q))
    .map((a) => {
      const periods = data.periods.get(a.id) ?? [];
      const summary = lifeSummary({ periods, promiseDate: a.promise_date, records: data.stars.get(a.id) ?? [], exclusions: data.exclusions.get(a.id) ?? [], today });
      return { associate: a, periods, exclusions: data.exclusions.get(a.id) ?? [], summary, counts: periods.length > 0 || expectedBranch(a, functionsOf.get(a.id) ?? [], today) !== null };
    })
    .filter((p) => p.counts)
    .filter((p) => view === "" || (view === "entregar" ? p.summary.pending !== null : view === "lacunas" ? p.summary.hasGaps : p.periods.length === 0));

  const starts = people.flatMap((p) => p.periods.map((period) => period.started_on)).sort();
  const firstYear = Number((starts[0] ?? today).slice(0, 4));
  const lastYear = Number(today.slice(0, 4)) + 1;
  const from = `${firstYear}-01-01`;
  const to = `${lastYear}-01-01`;
  const step = lastYear - firstYear > 30 ? 10 : lastYear - firstYear > 12 ? 5 : 1;
  const ticks = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i).filter((y) => (y - firstYear) % step === 0 || y === lastYear);
  const pct = (year: number) => ((year - firstYear) / Math.max(1, lastYear - firstYear)) * 100;
  const toDeliver = people.filter((p) => p.summary.pending).length;

  const hrefFor = (ver: string) => {
    const next = new URLSearchParams();
    if (ver) next.set("ver", ver);
    if (params.situacao) next.set("situacao", params.situacao);
    if (params.q) next.set("q", params.q);
    return next.size ? `/associados/vida-escoteira?${next}` : "/associados/vida-escoteira";
  };

  return <div className="shell">
    <AppHeader current="/associados/vida-escoteira" member={member} />
    <PageBody>
      <PageHeader title="Vida escoteira" crumbs={[{ label: "Associados", href: "/associados" }, { label: "Vida escoteira" }]}
        description="Tempo de atividade desde a promessa: jovens e adultos escotistas ou dirigentes. Clique no nome para a linha do tempo."
        actions={<a href="/associados/relatorios/doc-14b" target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "lg" })}>
          <IconFileTypePdf data-icon="inline-start" /> Relatório (PDF)
        </a>}>
        <SectionTabs label="Filtro" tabs={VIEWS.map((v) => ({ href: hrefFor(v.value), label: v.value === "entregar" && toDeliver ? `${v.label} (${toDeliver})` : v.label, active: v.value === view }))} />
        <AssociateFilters />
      </PageHeader>

      <SectionCard aria-labelledby="group-life-title" className="overflow-visible">
        <SectionHeader title="Linhas do tempo" titleId="group-life-title" description="Uma faixa por pessoa; as marcas são as estrelas.">
          <SectionCount>{people.length} {people.length === 1 ? "pessoa" : "pessoas"}</SectionCount>
        </SectionHeader>
        <div className="hidden border-b px-4 py-2 lg:block"><LifeLegend branches={["lobinho", "escoteiro", "senior", "pioneiro", "adulto"]} /></div>
        {people.length === 0
          ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Ninguém neste filtro.</p>
          : <div>
            {/* Eixo dos anos fixo no topo ao rolar a lista (o cartão fica sem overflow-hidden para o sticky funcionar). */}
            <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto] items-end gap-3 border-b bg-muted px-4 py-1.5 lg:grid-cols-[15rem_1fr_10.5rem] text-[11px] font-semibold text-muted-foreground uppercase">
              <span>Nome</span>
              <span className="relative hidden h-4 lg:block" aria-hidden>{ticks.map((y) => <span key={y} className="num absolute -translate-x-1/2" style={{ left: `${pct(y)}%` }}>{y}</span>)}</span>
              <span className="text-right">Estrelas</span>
            </div>
            <ul className="m-0 list-none p-0">{people.map(({ associate, periods, exclusions, summary }) => <li key={associate.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-1 last:border-b-0 lg:grid-cols-[15rem_1fr_10.5rem]">
              <div className="min-w-0">
                <Link href={`/associados/${associate.id}/vida-escoteira`} className={cn("block truncate text-sm leading-tight font-medium hover:underline", !associate.active && "text-muted-foreground")}>{associate.name}</Link>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {summary.promiseDate ? <>Promessa <span className="num">{dateBR(summary.promiseDate)}</span></> : "sem promessa"}
                  {summary.hasGaps && " · lacunas"}
                </span>
              </div>
              <div className="relative hidden lg:block">
                <span className="pointer-events-none absolute inset-0" aria-hidden>
                  {ticks.map((y) => <span key={y} className="absolute inset-y-0 w-px bg-border" style={{ left: `${pct(y)}%` }} />)}
                </span>
                {periods.length > 0
                  ? <LifeBar today={today} periods={periods} exclusions={exclusions} promiseDate={summary.promiseDate} stars={summary.stars} from={from} to={to} size="sm" label={`Vida escoteira de ${associate.name}`} />
                  : <span className="relative text-[11px] text-muted-foreground">sem período registrado</span>}
              </div>
              <StarsCell summary={summary} />
            </li>)}</ul>
          </div>}
      </SectionCard>
    </PageBody>
  </div>;
}

/**
 * Total de estrelas (a divisão por ramo fica no tooltip) e, à esquerda dele, a pílula "a entregar". Tudo alinhado à
 * direita, como o cabeçalho; "X anos" tem largura fixa (cabe "99 anos"), então a pílula fica no mesmo lugar em todas
 * as linhas.
 */
function StarsCell({ summary }: { summary: LifeSummary }) {
  const branches = Object.entries(summary.byBranch) as [ScoutBranch, number][];
  return <div className="flex items-center justify-end gap-2 whitespace-nowrap">
    {summary.pending
      && <Badge variant="caution" size="md" title={`${summary.pending.n}ª completou em ${dateBR(summary.pending.dueOn)}`}>a entregar</Badge>}
    <Tooltip>
      <TooltipTrigger render={<button type="button" className="w-[4.25rem] shrink-0 rounded-sm text-right text-xs underline-offset-2 hover:underline" aria-label={`${starsLabel(summary.years)}${branches.length ? `: ${branches.map(([b, n]) => `${lifeBranchShort(b)} ${n}`).join(", ")}` : ""}`} />}>
        <strong className="num">{summary.years}</strong>{"\u00a0"}{summary.years === 1 ? "ano" : "anos"}
      </TooltipTrigger>
      <TooltipContent side="left">{branches.length
        ? <span className="grid gap-1">{branches.map(([b, n]) => <span key={b} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-white/30" style={{ background: lifeBranchColor(b) }} aria-hidden />{lifeBranchShort(b)} <strong className="num">{n}</strong>
        </span>)}</span>
        : "Nenhuma estrela ainda"}</TooltipContent>
    </Tooltip>
  </div>;
}
