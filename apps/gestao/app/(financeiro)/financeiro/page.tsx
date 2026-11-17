import Link from "next/link";
import { IconArrowRight, IconFolderExclamation } from "@tabler/icons-react";
import { buttonVariants } from "@geas/ui/components/button";
import { StatCard as Stat } from "@geas/ui/components/stat-card";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/finance/app-header";
import { NewEntryButton } from "@/components/finance/entries/entry-editor";
import { PAGE_BODY, PageHeader } from "@/components/finance/nav/page-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { MONTHS } from "@/lib/finance/export/period";
import { ALL_DATES, currentYear } from "@/lib/finance/filters";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { dateBR, formatCents } from "@/lib/format";
import * as home from "@/lib/server/finance/home";
import { pageSession } from "@/lib/server/session";

const OVERDUE_SHOWN = 12;

/** Resumo do Financeiro: o ano em números, saldo das contas, mês a mês, últimos lançamentos e mensalidades atrasadas. */
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
  // meses até o atual, ou meses com movimento (se houver lançamentos futuros)
  const thisMonth = Number(today.slice(5, 7));
  const lastMonth = Math.max(thisMonth, ...months.map((m, i) => (m.income || m.expense ? i + 1 : 0)));
  const monthRows = months.slice(0, lastMonth).map((m, i) => ({
    label: MONTHS[i], ...m, balance: m.income - m.expense,
    accumulated: months.slice(0, i + 1).reduce((sum, x) => sum + x.income - x.expense, 0),
  }));
  const yearRange = `de=${year}-01-01&ate=${year}-12-31`;

  return <div className="shell">
    <AppHeader role={member.finance.role} email={user.email} current="/financeiro" />
    <main className={PAGE_BODY}>
      <PageHeader title={`Resumo de ${year}`} crumbs={[{ label: `Resumo de ${year}` }]} actions={<>
        <Link href="/financeiro/lancamentos/movimentacoes" className={buttonVariants({ variant: "outline", size: "lg" })}>Ver lançamentos <IconArrowRight data-icon="inline-end" /></Link>
        {canEdit && <NewEntryButton returnHref="" />}
      </>} />

      <section aria-label="Totais" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Saldo nas contas hoje" value={formatCents(inAccounts)} tone={inAccounts < 0 ? "destructive" : "neutral"} />
        <Stat label={`Receitas em ${year}`} value={formatCents(income)} tone="success" href={`/financeiro/lancamentos/detalhamento?${yearRange}`} />
        <Stat label={`Despesas em ${year}`} value={formatCents(expense)} tone="destructive" href={`/financeiro/lancamentos/detalhamento?${yearRange}`} />
        <Stat label={`Saldo de ${year}`} value={formatCents(income - expense)} tone={income - expense < 0 ? "destructive" : "neutral"} />
        <Stat label="Documentos pendentes" value={String(pendingDocs)} tone={pendingDocs > 0 ? "warning" : "neutral"}
          href={pendingDocs > 0 ? `/financeiro/lancamentos/movimentacoes?pasta=pendente&de=${ALL_DATES}` : undefined}
          icon={pendingDocs > 0 && <IconFolderExclamation className="size-5" aria-hidden />} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <section aria-labelledby="accounts-title" className="overflow-hidden surface">
            <h2 id="accounts-title" className="m-0 border-b px-4 py-2.5 text-sm font-semibold">Contas</h2>
            {accounts.length === 0
              ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma conta ativa.</p>
              : <ul className="m-0 list-none p-0">{accounts.map((account) => <li key={account.id} className="border-t first:border-t-0">
                <Link href={`/financeiro/lancamentos/movimentacoes?conta=${account.id}&de=${ALL_DATES}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate">{account.name}</span>
                  {account.balanceCents === null
                    ? <span className="text-muted-foreground" title={account.openingDate ? `Saldo inicial em ${dateBR(account.openingDate)}` : undefined}>sem saldo</span>
                    : <span className={cn("num shrink-0 font-semibold", account.balanceCents < 0 && "text-destructive")}>{formatCents(account.balanceCents)}</span>}
                </Link>
              </li>)}</ul>}
          </section>

          <section aria-labelledby="monthly-title" className="overflow-hidden surface">
            <h2 id="monthly-title" className="m-0 border-b px-4 py-2.5 text-sm font-semibold">Mês a mês</h2>
            <div className="overflow-x-auto">
              <table className="w-auto min-w-0 text-xs whitespace-nowrap">
                <thead className="bg-muted text-muted-foreground"><tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Mês</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Receitas</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Despesas</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Saldo</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Acumulado</th>
                </tr></thead>
                <tbody>{monthRows.map((m) => <tr key={m.label} className="border-t">
                  <td className="px-2 py-1.5">{m.label}</td>
                  <td className="num px-2 py-1.5 text-right text-success">{formatCents(m.income)}</td>
                  <td className="num px-2 py-1.5 text-right text-destructive">{formatCents(m.expense)}</td>
                  <td className={cn("num px-2 py-1.5 text-right font-semibold", m.balance < 0 && "text-destructive")}>{formatCents(m.balance)}</td>
                  <td className={cn("num px-2 py-1.5 text-right text-muted-foreground", m.accumulated < 0 && "text-destructive")}>{formatCents(m.accumulated)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>

        {/* No desktop as listas não definem a altura da linha (contain:size): acompanham a coluna da esquerda e rolam por dentro. */}
        <section aria-labelledby="recent-title" className="flex flex-col overflow-hidden surface">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
            <h2 id="recent-title" className="m-0 text-sm font-semibold">Últimos lançamentos</h2>
            <Link href="/financeiro/lancamentos/movimentacoes" className="text-xs font-semibold text-primary hover:underline">Ver todos</Link>
          </div>
          {recentRows.length === 0
            ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum lançamento ainda.</p>
            : <ul className="m-0 max-h-96 list-none overflow-auto overscroll-contain p-0 lg:max-h-none lg:min-h-64 lg:flex-1 lg:[contain:size]">{recentRows.map((r) => <li key={r.entry_id} className="border-t first:border-t-0">
              <Link href={`/financeiro/lancamentos/${r.entry_id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
                <span className="num w-20 shrink-0 text-muted-foreground">{dateBR(r.entry_date)}</span>
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className={cn("num shrink-0 font-semibold", r.total_cents < 0 ? "text-destructive" : "text-success")}>{formatCents(r.total_cents)}</span>
              </Link>
            </li>)}</ul>}
        </section>

        <section aria-labelledby="overdue-title" className="flex flex-col overflow-hidden surface lg:max-xl:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 id="overdue-title" className="m-0 text-sm font-semibold">Mensalidades atrasadas</h2>
            <Link href="/financeiro/mensalidades/controle?atrasados=1" className="text-xs font-semibold text-primary hover:underline">Ver atrasados</Link>
          </div>
          {overdue.length === 0
            ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma mensalidade atrasada em {year}.</p>
            : <ul className="m-0 max-h-96 list-none overflow-auto overscroll-contain p-0 xl:max-h-none xl:min-h-64 xl:flex-1 xl:[contain:size]">{overdue.slice(0, OVERDUE_SHOWN).map(({ associate, overdue: count }) => <li key={associate.id} className="border-t first:border-t-0">
              <Link href={associate.section ? `/financeiro/mensalidades/controle?${new URLSearchParams({ secao: associate.section })}` : "/financeiro/mensalidades/controle"} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
                <span className="min-w-0 flex-1 truncate">{associate.name}{associate.section && <span className="text-muted-foreground"> · {associate.section}</span>}</span>
                <span className="num shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive" title={`${count} ${count === 1 ? "mês atrasado" : "meses atrasados"}`}>
                  {count} <span className="sr-only">{count === 1 ? "mês atrasado" : "meses atrasados"}</span></span>
              </Link>
            </li>)}
              {overdue.length > OVERDUE_SHOWN && <li className="border-t px-4 py-2 text-xs text-muted-foreground">e mais {overdue.length - OVERDUE_SHOWN} {overdue.length - OVERDUE_SHOWN === 1 ? "associado" : "associados"}</li>}
            </ul>}
        </section>
      </div>
    </main>
  </div>;
}
