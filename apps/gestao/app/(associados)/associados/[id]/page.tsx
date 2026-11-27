import { Link } from "@geas/ui/components/link";
import { notFound } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/associates/app-header";
import { AssociateActions } from "@/components/associates/associate-actions";
import { AssociateControls } from "@/components/associates/associate-controls";
import { AssociateFunctions } from "@/components/associates/associate-functions";
import { AssociateRelatives } from "@/components/associates/associate-relatives";
import { ReviewNotice } from "@/components/associates/review-notice";
import { TransitionNotice } from "@/components/associates/transition-notice";
import { LifeCard } from "@/components/associates/life/life-card";
import { lifeMismatch, lifeSummary } from "@/lib/associates/scout-life";
import * as lifeData from "@/lib/server/associates/scout-life";
import { transitionOf, transitionWindow } from "@/lib/associates/alerts";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import { associateAudiences, scouterSections } from "@/lib/associates/controls";
import {
  activityPeriods,
  ageInYears,
  ageLabel,
  branchLabels,
  registrationLabels,
  todayISO,
  type AssociateMove,
  type AssociateMovement,
} from "@/lib/associates/model";
import { dateBR, monthYearBR } from "@/lib/format";
import * as associates from "@/lib/server/associates/associates";
import * as controls from "@/lib/server/associates/controls";
import * as functionsData from "@/lib/server/associates/functions";
import * as relativesData from "@/lib/server/associates/relatives";
import * as sectionsData from "@/lib/server/associates/sections";
import { pageSession } from "@/lib/server/session";

/**
 * Ficha do associado, o único lugar com entrada, passagens e histórico: dados (jovem: período de transição do ramo;
 * escotista: seções), funções (só adultos), responsáveis (jovens), controle de dados, passagens e períodos de
 * atividade; ações Passagem (só jovens), Desligar e Reingressar.
 */
export default async function AssociateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const associate = await associates.get(db, groupId, id);
  if (!associate) notFound();
  const youth = associate.branch !== "adulto";
  const [{ moves, movements }, catalog, functions, items, statuses, links, life, relatives, people] = await Promise.all(
    [
      associates.history(db, id),
      sectionsData.catalog(db, groupId),
      functionsData.listOf(db, id),
      controls.items(db, groupId),
      controls.statusesOf(db, id),
      relativesData.linksOf(db, id),
      lifeData.ofAssociate(db, id),
      youth ? relativesData.list(db, groupId) : Promise.resolve([]),
      youth ? associates.list(db, groupId) : Promise.resolve([]),
    ],
  );
  const today = todayISO();
  const audiences = associateAudiences(associate.branch);
  const age = ageInYears(associate.birth_date, today);
  const periods = activityPeriods(movements).reverse();
  const sectionName = new Map(catalog.sections.map((s) => [s.id, s.name]));
  const patrolName = new Map(catalog.patrols.map((p) => [p.id, p.name]));
  const where = (branch: AssociateMove["from_branch"], sectionId: string | null, patrolId?: string | null) =>
    [
      branchLabels[branch],
      sectionId && (sectionName.get(sectionId) ?? "seção removida"),
      patrolId && patrolName.get(patrolId),
    ]
      .filter(Boolean)
      .join(" › ");
  const canEdit = member.associates.canWrite;
  const transition = transitionOf(associate, today);
  const span = youth ? transitionWindow(associate) : null;
  const scouterOf = youth ? [] : (scouterSections(functions, today).get(id) ?? []);
  const lifeNow = lifeSummary({
    periods: life.periods,
    promiseDate: associate.promise_date,
    records: life.stars,
    exclusions: life.exclusions,
    today,
  });
  const mismatch = lifeMismatch({ associate, periods: life.periods, functions, moves, movements, today });

  return (
    <div className="shell">
      <AppHeader current={`/associados/${id}`} member={member} />
      <PageBody width="narrow">
        <PageHeader
          title={associate.name}
          crumbs={[{ label: "Associados", href: "/associados" }, { label: associate.name }]}
          description={associate.notes ?? undefined}
          actions={
            canEdit && (
              <>
                <Link href={`/associados/${id}/editar`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                  <IconPencil data-icon="inline-start" /> Editar
                </Link>
                <AssociateActions
                  associate={associate}
                  catalog={catalog}
                  today={today}
                  canDelete={member.associates.canReview}
                />
              </>
            )
          }
        >
          <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <Fact label="Situação">
              {associate.active ? (
                <Badge variant="outline" className="border-success/30 bg-success-soft text-success">
                  Ativo
                </Badge>
              ) : (
                <Badge variant="outline">Desligado{associate.left_on && ` em ${dateBR(associate.left_on)}`}</Badge>
              )}
            </Fact>
            <Fact label="Ramo">{branchLabels[associate.branch]}</Fact>
            {youth ? (
              <Fact label="Seção">{associate.section ?? "—"}</Fact>
            ) : (
              scouterOf.length > 0 && <Fact label="Escotista em">{scouterOf.join(", ")}</Fact>
            )}
            {associate.patrol && <Fact label="Equipe">{associate.patrol}</Fact>}
            <Fact label="Nascimento">
              {associate.birth_date ? (
                <>
                  <span className="num">{dateBR(associate.birth_date)}</span>{" "}
                  <span className="text-muted-foreground">({ageLabel(age)})</span>
                </>
              ) : (
                "—"
              )}
            </Fact>
            {associate.nickname && <Fact label="Apelido">{associate.nickname}</Fact>}
            <Fact label="Registro">{associate.registration ? registrationLabels[associate.registration] : "—"}</Fact>
            <Fact label="Promessa">
              <span className="num">{associate.promise_date ? dateBR(associate.promise_date) : "—"}</span>
            </Fact>
            <Fact label="Entrada no grupo">
              <span className="num">{associate.joined_on ? dateBR(associate.joined_on) : "—"}</span>
            </Fact>
            {span && (
              <Fact label={associate.branch === "pioneiro" ? "Período de partida" : "Período de transição"}>
                <span className="num" title={`${span.rule.label}: de ${dateBR(span.warnOn)} a ${dateBR(span.dueOn)}`}>
                  {monthYearBR(span.warnOn)} – {monthYearBR(span.dueOn)}
                </span>
              </Fact>
            )}
          </dl>
        </PageHeader>

        {associate.review_status === "para_revisar" && (
          <ReviewNotice associateId={id} canEdit={member.associates.canReview} />
        )}
        {transition && (
          <TransitionNotice
            associateId={id}
            transition={transition}
            branch={associate.branch}
            canEdit={canEdit}
            today={today}
          />
        )}

        <LifeCard
          associateId={id}
          periods={life.periods}
          exclusions={life.exclusions}
          summary={lifeNow}
          mismatch={mismatch}
          canEdit={member.associates.canReview}
          today={today}
        />

        {!youth && (
          <AssociateFunctions
            associateId={id}
            associateName={associate.name}
            functions={functions}
            sections={catalog.sections}
            canEdit={canEdit}
            today={today}
          />
        )}

        {(youth || links.length > 0) && (
          <AssociateRelatives
            associate={{ id, name: associate.name }}
            links={links}
            relatives={relatives}
            canEdit={canEdit && youth}
            associates={people
              .filter((p) => p.active)
              .map((p) => ({ value: p.id, label: `${p.name} (${branchLabels[p.branch]})` }))}
          />
        )}

        <AssociateControls
          associate={{ id, name: associate.name, active: associate.active }}
          audiences={audiences}
          items={items}
          rows={statuses}
          canEdit={canEdit}
          today={today}
        />

        <SectionCard>
          <SectionHeader title="Passagens" description="Mudanças de ramo, seção ou equipe.">
            <SectionCount>
              {moves.length} {moves.length === 1 ? "passagem" : "passagens"}
            </SectionCount>
          </SectionHeader>
          {moves.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma passagem registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableCaption className="sr-only">Passagens do associado</TableCaption>
                <TableHeader className="bg-muted">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(HEAD_CLASS, "w-28")}>Data</TableHead>
                    <TableHead className={HEAD_CLASS}>De</TableHead>
                    <TableHead className={HEAD_CLASS}>Para</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moves.map((move) => (
                    <TableRow key={move.id}>
                      <TableCell className={cn(CELL_CLASS, "num")}>{dateBR(move.move_date)}</TableCell>
                      <TableCell className={cn(CELL_CLASS, "whitespace-normal text-muted-foreground")}>
                        {where(move.from_branch, move.from_section_id)}
                      </TableCell>
                      <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>
                        {where(move.to_branch, move.to_section_id, move.to_patrol_id)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <SectionHeader
            title="Períodos no grupo"
            description="Cada entrada (ou reingresso) até o desligamento seguinte."
          >
            <SectionCount>
              {periods.length} {periods.length === 1 ? "período" : "períodos"}
            </SectionCount>
          </SectionHeader>
          {periods.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma entrada registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[560px]">
                <TableCaption className="sr-only">Períodos de atividade do associado</TableCaption>
                <TableHeader className="bg-muted">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={HEAD_CLASS}>Entrada</TableHead>
                    <TableHead className={HEAD_CLASS}>Desligamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((period, index) => (
                    <TableRow key={period.start?.id ?? period.end?.id ?? index}>
                      <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>
                        <Movement movement={period.start} empty="sem registro" />
                      </TableCell>
                      <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>
                        <Movement movement={period.end} empty="em atividade" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </PageBody>
    </div>
  );
}

function Movement({ movement, empty }: { movement: AssociateMovement | null; empty: string }) {
  if (!movement) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <>
      <span className="num">{dateBR(movement.movement_date)}</span>
      {movement.reason && <span className="ml-2 text-muted-foreground">{movement.reason}</span>}
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}
