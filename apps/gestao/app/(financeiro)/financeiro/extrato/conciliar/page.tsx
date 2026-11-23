import { AppHeader } from "@/components/finance/app-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { ReconciliationBoard, type BoardData, type LinkSet } from "@/components/finance/reconciliation/reconciliation-board";
import { ReconciliationFilters } from "@/components/finance/reconciliation/reconciliation-filters";
import { byDateThenAmount, closingCheck, parsePeriod, suggestMatches, type OpenEntry, type OpenLine } from "@/lib/finance/reconciliation";
import { pageSession } from "@/lib/server/session";
import { extratoCrumbs, ExtratoTabs, PAGE_BODY, PageHeader } from "@/components/finance/nav/page-header";
import { cn } from "@geas/ui/lib/utils";
import * as reconciliation from "@/lib/server/finance/reconciliation";
import type { LinkRow } from "@/lib/server/finance/reconciliation";
import { PLACEHOLDER_ACCOUNT_NAME } from "@/lib/finance/accounts";

export const metadata = { title: "Conciliação · GEAS Financeiro" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

type LineRow = reconciliation.LineRow;
type EntryRow = reconciliation.EntryRow;
const { LIMIT } = reconciliation;

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  const { user, member: membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email} />;
  const { db, groupId } = membership;
  const canEdit = membership.finance.canReview;
  const period = parsePeriod(first(params.de), first(params.ate));

  const { accounts, error: accountError } = await reconciliation.accounts(db, groupId);
  const requested = first(params.conta);
  const account = accounts.find((a) => a.id === requested) ?? accounts.find((a) => a.active && a.kind !== "outro") ?? accounts.find((a) => a.active) ?? accounts[0];

  const header = <AppHeader member={membership} current="/financeiro/extrato/conciliar" />;
  if (!account) {
    return <div className="shell">{header}<main className={PAGE_BODY}>
      <PageHeader title="Extrato" crumbs={extratoCrumbs("conciliar")} tabs={<ExtratoTabs current="conciliar" />}
        description={accountError ? `Não foi possível carregar as contas: ${accountError}` : "Cadastre uma conta em Configurações › Contas para começar."} />
    </main></div>;
  }

  // Lançamentos digitados sem conta ("A definir") também são candidatos; ao vincular, vão para esta conta.
  const placeholder = accounts.find((a) => a.name === PLACEHOLDER_ACCOUNT_NAME && a.id !== account.id);
  const entryAccounts = placeholder ? [account.id, placeholder.id] : [account.id];
  const { lines: lineRows, entries: entryRows, links, rejections, imports, methods, error: loadError } =
    await reconciliation.board(db, groupId, account.id, entryAccounts, period);
  const toLine = (l: LineRow): OpenLine => ({ id: l.id, date: l.line_date, amountCents: Number(l.amount_cents), description: l.description, kind: l.kind, counterparty: l.counterparty, externalId: l.external_id, trnType: l.trn_type });
  const toEntry = (e: EntryRow): OpenEntry => ({ id: e.entry_id, date: e.entry_date, totalCents: Number(e.total_cents), name: e.name, paymentMethodName: e.payment_method_name, unassigned: e.account_id !== account.id });
  const openLines = lineRows.filter((l) => l.status === "aberta").map(toLine).sort(byDateThenAmount((l) => l.date, (l) => l.amountCents));
  const openEntries = entryRows.filter((e) => !e.outside_statement).map(toEntry).sort(byDateThenAmount((e) => e.date, (e) => e.totalCents));
  const rejectionPairs = rejections
    .map((r) => ({ lineId: r.statement_line_id, entryId: r.ledger_entry_id }));

  const linkSets = new Map<string, LinkSet>();
  for (const link of links as LinkRow[]) {
    const set = linkSets.get(link.link_set_id) ?? { id: link.link_set_id, lines: [], entries: [] };
    if (!set.lines.some((l) => l.id === link.statement_line_id)) {
      set.lines.push({ id: link.statement_line_id, date: link.line_date, amountCents: Number(link.line_amount_cents), description: link.line_description, kind: link.line_kind, counterparty: link.line_counterparty });
    }
    if (!set.entries.some((e) => e.id === link.ledger_entry_id)) {
      set.entries.push({ id: link.ledger_entry_id, date: link.entry_date, totalCents: Number(link.entry_total_cents), name: link.entry_name });
    }
    linkSets.set(link.link_set_id, set);
  }

  const data: BoardData = {
    accountId: account.id,
    returnQuery: new URLSearchParams({ conta: account.id, de: period.from, ate: period.to }).toString(),
    lines: openLines,
    entries: openEntries,
    suggestions: suggestMatches(openLines, openEntries, rejectionPairs),
    ignored: lineRows.filter((l) => l.status === "ignorada").map((l) => ({ ...toLine(l), reason: l.ignored_reason ?? "" })),
    outside: entryRows.filter((e) => e.outside_statement && e.account_id === account.id).map(toEntry),
    paymentMethods: methods as BoardData["paymentMethods"],
    linked: [...linkSets.values()],
    otherAccounts: accounts.filter((a) => a.active && a.id !== account.id).map((a) => ({ value: a.id, label: a.name })),
    closing: closingCheck(period,
      imports.map((i) => ({ periodFrom: i.period_from, periodTo: i.period_to, openingCents: i.opening_balance_cents === null ? null : Number(i.opening_balance_cents), closingCents: i.closing_balance_cents === null ? null : Number(i.closing_balance_cents) })),
      { openingBalanceCents: Number(account.opening_balance_cents), openingDate: account.opening_date },
      lineRows.map((l) => ({ date: l.line_date, amountCents: Number(l.amount_cents), status: l.status, ignoredReason: l.ignored_reason }))),
    truncated: lineRows.length >= LIMIT || entryRows.length >= LIMIT,
  };

  return <div className="shell">
    {header}
    <main className={cn(PAGE_BODY, "pb-28")}>
      <PageHeader title="Extrato" crumbs={extratoCrumbs("conciliar")} tabs={<ExtratoTabs current="conciliar" accountId={account.id} />}
        description={<>Pendentes: <strong className="num text-foreground">{openLines.length}</strong> {openLines.length === 1 ? "linha do extrato" : "linhas do extrato"} · <strong className="num text-foreground">{openEntries.length}</strong> {openEntries.length === 1 ? "lançamento" : "lançamentos"}</>}>
        <ReconciliationFilters key={`${account.id}|${period.from}|${period.to}`}
          accounts={accounts.map((a) => ({ value: a.id, label: a.active ? a.name : `${a.name} (inativa)` }))}
          accountId={account.id} from={period.from} to={period.to} />
      </PageHeader>
      {loadError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">Não foi possível carregar a conciliação: {loadError}</p>}
      <ReconciliationBoard data={data} canEdit={canEdit} />
    </main>
  </div>;
}
