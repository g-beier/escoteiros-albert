"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { IconArrowBackUp, IconCheck, IconChevronRight, IconLink, IconPlus, IconSparkles, IconX } from "@tabler/icons-react";
import {
  acceptSuggestions, createEntriesFromLines, ignoreStatementLines, linkReconciliation, rejectSuggestion, reopenStatementLine, setEntryAccount,
  setOutsideStatement, unlinkReconciliation, type ReconciliationResult,
} from "@/app/extrato/conciliar/actions";
import { OptionSelect, type Option } from "@/components/option-controls";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateBR, shortOfxId, money } from "@/lib/format";
import {
  IGNORE_REASONS, OTHER_REASON, guessPaymentMethod, ignoreReasonText, lineText, selectionSummary, suggestedEntryName,
  type Closing, type OpenEntry, type OpenLine, type Suggestions,
} from "@/lib/reconciliation";
import { cn } from "@/lib/utils";

export type LinkSet = { id: string; lines: OpenLine[]; entries: OpenEntry[] };

export type BoardData = {
  accountId: string;
  /** conta, de, ate: para voltar à mesma tela depois de criar um lançamento. */
  returnQuery: string;
  lines: OpenLine[];
  entries: OpenEntry[];
  suggestions: Suggestions;
  ignored: (OpenLine & { reason: string })[];
  outside: OpenEntry[];
  linked: LinkSet[];
  otherAccounts: Option[];
  /** Formas de pagamento, para a criação em massa. */
  paymentMethods: { id: string; name: string; active: boolean }[];
  closing: Closing;
  truncated: boolean;
};

const brl = (cents: number) => money(cents / 100);

function Amount({ cents, className }: { cents: number; className?: string }) {
  return <span className={cn("num shrink-0 text-right font-semibold whitespace-nowrap", cents < 0 ? "text-destructive" : "text-success", className)}>{brl(cents)}</span>;
}

function LineCell({ line }: { line: OpenLine }) {
  const who = line.counterparty || line.description;
  return <div className="flex min-w-0 flex-1 items-baseline gap-2">
    <span className="num shrink-0 text-xs text-muted-foreground">{dateBR(line.date)}</span>
    <span className="min-w-0 flex-1">
      {line.kind && <span className="mr-1.5 text-xs text-muted-foreground">{line.kind}</span>}
      <span className="font-medium break-words" title={line.description}>{who}</span>
      {line.externalId && <span className="ml-1.5 num text-[11px] text-muted-foreground" title={`ID OFX ${line.externalId}`}>#{shortOfxId(line.externalId)}</span>}
    </span>
    <Amount cents={line.amountCents} />
  </div>;
}

function EntryCell({ entry }: { entry: OpenEntry }) {
  return <div className="flex min-w-0 flex-1 items-baseline gap-2">
    <span className="num shrink-0 text-xs text-muted-foreground">{dateBR(entry.date)}</span>
    <span className="min-w-0 flex-1">
      <Link href={`/lancamentos/${entry.id}`} className="font-medium break-words hover:underline">{entry.name}</Link>
      {entry.paymentMethodName && <span className="ml-1.5 text-xs text-muted-foreground">{entry.paymentMethodName}</span>}
      {entry.unassigned && <Badge variant="outline" className="ml-1.5" title="Digitado sem conta; ao vincular, passa para esta conta">A definir</Badge>}
    </span>
    <Amount cents={entry.totalCents} />
  </div>;
}

function Row({ checked, onToggle, label, children, actions, hint }: {
  checked?: boolean; onToggle?: () => void; label: string; children: React.ReactNode; actions?: React.ReactNode; hint?: React.ReactNode;
}) {
  return <li className={cn("grid gap-1 border-b px-3 py-2 last:border-b-0", checked && "bg-primary/5")}>
    <div className="flex items-center gap-2.5">
      {onToggle && <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={label} />}
      {children}
    </div>
    {(actions || hint) && <div className={cn("flex flex-wrap items-center gap-1", onToggle && "pl-6.5")}>
      {hint && <span className="mr-auto text-xs text-muted-foreground">{hint}</span>}
      {actions && <div className="ml-auto flex flex-wrap gap-1">{actions}</div>}
    </div>}
  </li>;
}

function Column({ title, count, empty, action, children }: { title: string; count: number; empty: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section aria-label={title} className="min-w-0 overflow-hidden rounded-lg border bg-card">
    <h2 className="m-0 flex items-center gap-2 border-b bg-muted/60 px-3 py-2 text-sm font-semibold">{title} <span className="num text-xs font-medium text-muted-foreground">{count}</span>{action && <span className="ml-auto">{action}</span>}</h2>
    {count ? <ul className="m-0 list-none p-0">{children}</ul> : <p className="m-0 px-3 py-4 text-muted-foreground">{empty}</p>}
  </section>;
}

function Collapsible({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return <details className="group rounded-lg border bg-card">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
      <IconChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden /> {title} <span className="num text-xs font-medium text-muted-foreground">({count})</span>
    </summary>
    <ul className="m-0 list-none border-t p-0">{children}</ul>
  </details>;
}

const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
};

export function ReconciliationBoard({ data, canEdit }: { data: BoardData; canEdit: boolean }) {
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [ignoring, setIgnoring] = useState<OpenLine[] | null>(null);
  const [creating, setCreating] = useState<OpenLine[] | null>(null);
  const [moving, setMoving] = useState<OpenEntry | null>(null);
  const [pending, startTransition] = useTransition();

  const lineById = useMemo(() => new Map(data.lines.map((l) => [l.id, l])), [data.lines]);
  const entryById = useMemo(() => new Map(data.entries.map((e) => [e.id, e])), [data.entries]);
  const { exact, ambiguous, near } = data.suggestions;
  // itens de sugestões e grupos ambíguos aparecem só na área de sugestões
  const suggested = useMemo(() => new Set([
    ...exact.flatMap((s) => [s.lineId, s.entryId]), ...near.flatMap((s) => [s.lineId, s.entryId]), ...ambiguous.flatMap((g) => [...g.lineIds, ...g.entryIds]),
  ]), [exact, near, ambiguous]);
  const columnLines = data.lines.filter((l) => !suggested.has(l.id));
  const columnEntries = data.entries.filter((e) => !suggested.has(e.id));

  // seleção só com itens ainda abertos (a lista muda depois de cada ação)
  const chosenLines = [...selectedLines].map((id) => lineById.get(id)).filter((l): l is OpenLine => Boolean(l));
  const chosenEntries = [...selectedEntries].map((id) => entryById.get(id)).filter((e): e is OpenEntry => Boolean(e));
  const summary = selectionSummary(chosenLines.map((l) => l.amountCents), chosenEntries.map((e) => e.totalCents));
  const hasSelection = chosenLines.length + chosenEntries.length > 0;
  const clearSelection = () => { setSelectedLines(new Set()); setSelectedEntries(new Set()); };

  function run(action: () => Promise<ReconciliationResult>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.error) { toast.error(result.error); return; }
      if (result.success) toast.success(result.success);
      after?.();
    });
  }

  const lineToggle = (id: string) => canEdit ? () => setSelectedLines((s) => toggle(s, id)) : undefined;
  const entryToggle = (id: string) => canEdit ? () => setSelectedEntries((s) => toggle(s, id)) : undefined;

  const lineActions = (line: OpenLine) => canEdit && <>
    <Link href={`/lancamentos/novo?linha=${line.id}&voltar=${encodeURIComponent(data.returnQuery)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}><IconPlus /> Criar lançamento</Link>
    <Button variant="ghost" size="sm" onClick={() => setIgnoring([line])} disabled={pending}>Ignorar</Button>
  </>;
  const entryActions = (entry: OpenEntry) => canEdit && <>
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setOutsideStatement(entry.id, true))}>Fora do extrato</Button>
    <Button variant="ghost" size="sm" disabled={pending || !data.otherAccounts.length} onClick={() => setMoving(entry)}>Trocar conta</Button>
  </>;

  const suggestionCount = exact.length + near.length + ambiguous.length;
  const allColumnLinesSelected = columnLines.length > 0 && columnLines.every((l) => selectedLines.has(l.id));

  return <div className="grid gap-4">
    {data.truncated && <p className="m-0 rounded-lg bg-secondary px-3 py-2 text-xs">Período com muitas linhas: só as primeiras 5.000 de cada lado foram carregadas. Reduza o período.</p>}

    {suggestionCount > 0 && <section aria-label="Sugestões" className="overflow-hidden rounded-lg border border-primary/30 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2">
        <h2 className="m-0 flex items-center gap-1.5 text-sm font-semibold"><IconSparkles className="size-4 text-primary" aria-hidden /> Sugestões <span className="num text-xs font-medium text-muted-foreground">({suggestionCount})</span></h2>
        <span className="text-xs text-muted-foreground">mesmo valor, no mesmo dia ou até 3 dias de diferença</span>
        {canEdit && exact.length > 0 && <Button size="sm" className="ml-auto" disabled={pending}
          onClick={() => run(() => acceptSuggestions(exact))}><IconCheck /> Aceitar todas ({exact.length})</Button>}
      </div>
      <ul className="m-0 list-none p-0">
        {exact.map((s) => {
          const line = lineById.get(s.lineId)!;
          const entry = entryById.get(s.entryId)!;
          return <li key={`${s.lineId}:${s.entryId}`} className="grid gap-2 border-b px-3 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
            <div className="flex items-center gap-2"><Badge variant="secondary" className="shrink-0">Sugestão</Badge><LineCell line={line} /></div>
            <EntryCell entry={entry} />
            {canEdit && <div className="flex gap-1 justify-self-end">
              <Button size="sm" disabled={pending} onClick={() => run(() => linkReconciliation([line.id], [entry.id]))}><IconCheck /> Aceitar</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectSuggestion(line.id, entry.id))}><IconX /> Recusar</Button>
            </div>}
          </li>;
        })}
        {near.map((s) => {
          const line = lineById.get(s.lineId)!;
          const entry = entryById.get(s.entryId)!;
          const days = Math.abs(s.days);
          return <li key={`near:${s.lineId}:${s.entryId}`} className="grid gap-2 border-b px-3 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
            <div className="flex items-center gap-2"><Badge variant="outline" className="shrink-0" title="Mesmo valor, data diferente">{days} {days === 1 ? "dia" : "dias"} {s.days < 0 ? "antes" : "depois"}</Badge><LineCell line={line} /></div>
            <EntryCell entry={entry} />
            {canEdit && <div className="flex gap-1 justify-self-end">
              <Button size="sm" disabled={pending} onClick={() => run(() => linkReconciliation([line.id], [entry.id]))}><IconCheck /> Aceitar</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectSuggestion(line.id, entry.id))}><IconX /> Recusar</Button>
            </div>}
          </li>;
        })}
        {ambiguous.map((group) => <li key={`${group.date}|${group.amountCents}`} className="grid gap-2 border-b px-3 py-2 last:border-b-0">
          <p className="m-0 text-xs text-muted-foreground">
            <strong className="text-foreground">Vários candidatos</strong> em <span className="num">{dateBR(group.date)}</span> com <Amount cents={group.amountCents} />: {canEdit ? "marque cada par (os mais parecidos estão lado a lado) e use Vincular." : "a escolha fica com a tesouraria."}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <ul className="m-0 list-none rounded-md border p-0">
              {group.lineIds.map((id) => {
                const line = lineById.get(id)!;
                const best = entryById.get(group.candidates[id]?.[0] ?? "");
                return <Row key={id} label={`Selecionar linha do extrato ${lineText(line)}`} checked={selectedLines.has(id)} onToggle={lineToggle(id)}
                  hint={best && `Mais parecido: ${best.name}`} actions={lineActions(line)}><LineCell line={line} /></Row>;
              })}
            </ul>
            <ul className="m-0 list-none rounded-md border p-0">
              {group.entryIds.map((id) => {
                const entry = entryById.get(id)!;
                return <Row key={id} label={`Selecionar lançamento ${entry.name}`} checked={selectedEntries.has(id)} onToggle={entryToggle(id)} actions={entryActions(entry)}><EntryCell entry={entry} /></Row>;
              })}
            </ul>
          </div>
        </li>)}
      </ul>
    </section>}

    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Column title="Extrato" count={columnLines.length} empty={data.lines.length ? "As linhas abertas restantes estão nas sugestões." : "Nenhuma linha aberta neste período."}
        action={canEdit && columnLines.length > 1 && <Button variant="ghost" size="sm" onClick={() => setSelectedLines((set) => {
          const next = new Set(set);
          for (const line of columnLines) { if (allColumnLinesSelected) next.delete(line.id); else next.add(line.id); }
          return next;
        })}>{allColumnLinesSelected ? "Desmarcar todas" : "Marcar todas"}</Button>}>
        {columnLines.map((line) => <Row key={line.id} label={`Selecionar linha do extrato ${lineText(line)}`} checked={selectedLines.has(line.id)} onToggle={lineToggle(line.id)} actions={lineActions(line)}>
          <LineCell line={line} />
        </Row>)}
      </Column>
      <Column title="Lançamentos" count={columnEntries.length} empty={data.entries.length ? "Os lançamentos restantes estão nas sugestões." : "Nenhum lançamento sem vínculo nesta conta e período."}>
        {columnEntries.map((entry) => <Row key={entry.id} label={`Selecionar lançamento ${entry.name}`} checked={selectedEntries.has(entry.id)} onToggle={entryToggle(entry.id)} actions={entryActions(entry)}>
          <EntryCell entry={entry} />
        </Row>)}
      </Column>
    </div>

    <div className="grid gap-2">
      <Collapsible title="Vinculados" count={data.linked.length}>
        {data.linked.map((set) => <li key={set.id} className="grid gap-2 border-b px-3 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
          <div className="grid gap-1">{set.lines.map((line) => <LineCell key={line.id} line={line} />)}</div>
          <div className="grid gap-1">{set.entries.map((entry) => <EntryCell key={entry.id} entry={entry} />)}</div>
          {canEdit && <Button size="sm" variant="ghost" className="justify-self-end" disabled={pending} onClick={() => run(() => unlinkReconciliation(set.lines[0].id))}><IconArrowBackUp /> Desfazer</Button>}
        </li>)}
      </Collapsible>
      <Collapsible title="Ignoradas" count={data.ignored.length}>
        {data.ignored.map((line) => <Row key={line.id} label={lineText(line)} hint={`Motivo: ${line.reason}`}
          actions={canEdit && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reopenStatementLine(line.id))}><IconArrowBackUp /> Reabrir</Button>}>
          <LineCell line={line} />
        </Row>)}
      </Collapsible>
      <Collapsible title="Fora do extrato" count={data.outside.length}>
        {data.outside.map((entry) => <Row key={entry.id} label={entry.name}
          actions={canEdit && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setOutsideStatement(entry.id, false))}><IconArrowBackUp /> Desfazer</Button>}>
          <EntryCell entry={entry} />
        </Row>)}
      </Collapsible>
    </div>

    <ClosingCard closing={data.closing} />

    {canEdit && hasSelection && <div role="region" aria-label="Seleção" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span>Extrato ({chosenLines.length}): <strong className="num">{brl(summary.lines)}</strong></span>
        <span>Lançamentos ({chosenEntries.length}): <strong className="num">{brl(summary.entries)}</strong></span>
        <span role="status" aria-live="polite" className={cn("font-semibold", summary.difference === 0 && !summary.manyToMany ? "text-success" : "text-destructive")}>
          {summary.manyToMany ? "Escolha uma linha para vários lançamentos ou um lançamento para várias linhas" : summary.difference === 0 ? "✓ Somas conferem" : `Diferença: ${brl(summary.difference)}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={clearSelection} disabled={pending}>Limpar</Button>
          {chosenLines.length > 0 && chosenEntries.length === 0 && <>
            <Button variant="outline" disabled={pending} onClick={() => setIgnoring(chosenLines)}>Ignorar ({chosenLines.length})</Button>
            <Button variant="outline" disabled={pending} onClick={() => setCreating(chosenLines)}><IconPlus /> Criar lançamentos ({chosenLines.length})</Button>
          </>}
          <Button disabled={!summary.canLink || pending} onClick={() => run(() => linkReconciliation(chosenLines.map((l) => l.id), chosenEntries.map((e) => e.id)), clearSelection)}><IconLink /> Vincular</Button>
        </div>
      </div>
    </div>}

    <IgnoreDialog lines={ignoring} pending={pending} onClose={() => setIgnoring(null)}
      onConfirm={(lines, reason) => run(() => ignoreStatementLines(lines.map((l) => l.id), reason), () => {
        setIgnoring(null);
        setSelectedLines((s) => { const next = new Set(s); for (const l of lines) next.delete(l.id); return next; });
      })} />
    <BulkCreateDialog lines={creating} paymentMethods={data.paymentMethods} pending={pending} onClose={() => setCreating(null)}
      onConfirm={(items) => startTransition(async () => {
        // em lotes de BULK_BATCH: cada lote é tudo-ou-nada; as linhas sem forma continuam selecionadas
        let created = 0;
        for (let start = 0; start < items.length; start += BULK_BATCH) {
          const result = await createEntriesFromLines(items.slice(start, start + BULK_BATCH));
          if (result.error) {
            toast.error(created ? `${created} criados; o lote seguinte falhou: ${result.error}` : result.error, { duration: 15_000 });
            break;
          }
          created += Math.min(BULK_BATCH, items.length - start);
        }
        const done = new Set(items.slice(0, created).map((item) => item.lineId));
        if (created) toast.success(`${created} ${created === 1 ? "lançamento criado e conciliado" : "lançamentos criados e conciliados"}. Recategorize em Lançamentos › Detalhamento.`);
        setCreating(null);
        setSelectedLines((set) => new Set([...set].filter((id) => !done.has(id))));
      })} />
    <MoveDialog entry={moving} accounts={data.otherAccounts} pending={pending} onClose={() => setMoving(null)}
      onConfirm={(entry, accountId) => run(() => setEntryAccount(entry.id, accountId), () => setMoving(null))} />
  </div>;
}

function ClosingCard({ closing }: { closing: Closing }) {
  return <section aria-label="Fechamento do período" className="rounded-lg border bg-card px-3 py-2.5">
    <h2 className="m-0 mb-1.5 text-sm font-semibold">Fechamento</h2>
    {!closing.ok ? <p className="m-0 text-muted-foreground">Não dá para conferir o saldo. {closing.reason}</p> : <>
      <dl className="m-0 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_auto] sm:justify-start">
        <dt className="text-muted-foreground">Saldo inicial em <span className="num">{dateBR(closing.openingDate)}</span></dt><dd className="m-0 num sm:text-right">{brl(closing.openingCents)}</dd>
        <dt className="text-muted-foreground">+ Movimentos conciliados ou ignorados</dt><dd className="m-0 num sm:text-right">{brl(closing.movementsCents)}</dd>
        <dt className="text-muted-foreground">= Saldo calculado</dt><dd className="m-0 num font-semibold sm:text-right">{brl(closing.openingCents + closing.movementsCents)}</dd>
        <dt className="text-muted-foreground">Saldo do extrato em <span className="num">{dateBR(closing.closingDate)}</span></dt><dd className="m-0 num font-semibold sm:text-right">{brl(closing.closingCents)}</dd>
      </dl>
      <p className={cn("m-0 mt-1.5 font-semibold", closing.differenceCents === 0 ? "text-success" : "text-destructive")}>
        {closing.differenceCents === 0 ? "✓ O período fecha com o extrato." : <>Diferença: <span className="num">{brl(closing.differenceCents)}</span>
          {closing.pendingCents !== 0 && <span className="font-normal text-muted-foreground"> (linhas ainda abertas somam <span className="num">{brl(closing.pendingCents)}</span>)</span>}</>}
      </p>
    </>}
  </section>;
}

function IgnoreDialog({ lines, pending, onClose, onConfirm }: { lines: OpenLine[] | null; pending: boolean; onClose: () => void; onConfirm: (lines: OpenLine[], reason: string) => void }) {
  const line = lines?.length === 1 ? lines[0] : null;
  const [choice, setChoice] = useState<string>(IGNORE_REASONS[0]);
  const [detail, setDetail] = useState("");
  const reason = ignoreReasonText(choice, detail);
  const options = [...IGNORE_REASONS, OTHER_REASON].map((value) => ({ value, label: value }));
  return <Dialog open={lines !== null} onOpenChange={(open) => { if (!open) { onClose(); setDetail(""); } }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{line ? "Ignorar linha do extrato?" : `Ignorar ${lines?.length ?? 0} linhas do extrato?`}</DialogTitle>
        <DialogDescription>{line
          ? <>“{lineText(line)}” de <span className="num">{dateBR(line.date)}</span>, <span className="num">{brl(line.amountCents)}</span>, sai das pendências. Dá para reabrir depois em Ignoradas.</>
          : lines && <>As linhas selecionadas (<span className="num">{brl(lines.reduce((sum, l) => sum + l.amountCents, 0))}</span> no total) saem das pendências com o mesmo motivo. Dá para reabrir depois em Ignoradas.</>}</DialogDescription>
      </DialogHeader>
      <form id="ignore-form" className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (lines?.length && reason) onConfirm(lines, reason); }}>
        <div className="grid gap-1.5"><Label htmlFor="ignore-reason">Motivo</Label><OptionSelect id="ignore-reason" value={choice} onValueChange={(value) => value && setChoice(value)} options={options} /></div>
        <div className="grid gap-1.5"><Label htmlFor="ignore-detail">{choice === OTHER_REASON ? "Explique" : "Observação (opcional)"}</Label>
          <Input id="ignore-detail" maxLength={150} value={detail} onChange={(e) => setDetail(e.target.value)} required={choice === OTHER_REASON} /></div>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="ignore-form" disabled={pending || !reason}>{pending ? "Salvando…" : "Ignorar"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function MoveDialog({ entry, accounts, pending, onClose, onConfirm }: { entry: OpenEntry | null; accounts: Option[]; pending: boolean; onClose: () => void; onConfirm: (entry: OpenEntry, accountId: string) => void }) {
  const [accountId, setAccountId] = useState("");
  return <Dialog open={entry !== null} onOpenChange={(open) => { if (!open) { onClose(); setAccountId(""); } }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Trocar a conta do lançamento</DialogTitle>
        <DialogDescription>{entry && <>“{entry.name}” (<span className="num">{brl(entry.totalCents)}</span>) sai desta conciliação e passa para a conta escolhida.</>}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5"><Label htmlFor="move-account">Nova conta</Label><OptionSelect id="move-account" value={accountId} onValueChange={setAccountId} options={accounts} placeholder="Escolha a conta…" /></div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={pending || !accountId} onClick={() => entry && onConfirm(entry, accountId)}>{pending ? "Salvando…" : "Trocar conta"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

type BulkItem = { lineId: string; name: string; paymentMethodId: string };

/**
 * Cria um lançamento por linha selecionada, já conciliado. Rubrica automática pelo sinal
 * (entrada → 1 Receitas, saída → 2 Despesas); histórico e forma editáveis por linha.
 */
function BulkCreateDialog({ lines, paymentMethods, pending, onClose, onConfirm }: {
  lines: OpenLine[] | null; paymentMethods: BoardData["paymentMethods"]; pending: boolean; onClose: () => void; onConfirm: (items: BulkItem[]) => void;
}) {
  return <Dialog open={lines !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="w-[min(56rem,calc(100%-2rem))] lg:max-w-[80vw]">
      {lines && <BulkCreateForm key={lines.map((l) => l.id).join()} lines={lines} paymentMethods={paymentMethods} pending={pending} onClose={onClose} onConfirm={onConfirm} />}
    </DialogContent>
  </Dialog>;
}

const BULK_BATCH = 500;
const BULK_VISIBLE = 300;

function BulkCreateForm({ lines, paymentMethods, pending, onClose, onConfirm }: {
  lines: OpenLine[]; paymentMethods: BoardData["paymentMethods"]; pending: boolean; onClose: () => void; onConfirm: (items: BulkItem[]) => void;
}) {
  const [items, setItems] = useState<BulkItem[]>(() => lines.map((line) => ({
    lineId: line.id, name: suggestedEntryName(line), paymentMethodId: guessPaymentMethod(line, paymentMethods) ?? "",
  })));
  const [allMethod, setAllMethod] = useState("");
  const [showAll, setShowAll] = useState(false);
  const options = paymentMethods.filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }));
  const update = (index: number, patch: Partial<BulkItem>) => setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const isReady = (item: BulkItem) => !!item.paymentMethodId && item.name.trim().length >= 2;
  const ready = items.filter(isReady);
  const missing = items.length - ready.length;
  const income = lines.filter((l) => l.amountCents > 0).length;
  // por padrão, só as que faltam completar; as prontas ficam a um clique
  const rows = lines.map((line, index) => ({ line, index })).filter(({ index }) => showAll || !isReady(items[index]));
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (ready.length) onConfirm(ready); }}>
    <DialogHeader>
      <DialogTitle>Criar lançamentos a partir de {lines.length.toLocaleString("pt-BR")} {lines.length === 1 ? "linha" : "linhas"} do extrato</DialogTitle>
      <DialogDescription>
        Cada linha vira um lançamento com uma rubrica, já conciliado. A rubrica é automática:
        {income > 0 && <> {income} {income === 1 ? "entrada vai" : "entradas vão"} para <strong>1 Receitas</strong></>}
        {income > 0 && income < lines.length && " e"}
        {income < lines.length && <> {lines.length - income} {lines.length - income === 1 ? "saída vai" : "saídas vão"} para <strong>2 Despesas</strong></>}.
        Depois, recategorize em Lançamentos › Detalhamento (filtrando pelas rubricas raiz).
      </DialogDescription>
    </DialogHeader>
    <p className="m-0 text-xs">
      <strong className="num text-success">{ready.length.toLocaleString("pt-BR")}</strong> {ready.length === 1 ? "pronta" : "prontas"} (forma de pagamento sugerida)
      {missing > 0 && <> · <strong className="num text-destructive">{missing.toLocaleString("pt-BR")}</strong> sem forma de pagamento: completam aqui ou ficam selecionadas para depois</>}
    </p>
    <div className="grid gap-1.5">
      <Label htmlFor="bulk-method">Forma de pagamento</Label>
      <div className="flex flex-wrap items-center gap-2">
      <OptionSelect id="bulk-method" className="w-56" value={allMethod} onValueChange={setAllMethod} options={options} placeholder="Escolha…" />
      <Button type="button" variant="outline" disabled={!allMethod || !missing} onClick={() => setItems((current) => current.map((item) => item.paymentMethodId ? item : { ...item, paymentMethodId: allMethod }))}>Aplicar às que faltam</Button>
      <Button type="button" variant="ghost" disabled={!allMethod} onClick={() => setItems((current) => current.map((item) => ({ ...item, paymentMethodId: allMethod })))}>Aplicar a todas</Button>
      <Label className="ml-auto h-7 items-center font-normal"><Checkbox checked={showAll} onCheckedChange={(value) => setShowAll(value === true)} /> Mostrar também as prontas</Label>
      </div>
    </div>
    {rows.length > 0 ? <div className="max-h-[50vh] overflow-y-auto rounded-md border">
      <table className="w-full min-w-0 text-xs">
        <thead className="sticky top-0 z-10 bg-muted text-left"><tr>
          <th className="px-2 py-1.5 font-semibold">Data</th><th className="px-2 py-1.5 font-semibold">Histórico</th>
          <th className="px-2 py-1.5 font-semibold">Forma</th><th className="px-2 py-1.5 text-right font-semibold">Valor</th>
        </tr></thead>
        <tbody>{rows.slice(0, BULK_VISIBLE).map(({ line, index }) => <tr key={line.id} className="border-t">
          <td className="px-2 py-1 num whitespace-nowrap">{dateBR(line.date)}</td>
          <td className="px-2 py-1"><Input aria-label={`Histórico da linha de ${dateBR(line.date)}`} value={items[index].name} maxLength={200} title={line.description}
            onChange={(event) => update(index, { name: event.target.value })} aria-invalid={items[index].name.trim().length < 2 || undefined} /></td>
          <td className="px-2 py-1"><OptionSelect aria-label={`Forma de pagamento da linha de ${dateBR(line.date)}`} className="w-40" value={items[index].paymentMethodId}
            onValueChange={(value) => update(index, { paymentMethodId: value })} options={options} invalid={!items[index].paymentMethodId} /></td>
          <td className="px-2 py-1 text-right"><Amount cents={line.amountCents} /></td>
        </tr>)}</tbody>
      </table>
      {rows.length > BULK_VISIBLE && <p className="m-0 border-t px-2 py-1.5 text-xs text-muted-foreground">Mostrando {BULK_VISIBLE} de {rows.length.toLocaleString("pt-BR")}. Use “Aplicar às que faltam” para o restante.</p>}
    </div> : <p className="m-0 rounded-md border px-3 py-4 text-xs text-muted-foreground">Todas as linhas têm forma de pagamento sugerida. Marque “Mostrar também as prontas” para revisar.</p>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
      <Button type="submit" disabled={pending || !ready.length}>{pending ? "Criando…"
        : missing ? `Criar ${ready.length.toLocaleString("pt-BR")} prontas (${missing.toLocaleString("pt-BR")} ficam para depois)`
        : `Criar ${ready.length.toLocaleString("pt-BR")} ${ready.length === 1 ? "lançamento" : "lançamentos"}`}</Button>
    </DialogFooter>
  </form>;
}
