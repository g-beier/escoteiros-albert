import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight, IconCircleCheck, IconPlus } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { ListCard, StatCard } from "@geas/ui/components/stat-card";
import { cn } from "@geas/ui/lib/utils";
import { NewEntryButton } from "@/components/finance/entries/entry-editor";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { ALL_DATES, currentYear } from "@/lib/finance/filters";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { formatCents } from "@/lib/format";
import { EXPIRY_WARNING_DAYS } from "@/lib/inventory/vocabulary";
import * as financeHome from "@/lib/server/finance/home";
import { overview as inventoryOverview } from "@/lib/server/inventory/overview";
import { pageSession } from "@/lib/server/session";

type Module = "financeiro" | "inventario";
type Alert = { module: Module; count: number; label: string; href: string };

const MODULE_LABEL: Record<Module, string> = { financeiro: "Financeiro", inventario: "Inventário" };

/**
 * Início geral: o que precisa de atenção nos dois módulos (só o que tem algo a fazer) e um cartão por módulo com os
 * números principais. Os detalhes ficam no Resumo de cada módulo (/financeiro, /inventario).
 */
export default async function Home() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const year = currentYear();
  const today = todayInSaoPaulo();

  const [months, pendingDocs, accounts, overdue, openLines, inventory] = await Promise.all([
    financeHome.yearMonths(db, groupId, year), financeHome.pendingDocuments(db, groupId), financeHome.accountBalances(db, groupId, today),
    financeHome.overdueFees(db, groupId, year),
    member.finance.canEdit ? financeHome.openStatementLines(db, groupId) : Promise.resolve(0),
    inventoryOverview(db, groupId, today, member.inventory.canManage),
  ]);
  const income = months.reduce((sum, m) => sum + m.income, 0);
  const expense = months.reduce((sum, m) => sum + m.expense, 0);
  const inAccounts = accounts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);

  const plural = (count: number, one: string, many: string) => `${count === 1 ? one : many}`;
  const alerts: Alert[] = ([
    { module: "financeiro", count: pendingDocs, label: plural(pendingDocs, "lançamento sem documento na pasta", "lançamentos sem documento na pasta"),
      href: `/financeiro/lancamentos/movimentacoes?pasta=pendente&de=${ALL_DATES}` },
    { module: "financeiro", count: overdue.length, label: plural(overdue.length, "associado com mensalidade atrasada", "associados com mensalidade atrasada"),
      href: "/financeiro/mensalidades/controle?atrasados=1" },
    { module: "financeiro", count: openLines, label: plural(openLines, "linha do extrato a conciliar", "linhas do extrato a conciliar"), href: "/financeiro/extrato/conciliar" },
    { module: "inventario", count: inventory.pendingReview ?? 0, label: plural(inventory.pendingReview ?? 0, "movimento pendente de revisão", "movimentos pendentes de revisão"),
      href: "/inventario/movimentacoes?revisao=pendente" },
    { module: "inventario", count: inventory.belowMinimum, label: plural(inventory.belowMinimum, "material abaixo do mínimo", "materiais abaixo do mínimo"),
      href: "/inventario/materiais?alerta=1" },
    { module: "inventario", count: inventory.expired, label: plural(inventory.expired, "lote vencido", "lotes vencidos"), href: "/inventario" },
    { module: "inventario", count: inventory.expiringSoon, label: plural(inventory.expiringSoon, `lote vencendo em ${EXPIRY_WARNING_DAYS} dias`, `lotes vencendo em ${EXPIRY_WARNING_DAYS} dias`), href: "/inventario" },
  ] satisfies Alert[]).filter((alert) => alert.count > 0);

  return <div className="shell">
    <GestaoHeader current="/" email={user.email} role={member.finance.role} isAdmin={member.isAdmin} />
    <PageBody>
      <PageHeader title="Início" hideTitle actions={<>
        {member.finance.canEdit && <NewEntryButton returnHref="" />}
        {member.inventory.canEdit && <Link href="/inventario/materiais/novo" className={buttonVariants({ variant: "outline", size: "lg" })}><IconPlus data-icon="inline-start" /> Novo material</Link>}
      </>} />

      <ListCard title="Precisa de atenção" titleId="attention-title"
        empty={<span className="inline-flex items-center gap-1.5 text-success"><IconCircleCheck className="size-4" aria-hidden /> Nada pendente nos dois módulos.</span>}>
        {alerts.length > 0 && <ul className={cn("m-0 grid list-none p-0", alerts.length > 1 && "md:grid-cols-2")}>{alerts.map((alert) => <li key={alert.label} className={cn("border-t first:border-t-0", alerts.length > 1 && "md:[&:nth-child(2)]:border-t-0 md:odd:border-r")}>
          <Link href={alert.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted">
            <span className="num min-w-8 rounded-full bg-[#f5eed1] px-2 py-0.5 text-center text-xs font-bold text-[#725d0d]">{alert.count}</span>
            <span className="min-w-0 flex-1">{alert.label}</span>
            <span className={cn("shrink-0 text-[11px] font-bold tracking-wider uppercase", `geas-app--${alert.module}`)}>{MODULE_LABEL[alert.module]}</span>
          </Link>
        </li>)}</ul>}
      </ListCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ModuleCard module="financeiro" href="/financeiro" linkLabel="Resumo do financeiro">
          <StatCard label="Saldo nas contas hoje" value={formatCents(inAccounts)} tone={inAccounts < 0 ? "destructive" : "neutral"} />
          <StatCard label={`Saldo de ${year}`} value={formatCents(income - expense)} tone={income - expense < 0 ? "destructive" : "neutral"} />
          <StatCard label={`Receitas em ${year}`} value={formatCents(income)} tone="success" />
          <StatCard label={`Despesas em ${year}`} value={formatCents(expense)} tone="destructive" />
        </ModuleCard>
        <ModuleCard module="inventario" href="/inventario" linkLabel="Resumo do inventário">
          <StatCard label="Materiais" value={inventory.materials} href="/inventario/materiais" />
          <StatCard label="Valor estimado" value={formatCents(inventory.estimatedValueCents)} />
          <StatCard label="Abaixo do mínimo" value={inventory.belowMinimum} tone={inventory.belowMinimum > 0 ? "warning" : "neutral"} />
          <StatCard label="Lotes vencidos" value={inventory.expired} tone={inventory.expired > 0 ? "destructive" : "neutral"} />
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
