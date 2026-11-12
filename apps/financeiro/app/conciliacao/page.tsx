import { AppHeader } from "@/components/app-header";
import { SetupNeeded } from "@/components/setup-needed";
import { ReconciliationBoard, type BoardData, type LinkSet } from "@/components/reconciliation/reconciliation-board";
import { ReconciliationFilters } from "@/components/reconciliation/reconciliation-filters";
import { byDateThenAmount, closingCheck, parsePeriod, suggestMatches, type OpenEntry, type OpenLine } from "@/lib/reconciliation";
import { pageSession } from "@/lib/session";
import { PLACEHOLDER_ACCOUNT_NAME } from "@/lib/accounts";

export const metadata = { title: "Conciliação · GEAS Financeiro" };

type RawParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

type AccountRow = { id: string; name: string; active: boolean; kind: string; opening_balance_cents: number; opening_date: string | null };
type LineRow = { id: string; line_date: string; description: string; kind: string | null; counterparty: string | null; amount_cents: number; status: "aberta" | "conciliada" | "ignorada"; ignored_reason: string | null; external_id: string | null; trn_type: string | null };
type EntryRow = { entry_id: string; entry_date: string; name: string; payment_method_name: string; total_cents: number; reconciled: boolean; outside_statement: boolean; account_id: string };
type LinkRow = { link_set_id: string; statement_line_id: string; line_date: string; line_description: string; line_kind: string | null; line_counterparty: string | null; line_amount_cents: number; ledger_entry_id: string; entry_date: string; entry_name: string; entry_total_cents: number; created_at: string };
type ImportRow = { period_from: string; period_to: string; opening_balance_cents: number | null; closing_balance_cents: number | null };

const LIMIT = 2000;

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  const { supabase, user, member: membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const groupId = membership.groupId;
  const canEdit = membership.canEdit;
  const period = parsePeriod(first(params.de), first(params.ate));

  const { data: accountData, error: accountError } = await supabase.from("accounts")
    .select("id, name, active, kind, opening_balance_cents, opening_date").eq("group_id", groupId).order("name");
  const accounts = (accountData ?? []) as AccountRow[];
  const requested = first(params.conta);
  const account = accounts.find((a) => a.id === requested) ?? accounts.find((a) => a.active && a.kind !== "outro") ?? accounts.find((a) => a.active) ?? accounts[0];

  const header = <AppHeader role={membership.role} email={user.email ?? ""} current="/conciliacao" wide />;
  if (!account) {
    return <div className="shell">{header}<main className="mx-auto grid max-w-7xl gap-4 px-4 py-6">
      <h1 className="m-0 text-xl font-bold tracking-tight">Conciliação</h1>
      <p className="text-muted-foreground">{accountError ? `Não foi possível carregar as contas: ${accountError.message}` : "Cadastre uma conta em Cadastros para começar."}</p>
    </main></div>;
  }

  // Lançamentos digitados sem conta ("A definir") também são candidatos; ao vincular, vão para esta conta.
  const placeholder = accounts.find((a) => a.name === PLACEHOLDER_ACCOUNT_NAME && a.id !== account.id);
  const entryAccounts = placeholder ? [account.id, placeholder.id] : [account.id];
  const [lines, entries, links, rejections, imports, methods] = await Promise.all([
    supabase.from("statement_lines").select("id, line_date, description, kind, counterparty, amount_cents, status, ignored_reason, external_id, trn_type")
      .eq("account_id", account.id).gte("line_date", period.from).lte("line_date", period.to)
      .order("line_date").order("amount_cents").limit(LIMIT),
    supabase.from("ledger_entry_rows").select("entry_id, entry_date, name, payment_method_name, total_cents, reconciled, outside_statement, account_id")
      .eq("group_id", groupId).in("account_id", entryAccounts).eq("reconciled", false).gte("entry_date", period.from).lte("entry_date", period.to)
      .order("entry_date").order("total_cents").limit(LIMIT),
    supabase.from("reconciliation_link_rows").select("link_set_id, statement_line_id, line_date, line_description, line_kind, line_counterparty, line_amount_cents, ledger_entry_id, entry_date, entry_name, entry_total_cents, created_at")
      .eq("account_id", account.id).gte("line_date", period.from).lte("line_date", period.to)
      .order("line_date").limit(LIMIT),
    supabase.from("reconciliation_rejections").select("statement_line_id, ledger_entry_id, statement_lines!inner(account_id)")
      .eq("statement_lines.account_id", account.id).limit(LIMIT * 5),
    supabase.from("statement_imports").select("period_from, period_to, opening_balance_cents, closing_balance_cents")
      .eq("account_id", account.id).lte("period_from", period.to).gte("period_to", period.from),
    supabase.from("payment_methods").select("id, name, active").eq("group_id", groupId).order("name"),
  ]);
  const loadError = [lines, entries, links, rejections, imports].map((r) => r.error?.message).find(Boolean);

  const lineRows = (lines.data ?? []) as LineRow[];
  const entryRows = (entries.data ?? []) as EntryRow[];
  const toLine = (l: LineRow): OpenLine => ({ id: l.id, date: l.line_date, amountCents: Number(l.amount_cents), description: l.description, kind: l.kind, counterparty: l.counterparty, externalId: l.external_id, trnType: l.trn_type });
  const toEntry = (e: EntryRow): OpenEntry => ({ id: e.entry_id, date: e.entry_date, totalCents: Number(e.total_cents), name: e.name, paymentMethodName: e.payment_method_name, unassigned: e.account_id !== account.id });
  const openLines = lineRows.filter((l) => l.status === "aberta").map(toLine).sort(byDateThenAmount((l) => l.date, (l) => l.amountCents));
  const openEntries = entryRows.filter((e) => !e.outside_statement).map(toEntry).sort(byDateThenAmount((e) => e.date, (e) => e.totalCents));
  const rejectionPairs = ((rejections.data ?? []) as { statement_line_id: string; ledger_entry_id: string }[])
    .map((r) => ({ lineId: r.statement_line_id, entryId: r.ledger_entry_id }));

  const linkSets = new Map<string, LinkSet>();
  for (const link of (links.data ?? []) as LinkRow[]) {
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
    paymentMethods: (methods.data ?? []) as BoardData["paymentMethods"],
    linked: [...linkSets.values()],
    otherAccounts: accounts.filter((a) => a.active && a.id !== account.id).map((a) => ({ value: a.id, label: a.name })),
    closing: closingCheck(period,
      ((imports.data ?? []) as ImportRow[]).map((i) => ({ periodFrom: i.period_from, periodTo: i.period_to, openingCents: i.opening_balance_cents === null ? null : Number(i.opening_balance_cents), closingCents: i.closing_balance_cents === null ? null : Number(i.closing_balance_cents) })),
      { openingBalanceCents: Number(account.opening_balance_cents), openingDate: account.opening_date },
      lineRows.map((l) => ({ date: l.line_date, amountCents: Number(l.amount_cents), status: l.status, ignoredReason: l.ignored_reason }))),
    truncated: lineRows.length >= LIMIT || entryRows.length >= LIMIT,
  };

  return <div className="shell">
    {header}
    <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 pb-28">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="grid gap-0.5">
          <h1 className="m-0 text-xl leading-tight font-bold tracking-tight">Conciliação</h1>
          <p className="m-0 text-xs text-muted-foreground">
            Pendentes: <strong className="num text-foreground">{openLines.length}</strong> {openLines.length === 1 ? "linha do extrato" : "linhas do extrato"} · <strong className="num text-foreground">{openEntries.length}</strong> {openEntries.length === 1 ? "lançamento" : "lançamentos"}
          </p>
        </div>
        <ReconciliationFilters key={`${account.id}|${period.from}|${period.to}`}
          accounts={accounts.map((a) => ({ value: a.id, label: a.active ? a.name : `${a.name} (inativa)` }))}
          accountId={account.id} from={period.from} to={period.to} />
      </div>
      {loadError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">Não foi possível carregar a conciliação: {loadError}</p>}
      <ReconciliationBoard data={data} canEdit={canEdit} />
    </main>
  </div>;
}
