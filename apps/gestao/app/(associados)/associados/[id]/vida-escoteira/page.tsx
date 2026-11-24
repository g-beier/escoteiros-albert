import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/associates/app-header";
import { barRange, StarsByBranch } from "@/components/associates/life/life-card";
import { LifeBar, LifeLegend } from "@/components/associates/life/life-bar";
import { AddEventButton, ExclusionsEditor, NotesEditor, PeriodsEditor, StarsEditor, SuggestionCard } from "@/components/associates/life/life-editors";
import { MismatchNotice, StarNotice } from "@/components/associates/life/life-notices";
import { LifeTimeline } from "@/components/associates/life/life-timeline";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { todayISO } from "@/lib/associates/model";
import { lifeMismatch, lifeSummary, missingSuggestions, starsLabel, suggestPeriods, timeline, yearsLabel } from "@/lib/associates/scout-life";
import { dateBR } from "@/lib/format";
import * as associates from "@/lib/server/associates/associates";
import * as functionsData from "@/lib/server/associates/functions";
import * as life from "@/lib/server/associates/scout-life";
import { pageSession } from "@/lib/server/session";

/**
 * Vida escoteira de um associado: resumo (barra, anos, estrelas por ramo), avisos (estrela a entregar, vigente diferente
 * do cadastro), a linha do tempo vertical com os eventos do cadastro e os lançados à mão, e a edição de períodos,
 * estrelas e anotações (Editor do Associados).
 */
export default async function LifePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const associate = await associates.get(db, groupId, id);
  if (!associate) notFound();

  const [{ moves, movements }, functions, data] = await Promise.all([associates.history(db, id), functionsData.listOf(db, id), life.ofAssociate(db, id)]);
  const today = todayISO();
  const canEdit = member.associates.canReview;
  const summary = lifeSummary({ periods: data.periods, promiseDate: associate.promise_date, records: data.stars, exclusions: data.exclusions, today });
  const mismatch = lifeMismatch({ associate, periods: data.periods, functions, moves, movements, today });
  const suggestion = missingSuggestions(suggestPeriods({ branch: associate.branch, movements, moves, functions, today }), data.periods);
  const years = timeline({ periods: data.periods, promiseDate: associate.promise_date, moves, movements, stars: summary.stars, events: data.events, exclusions: data.exclusions, today });
  const { from, to } = barRange(data.periods, summary, today);
  const pendingBefore = summary.stars.filter((s) => s.status === "pendente" && s.n < (summary.pending?.n ?? 0)).length;

  return <div className="shell">
    <AppHeader current={`/associados/${id}/vida-escoteira`} member={member} />
    <PageBody width="narrow">
      <PageHeader title="Vida escoteira" crumbs={[{ label: "Associados", href: "/associados" }, { label: associate.name, href: `/associados/${id}` }, { label: "Vida escoteira" }]}
        description={associate.name}>
        <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <Fact label="Promessa"><span className="num">{associate.promise_date ? dateBR(associate.promise_date) : "—"}</span></Fact>
          <Fact label="Tempo de atividade">{yearsLabel(summary.years)}</Fact>
          <Fact label="Estrelas">{starsLabel(summary.years)}</Fact>
          {summary.next && <Fact label="Próxima estrela"><span className="num">{summary.next.n}ª em {dateBR(summary.next.dueOn)}</span></Fact>}
          {summary.hasGaps && <Fact label="Lacunas">Sim</Fact>}
        </dl>
      </PageHeader>

      {!associate.promise_date && <p className="m-0 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-sm">
        Sem data de promessa: a contagem começa na promessa. Informe-a na edição do cadastro.</p>}
      {summary.pending && <StarNotice associateId={id} star={summary.pending} previous={pendingBefore} canEdit={canEdit} today={today} />}
      {mismatch && <MismatchNotice associateId={id} mismatch={mismatch} canEdit={canEdit} today={today} />}

      {data.periods.length > 0 && <SectionCard>
        <div className="grid gap-3 px-4 py-4">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground num">
            <span>{from.slice(0, 4)}</span>
            <LifeBar today={today} periods={data.periods} exclusions={data.exclusions} promiseDate={associate.promise_date} stars={summary.stars} from={from} to={to} label={`Vida escoteira de ${from.slice(0, 4)} a ${to.slice(0, 4)}`} />
            <span>{to.slice(0, 4)}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LifeLegend branches={data.periods.map((p) => p.branch)} />
            <StarsByBranch byBranch={summary.byBranch} />
          </div>
        </div>
      </SectionCard>}

      {suggestion.length > 0 && <SuggestionCard associateId={id} periods={suggestion} canEdit={canEdit} />}

      <SectionCard aria-labelledby="timeline-title">
        <SectionHeader title="Linha do tempo" titleId="timeline-title" description="Promessa, entradas, passagens, períodos, estrelas e os eventos do histórico.">
          {canEdit && <AddEventButton associateId={id} today={today} />}
        </SectionHeader>
        <LifeTimeline years={years} associateId={id} canEdit={canEdit} today={today} />
      </SectionCard>

      <PeriodsEditor associateId={id} periods={data.periods} canEdit={canEdit} today={today} />
      <ExclusionsEditor associateId={id} exclusions={data.exclusions} canEdit={canEdit} today={today} />
      <StarsEditor associateId={id} stars={summary.stars} canEdit={canEdit} today={today} />
      <NotesEditor associateId={id} notes={data.notes} canEdit={canEdit} />
    </PageBody>
  </div>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-0.5"><dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt><dd className="m-0">{children}</dd></div>;
}
