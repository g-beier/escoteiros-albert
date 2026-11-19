import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight, IconFolderExclamation, IconPlus } from "@tabler/icons-react";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/finance/app-header";
import { PageBody } from "@/components/finance/nav/page-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { MONTHS } from "@/lib/finance/export/period";
import { ALL_DATES, currentYear } from "@/lib/finance/filters";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { dateBR, formatCents } from "@/lib/format";
import * as home from "@/lib/server/finance/home";
import { pageSession } from "@/lib/server/session";

const OVERDUE_SHOWN = 12;

/** Resumo do Financeiro: ano em números, contas, mês a mês, últimos lançamentos e atrasos. */
export default async function FinanceSummary() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const canEdit = member.finance.canEdit;
  const year = currentYear();
  const today = todayInSaoPaulo();

  const [months, pendingDocs, accounts, recentRows, overdue] = await Promise.all([
    home.yearMonths(db, groupId, year), home.pendingDocuments(db, groupId), home.accountBalances(db, groupId, today),
    home.recentEntries(db, groupId, today), home.overdueFees(db, groupId, year),
  ]);
  const income = months.reduce((sum, m) => sum + m.income, 0);
  const expense = months.reduce((sum, m) => sum + m.expense, 0);
  const inAccounts = accounts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);
  const yearBalance = income - expense;
  const moneyTotal = income + expense;
  const thisMonth = Number(today.slice(5, 7));
  const lastMonth = Math.max(thisMonth, ...months.map((m, i) => (m.income || m.expense ? i + 1 : 0)));
  const monthRows = months.slice(0, lastMonth).map((m, i) => ({
    label: MONTHS[i], ...m, balance: m.income - m.expense,
    accumulated: months.slice(0, i + 1).reduce((sum, x) => sum + x.income - x.expense, 0),
  }));
  const yearRange = `de=${year}-01-01&ate=${year}-12-31`;
  const detalhamento = `/financeiro/lancamentos/detalhamento?${yearRange}`;

  return <div className="shell">
    <AppHeader role={member.finance.role} email={user.email} current="/financeiro" />
    <PageBody width="narrow">
      <h1 className="geas-sr-only">Resumo de {year}</h1>

      <section className="grid gap-2" aria-labelledby="year-title">
        <SectionHeader
          title={`Resumo de ${year}`}
          titleId="year-title"
          description="Saldo das contas, receitas e despesas do ano.">
          <SectionCount>
            <span className="font-semibold text-foreground">{formatCents(inAccounts)}</span> nas contas
          </SectionCount>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/financeiro/lancamentos/movimentacoes" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Ver lançamentos <IconArrowRight data-icon="inline-end" />
            </Link>
            {canEdit && <Link href="/financeiro/lancamentos/novo" className={buttonVariants({ size: "sm" })}>
              <IconPlus data-icon="inline-start" /> Novo lançamento
            </Link>}
          </div>
        </SectionHeader>
        <div className="surface overflow-hidden">
          <div className="grid gap-4 p-4">
            {moneyTotal > 0 && <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img"
              aria-label={`Receitas ${formatCents(income)}, despesas ${formatCents(expense)}`}>
              {income > 0 && <span className="h-full bg-success" style={{ width: `${(income / moneyTotal) * 100}%` }} title={`Receitas: ${formatCents(income)}`} />}
              {expense > 0 && <span className="h-full bg-destructive" style={{ width: `${(expense / moneyTotal) * 100}%` }} title={`Despesas: ${formatCents(expense)}`} />}
            </div>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Saldo nas contas hoje" value={formatCents(inAccounts)} tone={inAccounts < 0 ? "destructive" : "neutral"} />
              <Metric label={`Receitas em ${year}`} value={formatCents(income)} tone="success" href={detalhamento} />
              <Metric label={`Despesas em ${year}`} value={formatCents(expense)} tone="destructive" href={detalhamento} />
              <Metric label={`Saldo de ${year}`} value={formatCents(yearBalance)} tone={yearBalance < 0 ? "destructive" : "neutral"} />
              <Metric
                label="Documentos pendentes"
                value={pendingDocs > 0
                  ? <span className="inline-flex items-center gap-1.5"><IconFolderExclamation className="size-5" aria-hidden />{pendingDocs}</span>
                  : "0"}
                tone={pendingDocs > 0 ? "warning" : "neutral"}
                href={pendingDocs > 0 ? `/financeiro/lancamentos/movimentacoes?pasta=pendente&de=${ALL_DATES}` : undefined}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-7 lg:grid-cols-2">
        <section className="grid gap-2" aria-labelledby="accounts-title">
          <SectionHeader
            title="Contas"
            titleId="accounts-title"
            description="Saldo de cada conta ativa hoje.">
            <SectionCount>{accounts.length} {accounts.length === 1 ? "conta" : "contas"}</SectionCount>
          </SectionHeader>
          <div className="surface overflow-hidden">
            {accounts.length === 0
              ? <p className="m-0 px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma conta ativa.</p>
              : <ul className="m-0 grid list-none gap-1 p-3">
                {accounts.map((account) => <li key={account.id}>
                  <Link href={`/financeiro/lancamentos/movimentacoes?conta=${account.id}&de=${ALL_DATES}`}
                    className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-muted">
                    <span className="min-w-0 flex-1 truncate text-foreground">{account.name}</span>
                    {account.balanceCents === null
                      ? <span className="text-xs text-muted-foreground" title={account.openingDate ? `Saldo inicial em ${dateBR(account.openingDate)}` : undefined}>sem saldo</span>
                      : <span className={cn("num shrink-0 font-semibold", account.balanceCents < 0 && "text-destructive")}>{formatCents(account.balanceCents)}</span>}
                  </Link>
                </li>)}
              </ul>}
          </div>
        </section>

        <section className="grid gap-2" aria-labelledby="recent-title">
          <SectionHeader
            title="Últimos lançamentos"
            titleId="recent-title"
            description="Movimentos mais recentes do grupo.">
            <Link href="/financeiro/lancamentos/movimentacoes" className="text-xs font-semibold text-primary hover:underline">Ver todos</Link>
          </SectionHeader>
          <div className="surface overflow-hidden">
            {recentRows.length === 0
              ? <p className="m-0 px-4 py-8 text-center text-xs text-muted-foreground">Nenhum lançamento ainda.</p>
              : <ul className="m-0 grid max-h-80 list-none gap-1 overflow-auto overscroll-contain p-3">
                {recentRows.map((r) => <li key={r.entry_id}>
                  <Link href={`/financeiro/lancamentos/${r.entry_id}`}
                    className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-muted">
                    <span className="num w-20 shrink-0 text-xs text-muted-foreground">{dateBR(r.entry_date)}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{r.name}</span>
                    <span className={cn("num shrink-0 font-semibold", r.total_cents < 0 ? "text-destructive" : "text-success")}>{formatCents(r.total_cents)}</span>
                  </Link>
                </li>)}
              </ul>}
          </div>
        </section>

        <section className="grid gap-2" aria-labelledby="monthly-title">
          <SectionHeader
            title="Mês a mês"
            titleId="monthly-title"
            description={`Receitas, despesas e saldo acumulado de ${year}.`} />
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto p-3">
              <table className="w-full min-w-[28rem] border-separate border-spacing-y-1 text-xs">
                <thead>
                  <tr>
                    <th className="rounded-l-2xl bg-muted px-3 py-2 text-left font-semibold text-foreground">Mês</th>
                    <th className="bg-muted px-3 py-2 text-right font-semibold text-foreground">Receitas</th>
                    <th className="bg-muted px-3 py-2 text-right font-semibold text-foreground">Despesas</th>
                    <th className="bg-muted px-3 py-2 text-right font-semibold text-foreground">Saldo</th>
                    <th className="rounded-r-2xl bg-muted px-3 py-2 text-right font-semibold text-foreground">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((m, index) => {
                    const dark = index % 2 === 1;
                    const rowBg = dark ? "bg-muted" : "bg-card";
                    const round = dark ? "first:rounded-l-2xl last:rounded-r-2xl" : "";
                    return <tr key={m.label}>
                      <td className={cn("px-3 py-2", rowBg, round)}>{m.label}</td>
                      <td className={cn("num px-3 py-2 text-right text-success", rowBg, round)}>{formatCents(m.income)}</td>
                      <td className={cn("num px-3 py-2 text-right text-destructive", rowBg, round)}>{formatCents(m.expense)}</td>
                      <td className={cn("num px-3 py-2 text-right font-semibold", rowBg, round, m.balance < 0 && "text-destructive")}>{formatCents(m.balance)}</td>
                      <td className={cn("num px-3 py-2 text-right text-muted-foreground", rowBg, round, m.accumulated < 0 && "text-destructive")}>{formatCents(m.accumulated)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-2" aria-labelledby="overdue-title">
          <SectionHeader
            title="Mensalidades atrasadas"
            titleId="overdue-title"
            description={`Associados com mensalidade em atraso em ${year}.`}>
            <Link href="/financeiro/mensalidades/controle?atrasados=1" className="text-xs font-semibold text-primary hover:underline">Ver atrasados</Link>
          </SectionHeader>
          <div className="surface overflow-hidden">
            {overdue.length === 0
              ? <p className="m-0 px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma mensalidade atrasada em {year}.</p>
              : <ul className="m-0 grid max-h-80 list-none gap-1 overflow-auto overscroll-contain p-3">
                {overdue.slice(0, OVERDUE_SHOWN).map(({ associate, overdue: count }) => <li key={associate.id}>
                  <Link
                    href={associate.section ? `/financeiro/mensalidades/controle?${new URLSearchParams({ secao: associate.section })}` : "/financeiro/mensalidades/controle"}
                    className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-muted">
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {associate.name}
                      {associate.section && <span className="text-muted-foreground"> · {associate.section}</span>}
                    </span>
                    <span className="num shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                      title={`${count} ${count === 1 ? "mês atrasado" : "meses atrasados"}`}>
                      {count}
                      <span className="sr-only"> {count === 1 ? "mês atrasado" : "meses atrasados"}</span>
                    </span>
                  </Link>
                </li>)}
                {overdue.length > OVERDUE_SHOWN && <li className="px-3 py-2 text-xs text-muted-foreground">
                  e mais {overdue.length - OVERDUE_SHOWN} {overdue.length - OVERDUE_SHOWN === 1 ? "associado" : "associados"}
                </li>}
              </ul>}
          </div>
        </section>
      </div>
    </PageBody>
  </div>;
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
