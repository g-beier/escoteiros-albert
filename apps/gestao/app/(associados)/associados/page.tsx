import { Link } from "@geas/ui/components/link";
import { Fragment } from "react";
import { IconBolt, IconPlus, IconX } from "@tabler/icons-react";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AssociateFilters } from "@/components/associates/associate-filters";
import { AppHeader } from "@/components/associates/app-header";
import { ReportsDialog } from "@/components/associates/reports-dialog";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { activeFunctionKinds, scouterSections } from "@/lib/associates/controls";
import { listGroups, matchesQuery, type ListGroup } from "@/lib/associates/list";
import { ageInYears, ageLabel, BRANCH_TABS, DELETION_DAYS, isScoutBranch, statusFilter, todayISO, type AssociateProfile } from "@/lib/associates/model";
import { dateBR } from "@/lib/format";
import * as associatesData from "@/lib/server/associates/associates";
import * as functionsData from "@/lib/server/associates/functions";
import { pageSession } from "@/lib/server/session";

type Search = { ramo?: string; situacao?: string; q?: string; revisao?: string; excluido?: string };

/**
 * Lista de associados: abas por ramo, um grupo por ramo (sem seções) e adultos em Escotistas, Dirigentes e Sem
 * função (pela função ativa; quem tem as duas aparece nos dois). Filtro de situação e efetivo no topo.
 * `revisao=para_revisar`: só os cadastros do registro rápido ainda não revisados (049).
 */
export default async function AssociatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;

  const [all, functions] = await Promise.all([associatesData.list(db, groupId), functionsData.list(db, groupId)]);
  const branch = params.ramo && isScoutBranch(params.ramo) ? params.ramo : "";
  const status = statusFilter(params.situacao);
  const today = todayISO();
  const kinds = activeFunctionKinds(functions, today);
  const scouterOf = scouterSections(functions, today);

  const active = all.filter((a) => a.active);
  const youth = active.filter((a) => a.branch !== "adulto").length;
  const onlyReview = params.revisao === "para_revisar";
  const toReview = all.filter((a) => a.review_status === "para_revisar").length;
  const shown = all.filter((a) => (!onlyReview || a.review_status === "para_revisar") && (!branch || a.branch === branch)
    && (status === "todos" || (status === "ativos") === a.active)
    && matchesQuery(a.name, params.q));
  const groups = listGroups(shown, branch, kinds);
  const shownActive = shown.filter((a) => a.active).length;
  const shownInactive = shown.length - shownActive;
  const columns = 3;

  // Abas mantêm busca e situação; trocam só o ramo.
  const hrefFor = (ramo: string) => {
    const next = new URLSearchParams();
    if (ramo) next.set("ramo", ramo);
    if (params.situacao) next.set("situacao", params.situacao);
    if (params.q) next.set("q", params.q);
    if (onlyReview) next.set("revisao", "para_revisar");
    return next.size ? `/associados?${next}` : "/associados";
  };
  const tab = BRANCH_TABS.find((t) => t.value === branch) ?? BRANCH_TABS[0];

  return <div className="shell">
    <AppHeader current="/associados" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Associados" crumbs={[{ label: "Associados" }]}
        description={<>Efetivo hoje: <strong className="num">{active.length}</strong> {active.length === 1 ? "ativo" : "ativos"} (<span className="num">{youth}</span> {youth === 1 ? "jovem" : "jovens"} e <span className="num">{active.length - youth}</span> {active.length - youth === 1 ? "adulto" : "adultos"}).</>}
        actions={<>
          {onlyReview
            ? <Link href={reviewToggle(params, false)} className={PILL} title="Mostrar todos os associados"><IconBolt className="size-4" aria-hidden /> Só os para revisar <IconX className="size-3.5" aria-label="tirar o filtro" /></Link>
            : toReview > 0 && <Link href={reviewToggle(params, true)} className={PILL} title="Cadastros do registro rápido ainda não conferidos"><IconBolt className="size-4" aria-hidden /> {toReview} para revisar</Link>}
          <ReportsDialog toReview={toReview} />
          {member.associates.canWrite && <Link href="/associados/novo" className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Novo associado</Link>}
        </>}>
        <SectionTabs label="Ramos" tabs={BRANCH_TABS.map((t) => ({ href: hrefFor(t.value), label: t.label, active: t.value === branch }))} />
        <AssociateFilters />
      </PageHeader>
      {params.excluido === "1" && <p role="status" className="surface m-0 mb-4 px-4 py-3 text-sm">
        Cadastro excluído: some das telas agora e é apagado de vez em {DELETION_DAYS} dias. Até lá, dá para restaurar em{" "}
        <Link href="/associados/configuracoes/excluidos" className="font-semibold text-primary hover:underline">Configurações › Excluídos</Link>.
      </p>}
      <SectionCard>
        <SectionHeader title={branch ? tab.label : "Todos os associados"}>
          <SectionCount>
            {status !== "desligados" && `${shownActive} ${shownActive === 1 ? "ativo" : "ativos"}`}
            {status === "todos" && " · "}
            {status !== "ativos" && `${shownInactive} ${shownInactive === 1 ? "desligado" : "desligados"}`}
          </SectionCount>
        </SectionHeader>
        {groups.length === 0
          ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum associado encontrado.</p>
          : <div className="overflow-x-auto"><Table className="min-w-[520px]">
            <TableCaption className="sr-only">Associados por ramo</TableCaption>
            <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
              <TableHead className={HEAD_CLASS}>Nome</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-24 text-right")}>Idade</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-28")}>Nascimento</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {groups.map((group) => <Fragment key={group.key}>
                <GroupRow group={group} columns={columns} />
                {group.rows.map((row) => <AssociateLine key={row.id} associate={row} today={today} indent={group.level === "sub"}
                  scouterOf={group.key === "adulto-escotista" ? scouterOf.get(row.id) : undefined} />)}
              </Fragment>)}
            </TableBody>
          </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}

const PILL = "inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-3 py-1 text-xs font-semibold text-caution hover:ring-1 hover:ring-current";

/** Liga ou desliga o filtro do registro rápido, mantendo os demais. */
function reviewToggle(params: Search, on: boolean) {
  const next = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== "revisao" && typeof value === "string") as [string, string][]);
  if (on) next.set("revisao", "para_revisar");
  return next.size ? `/associados?${next}` : "/associados";
}

/** Subtítulo: ramo ou, nos adultos, o grupo por função (Escotistas, Dirigentes, Honoríficos, Comissão fiscal) ou Sem função. */
function GroupRow({ group, columns }: { group: ListGroup; columns: number }) {
  return <TableRow className="hover:bg-transparent">
    <TableCell colSpan={columns} className={cn(CELL_CLASS, group.level === "root" ? "bg-secondary pt-3 text-sm font-bold" : "bg-muted/60 text-xs font-semibold text-muted-foreground")}
      style={group.level === "sub" ? { paddingLeft: "0.75rem" } : undefined}>
      {group.label} <span className="num font-normal text-muted-foreground">({group.count})</span>
    </TableCell>
  </TableRow>;
}

/** Linha do associado. Entrada, passagens e histórico ficam só na ficha. `scouterOf`: seções do escotista. */
function AssociateLine({ associate, today, indent, scouterOf }: { associate: AssociateProfile; today: string; indent: boolean; scouterOf?: string[] }) {
  const place = scouterOf?.join(", ") || [associate.section, associate.patrol].filter(Boolean).join(" › ");
  return <TableRow className={cn(!associate.active && "text-muted-foreground")}>
    <TableCell className={cn(CELL_CLASS, "whitespace-normal")} style={indent ? { paddingLeft: "2rem" } : undefined}>
      <Link href={`/associados/${associate.id}`} className="font-medium hover:underline">{associate.name}</Link>
      {place && <span className="ml-2 text-[11px] text-muted-foreground">{place}</span>}
      {associate.review_status === "para_revisar" && <Badge variant="caution" className="ml-2 align-middle">Revisar</Badge>}
      {!associate.active && <Badge variant="outline" className="ml-2 align-middle">Desligado{associate.left_on && ` em ${dateBR(associate.left_on)}`}</Badge>}
    </TableCell>
    <TableCell className={cn(CELL_CLASS, "num text-right")}>{ageLabel(ageInYears(associate.birth_date, today))}</TableCell>
    <TableCell className={cn(CELL_CLASS, "num")}>{associate.birth_date ? dateBR(associate.birth_date) : "—"}</TableCell>
  </TableRow>;
}
