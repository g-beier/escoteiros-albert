import Link from "next/link";
import { IconArrowRight, IconFolderExclamation } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { PAGE_BODY, PageHeader } from "@/components/nav/page-header";
import { NewEntryButton } from "@/components/entries/entry-editor";
import { SetupNeeded } from "@/components/setup-needed";
import { buttonVariants } from "@/components/ui/button";
import type { CategoryKind } from "@/lib/categories";
import type { LedgerRow } from "@/lib/entry-queries";
import { MONTHS } from "@/lib/export/period";
import { ALL_DATES, currentYear } from "@/lib/filters";
import { dateBR, money } from "@/lib/format";
import { pageSession } from "@/lib/session";
import { fetchFeeYear } from "@/lib/fee-queries";
import { overdueRanking } from "@/lib/fees";
import { cn } from "@/lib/utils";

type Sum = { category_id: string; month: number; amount_cents: number };
type MonthTotals = { income: number; expense: number };

/** Receitas e despesas por mês (centavos; despesa positiva). Rubrica sem tipo vale pelo sinal. */
function monthlyTotals(sums: Sum[], kinds: Map<string, CategoryKind | null>): MonthTotals[] {
  const months = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  for (const s of sums) {
    const amount = Number(s.amount_cents);
    const kind = kinds.get(s.category_id) ?? (amount < 0 ? "despesa" : "receita");
    if (kind === "despesa") months[s.month - 1].expense -= amount;
    else months[s.month - 1].income += amount;
  }
  return months;
}

export default async function Dashboard() {
  const { supabase, user, member: membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const groupId = membership.groupId;
  const canEdit = membership.canEdit;
  const year = currentYear();

  const [{ data: categories }, { data: sums }, { count: pendingDocs }, { data: recent }, feeYear] = await Promise.all([
    supabase.from("categories").select("id, kind").eq("group_id", groupId),
    supabase.rpc("realized_by_month", { p_group_id: groupId, p_year: year }),
    supabase.from("ledger_entries").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("document_filed", false),
    supabase.from("ledger_entry_rows").select("entry_id, entry_date, name, payment_method_name, document, document_filed, total_cents")
      .eq("group_id", groupId).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(12),
    fetchFeeYear(supabase, groupId, year),
  ]);

  const kinds = new Map((categories ?? []).map((c) => [c.id as string, c.kind as CategoryKind | null]));
  const months = monthlyTotals((sums ?? []) as Sum[], kinds);
  const income = months.reduce((sum, m) => sum + m.income, 0);
  const expense = months.reduce((sum, m) => sum + m.expense, 0);
  // meses até o atual, ou meses com movimento (se houver lançamentos futuros)
  const thisMonth = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(5, 7));
  const lastMonth = Math.max(thisMonth, ...months.map((m, i) => (m.income || m.expense ? i + 1 : 0)));
  const monthRows = months.slice(0, lastMonth).map((m, i) => ({
    label: MONTHS[i], ...m, balance: m.income - m.expense,
    accumulated: months.slice(0, i + 1).reduce((sum, x) => sum + x.income - x.expense, 0),
  }));
  const recentRows = (recent ?? []) as LedgerRow[];
  const overdue = overdueRanking(feeYear.rows);
  const OVERDUE_SHOWN = 12;

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/" />
    <main className={PAGE_BODY}>
      <PageHeader title={`Resumo de ${year}`} actions={<>
        <Link href="/lancamentos" className={buttonVariants({ variant: "outline", size: "lg" })}>Ver lançamentos <IconArrowRight data-icon="inline-end" /></Link>
        {canEdit && <NewEntryButton returnQuery="" />}
      </>} />

      <section aria-label="Totais do ano" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receitas" value={money(income / 100)} tone="success" href={`/lancamentos?visao=rubricas&de=${year}-01-01&ate=${year}-12-31`} />
        <Stat label="Despesas" value={money(expense / 100)} tone="destructive" href={`/lancamentos?visao=rubricas&de=${year}-01-01&ate=${year}-12-31`} />
        <Stat label="Saldo do ano" value={money((income - expense) / 100)} tone={income - expense < 0 ? "destructive" : "neutral"} />
        <Stat label="Documentos pendentes" value={String(pendingDocs ?? 0)} tone={(pendingDocs ?? 0) > 0 ? "warning" : "neutral"}
          href={(pendingDocs ?? 0) > 0 ? `/lancamentos?pasta=pendente&de=${ALL_DATES}` : undefined} icon={(pendingDocs ?? 0) > 0} />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="monthly-title" className="overflow-hidden rounded-lg border bg-card">
          <h2 id="monthly-title" className="m-0 border-b px-4 py-2.5 text-sm font-semibold">Mês a mês</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground"><tr>
                <th className="px-2 py-1.5 text-left font-semibold">Mês</th>
                <th className="px-2 py-1.5 text-right font-semibold">Receitas</th>
                <th className="px-2 py-1.5 text-right font-semibold">Despesas</th>
                <th className="px-2 py-1.5 text-right font-semibold">Saldo</th>
                <th className="px-2 py-1.5 text-right font-semibold">Acumulado</th>
              </tr></thead>
              <tbody>{monthRows.map((m) => <tr key={m.label} className="border-t">
                <td className="px-2 py-1.5">{m.label}</td>
                <td className="num px-2 py-1.5 text-right text-success">{money(m.income / 100)}</td>
                <td className="num px-2 py-1.5 text-right text-destructive">{money(m.expense / 100)}</td>
                <td className={cn("num px-2 py-1.5 text-right font-semibold", m.balance < 0 && "text-destructive")}>{money(m.balance / 100)}</td>
                <td className={cn("num px-2 py-1.5 text-right text-muted-foreground", m.accumulated < 0 && "text-destructive")}>{money(m.accumulated / 100)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="recent-title" className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 id="recent-title" className="m-0 text-sm font-semibold">Últimos lançamentos</h2>
            <Link href="/lancamentos" className="text-xs font-semibold text-primary hover:underline">Ver todos</Link>
          </div>
          {recentRows.length === 0
            ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum lançamento ainda.</p>
            : <ul className="m-0 list-none p-0">{recentRows.map((r) => <li key={r.entry_id} className="border-t first:border-t-0">
              <Link href={`/lancamentos/${r.entry_id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
                <span className="num w-20 shrink-0 text-muted-foreground">{dateBR(r.entry_date)}</span>
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className={cn("num shrink-0 font-semibold", r.total_cents < 0 ? "text-destructive" : "text-success")}>{money(r.total_cents / 100)}</span>
              </Link>
            </li>)}</ul>}
        </section>

        <section aria-labelledby="overdue-title" className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 id="overdue-title" className="m-0 text-sm font-semibold">Mensalidades atrasadas</h2>
            <Link href="/mensalidades?atrasados=1" className="text-xs font-semibold text-primary hover:underline">Ver atrasados</Link>
          </div>
          {overdue.length === 0
            ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma mensalidade atrasada em {year}.</p>
            : <ul className="m-0 list-none p-0">{overdue.slice(0, OVERDUE_SHOWN).map(({ associate, overdue: count }) => <li key={associate.id} className="border-t first:border-t-0">
              <Link href={associate.section ? `/mensalidades?${new URLSearchParams({ secao: associate.section })}` : "/mensalidades"} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
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

const TONES = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-[#725d0d]",
  neutral: "text-foreground",
} as const;

function Stat({ label, value, tone, href, icon }: { label: string; value: string; tone: keyof typeof TONES; href?: string; icon?: boolean }) {
  const body = <>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={cn("num flex items-center gap-1.5 text-xl font-bold", TONES[tone])}>{icon && <IconFolderExclamation className="size-5" aria-hidden />}{value}</span>
  </>;
  const className = "grid gap-1 rounded-lg border bg-card px-4 py-3";
  return href
    ? <Link href={href} className={cn(className, "transition-colors hover:border-primary")}>{body}</Link>
    : <div className={className}>{body}</div>;
}
