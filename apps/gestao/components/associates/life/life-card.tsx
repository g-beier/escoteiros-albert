import { IconArrowRight } from "@tabler/icons-react";
import { Link } from "@geas/ui/components/link";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { dateBR } from "@/lib/format";
import { lifeBranchColor, lifeBranchShort, starsLabel, yearsLabel, type LifeExclusion, type LifeMismatch, type LifePeriod, type LifeSummary } from "@/lib/associates/scout-life";
import type { ScoutBranch } from "@/lib/associates/model";
import { LifeBar } from "./life-bar";
import { MismatchNotice, StarNotice } from "./life-notices";

/** Intervalo da barra: do primeiro período (ou da promessa) até hoje, ou até a próxima estrela se o vigente chegar lá. */
export function barRange(periods: LifePeriod[], summary: LifeSummary, today: string) {
  const starts = [...periods.map((p) => p.started_on), ...(summary.promiseDate ? [summary.promiseDate] : [])].sort();
  const from = starts[0] ?? today;
  const to = summary.open && summary.next ? summary.next.dueOn : today;
  return { from, to: to > from ? to : today };
}

/** Estrelas por ramo em pílulas coloridas ("Lobinho 3"). */
export function StarsByBranch({ byBranch }: { byBranch: LifeSummary["byBranch"] }) {
  const entries = Object.entries(byBranch) as [ScoutBranch, number][];
  if (entries.length === 0) return null;
  return <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">{entries.map(([branch, count]) => <li key={branch}
    className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11px] font-semibold text-neutral-900"
    style={{ background: lifeBranchColor(branch) }}>{lifeBranchShort(branch)} <span className="num">{count}</span></li>)}</ul>;
}

/**
 * Vida escoteira no perfil: a barra pequena (cores, anos, estrelas), o controle (anos, próxima estrela, estrela a
 * entregar, vigente diferente do cadastro) e o link para a linha do tempo completa.
 */
export function LifeCard({ associateId, periods, exclusions = [], summary, mismatch, canEdit, today }: {
  associateId: string; periods: LifePeriod[]; exclusions?: LifeExclusion[]; summary: LifeSummary; mismatch: LifeMismatch | null; canEdit: boolean; today: string;
}) {
  const { from, to } = barRange(periods, summary, today);
  const delivered = summary.stars.filter((s) => s.status === "entregue").length;
  return <SectionCard aria-labelledby="life-title">
    <SectionHeader title="Vida escoteira" titleId="life-title" description="Tempo de atividade desde a promessa e estrelas de atividade.">
      <SectionCount>{yearsLabel(summary.years)}</SectionCount>
      <Link href={`/associados/${associateId}/vida-escoteira`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
        Linha do tempo <IconArrowRight className="size-3.5" aria-hidden />
      </Link>
    </SectionHeader>
    <div className="grid gap-3 px-4 py-4">
      {periods.length === 0
        ? <p className="m-0 text-xs text-muted-foreground">Nenhum período registrado. Abra a linha do tempo para lançar o histórico ou usar a sugestão do cadastro.</p>
        : <>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground num">
            <span>{from.slice(0, 4)}</span>
            <LifeBar today={today} periods={periods} exclusions={exclusions} promiseDate={summary.promiseDate} stars={summary.stars} from={from} to={to} label={`Vida escoteira de ${from.slice(0, 4)} a ${to.slice(0, 4)}`} />
            <span>{to.slice(0, 4)}</span>
          </div>
          <dl className="m-0 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <div><dt className="sr-only">Estrelas</dt><dd className="m-0"><strong>{starsLabel(summary.years)}</strong>{delivered > 0 && <span className="text-muted-foreground"> · {delivered} {delivered === 1 ? "entregue" : "entregues"}</span>}</dd></div>
            {summary.next && <div><dt className="inline text-muted-foreground">Próxima: </dt><dd className="m-0 inline"><span className="num">{summary.next.n}ª em {dateBR(summary.next.dueOn)}</span></dd></div>}
            {summary.hasGaps && <div className="text-muted-foreground">Possui lacunas</div>}
            <div><dt className="sr-only">Estrelas por ramo</dt><dd className="m-0"><StarsByBranch byBranch={summary.byBranch} /></dd></div>
          </dl>
        </>}
      {!summary.promiseDate && <p className="m-0 text-xs text-muted-foreground">Sem data de promessa: a contagem começa na promessa. Informe-a em Editar.</p>}
      {summary.pending && <StarNotice associateId={associateId} star={summary.pending} canEdit={canEdit} today={today}
        previous={summary.stars.filter((s) => s.status === "pendente" && s.n < (summary.pending?.n ?? 0)).length} />}
      {mismatch && <MismatchNotice associateId={associateId} mismatch={mismatch} canEdit={canEdit} today={today} />}
    </div>
  </SectionCard>;
}
