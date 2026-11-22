import { Link } from "@geas/ui/components/link";
import type { ReactNode } from "react";
import { IconArrowRight, IconBolt, IconCake, IconCircleCheck, IconPlus, IconStar } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { Badge } from "@geas/ui/components/badge";
import { ListCard, StatCard } from "@geas/ui/components/stat-card";
import { cn } from "@geas/ui/lib/utils";
import { NewEntryButton } from "@/components/finance/entries/entry-editor";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { ALL_DATES, currentYear } from "@/lib/finance/filters";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { dateBR, formatCents } from "@/lib/format";
import { EXPIRY_WARNING_DAYS } from "@/lib/inventory/vocabulary";
import { DATES_AFTER_DAYS, DATES_BEFORE_DAYS, relativeDay, VALIDITY_WARNING_DAYS } from "@/lib/associates/alerts";
import { ageYearsMonthsLabel } from "@/lib/associates/model";
import { overview as associatesOverview } from "@/lib/server/associates/home";
import { REVIEW_HREF } from "@/lib/quick";
import { countToReview as associatesToReview } from "@/lib/server/associates/associates";
import { countToReview as entriesToReview } from "@/lib/server/finance/entries";
import * as financeHome from "@/lib/server/finance/home";
import { overview as inventoryOverview } from "@/lib/server/inventory/overview";
import { pageSession } from "@/lib/server/session";

type Module = "financeiro" | "inventario" | "associados";
type Alert = { module: Module; count: number; label: string; href: string };

const MODULE_LABEL: Record<Module, string> = { financeiro: "Financeiro", inventario: "Inventário", associados: "Associados" };
const TRANSITION_BADGE = { critico: "destructive", aviso: "caution", iniciada: "info" } as const;
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Início geral: o que precisa de atenção nos módulos (só o que tem algo a fazer), os vencimentos de registro, as datas e
 * transições dos associados e um cartão por módulo com os números principais. Os detalhes ficam no Resumo de cada módulo (/financeiro, /inventario).
 */
export default async function Home() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const year = currentYear();
  const today = todayInSaoPaulo();

  const [months, pendingDocs, accounts, overdue, openLines, inventory, associates, entriesReview, associatesReview] = await Promise.all([
    financeHome.yearMonths(db, groupId, year), financeHome.pendingDocuments(db, groupId), financeHome.accountBalances(db, groupId, today),
    financeHome.overdueFees(db, groupId, year),
    member.finance.canEdit ? financeHome.openStatementLines(db, groupId) : Promise.resolve(0),
    inventoryOverview(db, groupId, today, member.inventory.canManage), associatesOverview(db, groupId, today),
    member.finance.canEdit ? entriesToReview(db, groupId) : Promise.resolve(0),
    member.associates.canEdit ? associatesToReview(db, groupId) : Promise.resolve(0),
  ]);
  const income = months.reduce((sum, m) => sum + m.income, 0);
  const expense = months.reduce((sum, m) => sum + m.expense, 0);
  const inAccounts = accounts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);

  const plural = (count: number, one: string, many: string) => `${count === 1 ? one : many}`;
  const lateTransitions = associates.transitions.filter((t) => t.level === "critico").length;
  const expired = associates.expiries.filter((e) => e.days < 0).length;
  const expiring = associates.expiries.length - expired;
  const canQuick = member.finance.canEdit || member.inventory.canEdit || member.associates.canEdit;
  const alerts: Alert[] = ([
    { module: "financeiro", count: entriesReview, label: plural(entriesReview, "lançamento do registro rápido para revisar", "lançamentos do registro rápido para revisar"),
      href: REVIEW_HREF.financeiro },
    { module: "financeiro", count: pendingDocs, label: plural(pendingDocs, "lançamento sem documento na pasta", "lançamentos sem documento na pasta"),
      href: `/financeiro/lancamentos/movimentacoes?pasta=pendente&de=${ALL_DATES}` },
    { module: "financeiro", count: overdue.length, label: plural(overdue.length, "associado com mensalidade atrasada", "associados com mensalidade atrasada"),
      href: "/financeiro/mensalidades/controle?atrasados=1" },
    { module: "financeiro", count: openLines, label: plural(openLines, "linha do extrato a conciliar", "linhas do extrato a conciliar"), href: "/financeiro/extrato/conciliar" },
    { module: "inventario", count: inventory.pendingReview ?? 0, label: plural(inventory.pendingReview ?? 0, "movimento para revisar", "movimentos para revisar"),
      href: "/inventario/movimentacoes?revisao=para_revisar" },
    { module: "inventario", count: inventory.belowMinimum, label: plural(inventory.belowMinimum, "material abaixo do mínimo", "materiais abaixo do mínimo"),
      href: "/inventario/materiais?alerta=1" },
    { module: "inventario", count: inventory.expired, label: plural(inventory.expired, "lote vencido", "lotes vencidos"), href: "/inventario/materiais?validade=vencido" },
    { module: "associados", count: associatesReview, label: plural(associatesReview, "cadastro do registro rápido para revisar", "cadastros do registro rápido para revisar"),
      href: REVIEW_HREF.associados },
    { module: "associados", count: lateTransitions, label: plural(lateTransitions, "jovem que já devia ter passado de ramo", "jovens que já deviam ter passado de ramo"),
      href: "/#transitions-title" },
    { module: "associados", count: associates.pending.jovem, label: plural(associates.pending.jovem, "pendência no controle dos jovens", "pendências no controle dos jovens"),
      href: "/associados/controle?pendencias=1" },
    { module: "associados", count: associates.pending.adulto, label: plural(associates.pending.adulto, "pendência no controle dos adultos", "pendências no controle dos adultos"),
      href: "/associados/controle?publico=adultos&pendencias=1" },
    { module: "associados", count: expired, label: plural(expired, "registro vencido", "registros vencidos"), href: "/#expiries-title" },
    { module: "associados", count: expiring, label: plural(expiring, `registro vencendo em ${VALIDITY_WARNING_DAYS} dias`, `registros vencendo em ${VALIDITY_WARNING_DAYS} dias`),
      href: "/#expiries-title" },
    { module: "inventario", count: inventory.expiringSoon, label: plural(inventory.expiringSoon, `lote vencendo em ${EXPIRY_WARNING_DAYS} dias`, `lotes vencendo em ${EXPIRY_WARNING_DAYS} dias`), href: "/inventario/materiais?validade=valido&ordem=validade" },
  ] satisfies Alert[]).filter((alert) => alert.count > 0);

  return <div className="shell">
    <GestaoHeader current="/" email={user.email} role={member.finance.role} isAdmin={member.isAdmin} quick={canQuick} />
    <PageBody>
      <PageHeader title="Início" hideTitle actions={<>
        {canQuick && <Link href="/rapido" className={buttonVariants({ variant: "outline", size: "lg" })}><IconBolt data-icon="inline-start" /> Registro rápido</Link>}
        {member.finance.canEdit && <NewEntryButton returnHref="" />}
        {member.inventory.canEdit && <Link href="/inventario/materiais/novo" className={buttonVariants({ variant: "outline", size: "lg" })}><IconPlus data-icon="inline-start" /> Novo material</Link>}
      </>} />

      <ListCard title="Precisa de atenção" titleId="attention-title"
        empty={<span className="inline-flex items-center gap-1.5 text-success"><IconCircleCheck className="size-4" aria-hidden /> Nada pendente nos módulos.</span>}>
        {alerts.length > 0 && <ul className={cn("m-0 grid list-none p-0", alerts.length > 1 && "md:grid-cols-2")}>{alerts.map((alert) => <li key={alert.label} className={cn("border-t first:border-t-0", alerts.length > 1 && "md:[&:nth-child(2)]:border-t-0 md:odd:border-r")}>
          <Link href={alert.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted">
            <span className="num min-w-8 rounded-full bg-caution-soft px-2 py-0.5 text-center text-xs font-bold text-caution">{alert.count}</span>
            <span className="min-w-0 flex-1">{alert.label}</span>
            <span className={cn("shrink-0 text-[11px] font-bold tracking-wider uppercase", `geas-app--${alert.module}`)}>{MODULE_LABEL[alert.module]}</span>
          </Link>
        </li>)}</ul>}
      </ListCard>

      <ListCard title="Vencimentos de registro" titleId="expiries-title" href="/associados/controle" linkLabel="Controle"
        empty={`Nenhum registro vencido nem vencendo nos próximos ${VALIDITY_WARNING_DAYS} dias.`}>
        {associates.expiries.length > 0 && <ul className={cn("m-0 grid list-none p-0", associates.expiries.length > 1 && "md:grid-cols-2")}>
          {associates.expiries.map((e) => <li key={`${e.associateId}-${e.item}-${e.validUntil}`} className={cn("border-t first:border-t-0", associates.expiries.length > 1 && "md:[&:nth-child(2)]:border-t-0 md:odd:border-r")}>
            <Link href={`/associados/${e.associateId}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{e.item} · <span className="num">{dateBR(e.validUntil)}</span></span>
              </span>
              <Badge variant={e.days < 0 ? "destructive" : "caution"} className="shrink-0">{e.days < 0 ? `venceu ${relativeDay(e.days)}` : `vence ${relativeDay(e.days)}`}</Badge>
            </Link>
          </li>)}
        </ul>}
      </ListCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListCard title="Aniversários e promessas" titleId="dates-title" href="/associados" linkLabel="Associados"
          empty={`Nenhum aniversário nem promessa entre ${DATES_BEFORE_DAYS} dias atrás e ${DATES_AFTER_DAYS} dias à frente.`}>
          {associates.dates.length > 0 && <ul className="m-0 list-none p-0">{associates.dates.map((date) => <li key={`${date.associateId}-${date.kind}`} className="border-t first:border-t-0">
            <Link href={`/associados/${date.associateId}`} className={cn("flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted", date.days < 0 && "text-muted-foreground")}>
              {date.kind === "aniversario" ? <IconCake className="size-4 shrink-0 text-primary" aria-hidden /> : <IconStar className="size-4 shrink-0 text-primary" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{date.name}</span>
              <span className="shrink-0 text-xs">{date.kind === "aniversario" ? `${date.years} anos` : `${date.years} ${date.years === 1 ? "ano" : "anos"} de promessa`}</span>
              <span className={cn("w-24 shrink-0 text-right text-xs num", date.days === 0 && "font-semibold text-primary")}>{dayMonth(date.on)} · {relativeDay(date.days)}</span>
            </Link>
          </li>)}</ul>}
        </ListCard>
        <ListCard title="Transição de ramo" titleId="transitions-title" href="/associados" linkLabel="Associados"
          empty="Nenhum jovem em período de transição.">
          {associates.transitions.length > 0 && <ul className="m-0 list-none p-0">{associates.transitions.map((t) => <li key={t.associateId} className="border-t first:border-t-0">
            <Link href={`/associados/${t.associateId}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{t.label}</span>
              </span>
              <Badge variant={TRANSITION_BADGE[t.level]} className="shrink-0" title={`Até ${dateBR(t.criticalOn)}`}>{t.text}</Badge>
              <span className="w-32 shrink-0 text-right text-xs num">{ageYearsMonthsLabel(t.age)}</span>
            </Link>
          </li>)}</ul>}
        </ListCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ModuleCard module="financeiro" href="/financeiro" linkLabel="Resumo do financeiro">
          <StatCard label="Saldo nas contas hoje" value={formatCents(inAccounts)} tone={inAccounts < 0 ? "destructive" : "neutral"} />
          <StatCard label={`Saldo de ${year}`} value={formatCents(income - expense)} tone={income - expense < 0 ? "destructive" : "neutral"} />
          <StatCard label={`Receitas em ${year}`} value={formatCents(income)} tone="success" />
          <StatCard label={`Despesas em ${year}`} value={formatCents(expense)} tone="destructive" />
        </ModuleCard>
        <ModuleCard module="inventario" href="/inventario/materiais" linkLabel="Materiais do inventário">
          <StatCard label="Materiais" value={inventory.materials} href="/inventario/materiais" />
          <StatCard label="Valor estimado" value={formatCents(inventory.estimatedValueCents)} />
          <StatCard label="Abaixo do mínimo" value={inventory.belowMinimum} tone={inventory.belowMinimum > 0 ? "warning" : "neutral"} />
          <StatCard label="Lotes vencidos" value={inventory.expired} tone={inventory.expired > 0 ? "destructive" : "neutral"} href={inventory.expired > 0 ? "/inventario/materiais?validade=vencido" : undefined} />
        </ModuleCard>
      </div>
    </PageBody>
  </div>;
}

/** Cartão de um módulo: nome na cor do módulo, quatro indicadores e o link para o Resumo dele. */
function ModuleCard({ module, href, linkLabel, children }: { module: Module; href: string; linkLabel: string; children: ReactNode }) {
  const titleId = `${module}-card-title`;
  return <section aria-labelledby={titleId} className="grid gap-3 surface p-4">
    <div className="flex items-center justify-between gap-3">
      <h2 id={titleId} className={cn("m-0 text-sm font-bold tracking-[.16em] uppercase", `geas-app--${module}`)}>{MODULE_LABEL[module]}</h2>
      <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{linkLabel} <IconArrowRight className="size-3.5" aria-hidden /></Link>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  </section>;
}
