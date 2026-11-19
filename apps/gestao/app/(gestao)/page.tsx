import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight, IconCircleCheck, IconPlus } from "@tabler/icons-react";
import { PageBody } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { cn } from "@geas/ui/lib/utils";
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

/**
 * Início geral: pendências dos dois módulos e um resumo rápido de cada um.
 * Layout no padrão do inventário — título fora, cartão soft só com conteúdo.
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
  const yearBalance = income - expense;
  const moneyTotal = income + expense;

  const plural = (count: number, one: string, many: string) => `${count === 1 ? one : many}`;
  const alerts: Alert[] = ([
    { module: "financeiro", count: pendingDocs, label: plural(pendingDocs, "lançamento sem documento na pasta", "lançamentos sem documento na pasta"),
      href: `/financeiro/lancamentos/movimentacoes?pasta=pendente&de=${ALL_DATES}` },
    { module: "financeiro", count: overdue.length, label: plural(overdue.length, "associado com mensalidade atrasada", "associados com mensalidade atrasada"),
      href: "/financeiro/mensalidades/controle?atrasados=1" },
    { module: "financeiro", count: openLines, label: plural(openLines, "linha do extrato a conciliar", "linhas do extrato a conciliar"), href: "/financeiro/extrato/conciliar" },
    { module: "inventario", count: inventory.pendingReview ?? 0, label: plural(inventory.pendingReview ?? 0, "movimento pendente de revisão", "movimentos pendentes de revisão"),
      href: "/inventario/movimentacoes?revisao=pendente" },
    { module: "inventario", count: inventory.belowMinimum, label: plural(inventory.belowMinimum, "material abaixo do mínimo", "Materiais abaixo do mínimo"),
      href: "/inventario" },
    { module: "inventario", count: inventory.expired, label: plural(inventory.expired, "lote vencido", "Materiais vencidos"), href: "/inventario" },
    { module: "inventario", count: inventory.expiringSoon, label: plural(inventory.expiringSoon, `lote vencendo em ${EXPIRY_WARNING_DAYS} dias`, `Materiais vencendo em ${EXPIRY_WARNING_DAYS} dias`), href: "/inventario" },
  ] satisfies Alert[]).filter((alert) => alert.count > 0);

  const financeAlerts = alerts.filter((a) => a.module === "financeiro").length;
  const inventoryAlerts = alerts.filter((a) => a.module === "inventario").length;

  return <div className="shell">
    <GestaoHeader current="/" email={user.email} role={member.finance.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <h1 className="geas-sr-only">Início</h1>

      <section className="grid gap-2" aria-labelledby="attention-title">
        <SectionHeader
          title="Pontos de atenção"
          titleId="attention-title"
          description={alerts.length === 0
            ? "Nada pendente nos dois módulos."
            : "Pendências do Financeiro e do Inventário que pedem ação."}>
          <SectionCount>
            {alerts.length === 0
              ? "tudo em dia"
              : <>
                {financeAlerts > 0 && <><span className="font-semibold text-foreground">{financeAlerts}</span> financeiro{inventoryAlerts > 0 ? " · " : ""}</>}
              </>}
          </SectionCount>
          {(member.finance.canEdit || member.inventory.canEdit) && <div className="flex flex-wrap items-center gap-2">
            {member.finance.canEdit && <Link href="/financeiro/lancamentos/novo" className={buttonVariants({ size: "sm" })}>
              <IconPlus data-icon="inline-start" /> Novo lançamento
            </Link>}
            {member.inventory.canEdit && <Link href="/inventario/materiais/novo" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <IconPlus data-icon="inline-start" /> Novo material
            </Link>}
          </div>}
        </SectionHeader>
        <div className="surface overflow-hidden">
          {alerts.length === 0
            ? <p className="m-0 flex items-center justify-center gap-1.5 px-4 py-10 text-sm text-success">
              <IconCircleCheck className="size-4" aria-hidden /> Nada pendente nos dois módulos.
            </p>
            : <ul className="m-0 grid list-none gap-1 p-3">
              {alerts.map((alert) => <li key={alert.label}>
                <Link href={alert.href}
                  className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-muted">
                  <span className="num min-w-8 text-center text-xs font-bold text-foreground">{alert.count}</span>
                  <span className="min-w-0 flex-1 text-foreground">{alert.label}</span>
                </Link>
              </li>)}
            </ul>}
        </div>
      </section>

      <div className="grid gap-7 lg:grid-cols-2">
        <ModuleBlock
          title="Financeiro"
          titleId="financeiro-card-title"
          description={`Saldo e movimentos de ${year}.`}
          href="/financeiro"
          linkLabel="Financeiro">
          {moneyTotal > 0 && <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img"
            aria-label={`Receitas ${formatCents(income)}, despesas ${formatCents(expense)}`}>
            {income > 0 && <span className="h-full bg-success" style={{ width: `${(income / moneyTotal) * 100}%` }} title={`Receitas: ${formatCents(income)}`} />}
            {expense > 0 && <span className="h-full bg-destructive" style={{ width: `${(expense / moneyTotal) * 100}%` }} title={`Despesas: ${formatCents(expense)}`} />}
          </div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Saldo nas contas hoje" value={formatCents(inAccounts)} tone={inAccounts < 0 ? "destructive" : "neutral"} />
            <Metric label={`Saldo de ${year}`} value={formatCents(yearBalance)} tone={yearBalance < 0 ? "destructive" : "neutral"} />
            <Metric label={`Receitas em ${year}`} value={formatCents(income)} tone="success" />
            <Metric label={`Despesas em ${year}`} value={formatCents(expense)} tone="destructive" />
          </div>
        </ModuleBlock>

        <ModuleBlock
          title="Inventário"
          titleId="inventario-card-title"
          description="Materiais, valor estimado e alertas de estoque."
          href="/inventario"
          linkLabel="Inventário">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Materiais" value={inventory.materials} href="/inventario" />
            <Metric label="Valor estimado" value={formatCents(inventory.estimatedValueCents)} />
            <Metric label="Abaixo do mínimo" value={inventory.belowMinimum} tone={inventory.belowMinimum > 0 ? "warning" : "neutral"} href={inventory.belowMinimum > 0 ? "/inventario" : undefined} />
            <Metric label="Materiais vencidos" value={inventory.expired} tone={inventory.expired > 0 ? "destructive" : "neutral"} href={inventory.expired > 0 ? "/inventario" : undefined} />
          </div>
        </ModuleBlock>
      </div>
    </PageBody>
  </div>;
}

function ModuleBlock({ title, titleId, description, href, linkLabel, children }: {
  title: string; titleId: string; description: string; href: string; linkLabel: string; children: ReactNode;
}) {
  return <section aria-labelledby={titleId} className="grid gap-2">
    <SectionHeader title={title} titleId={titleId} description={description}>
      <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
        {linkLabel} <IconArrowRight className="size-3.5" aria-hidden />
      </Link>
    </SectionHeader>
    <div className="surface grid gap-4 overflow-hidden p-4">{children}</div>
  </section>;
}

const TONE: Record<"success" | "destructive" | "warning" | "neutral", string> = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-[#725d0d]",
  neutral: "text-foreground",
};

function Metric({ label, value, tone = "neutral", href }: {
  label: string; value: ReactNode; tone?: keyof typeof TONE; href?: string;
}) {
  const body = <>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={cn("num text-xl font-bold", TONE[tone])}>{value}</span>
  </>;
  const className = "grid gap-1 rounded-2xl bg-muted/50 px-3 py-2.5";
  return href
    ? <Link href={href} className={cn(className, "no-underline transition-colors hover:bg-muted")}>{body}</Link>
    : <div className={className}>{body}</div>;
}
