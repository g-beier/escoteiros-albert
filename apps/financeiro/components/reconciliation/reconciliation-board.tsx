"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { IconArrowBackUp, IconCheck, IconChevronRight, IconLink, IconPlus, IconSparkles, IconX } from "@tabler/icons-react";
import {
  acceptSuggestions, ignoreStatementLine, linkReconciliation, rejectSuggestion, reopenStatementLine, setEntryAccount,
  setOutsideStatement, unlinkReconciliation, type ReconciliationResult,
} from "@/app/conciliacao/actions";
import { OptionSelect, type Option } from "@/components/option-controls";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateBR, money } from "@/lib/format";
import {
  IGNORE_REASONS, OTHER_REASON, ignoreReasonText, lineText, selectionSummary,
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

function Column({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return <section aria-label={title} className="min-w-0 overflow-hidden rounded-lg border bg-card">
    <h2 className="m-0 flex items-center justify-between border-b bg-muted/60 px-3 py-2 text-sm font-semibold">{title} <span className="num text-xs font-medium text-muted-foreground">{count}</span></h2>
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
  const [ignoring, setIgnoring] = useState<OpenLine | null>(null);
  const [moving, setMoving] = useState<OpenEntry | null>(null);
  const [pending, startTransition] = useTransition();

  const lineById = useMemo(() => new Map(data.lines.map((l) => [l.id, l])), [data.lines]);
  const entryById = useMemo(() => new Map(data.entries.map((e) => [e.id, e])), [data.entries]);
  const { exact, ambiguous } = data.suggestions;
  // itens de sugestões e grupos ambíguos aparecem só na área de sugestões
  const suggested = useMemo(() => new Set([...exact.flatMap((s) => [s.lineId, s.entryId]), ...ambiguous.flatMap((g) => [...g.lineIds, ...g.entryIds])]), [exact, ambiguous]);
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
    <Button variant="ghost" size="sm" onClick={() => setIgnoring(line)} disabled={pending}>Ignorar</Button>
  </>;
  const entryActions = (entry: OpenEntry) => canEdit && <>
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setOutsideStatement(entry.id, true))}>Fora do extrato</Button>
    <Button variant="ghost" size="sm" disabled={pending || !data.otherAccounts.length} onClick={() => setMoving(entry)}>Trocar conta</Button>
  </>;

  const suggestionCount = exact.length + ambiguous.length;

  return <div className="grid gap-4">
    {data.truncated && <p className="m-0 rounded-lg bg-secondary px-3 py-2 text-xs">Período com muitas linhas: só as primeiras 2.000 de cada lado foram carregadas. Reduza o período.</p>}

    {suggestionCount > 0 && <section aria-label="Sugestões" className="overflow-hidden rounded-lg border border-primary/30 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2">
        <h2 className="m-0 flex items-center gap-1.5 text-sm font-semibold"><IconSparkles className="size-4 text-primary" aria-hidden /> Sugestões <span className="num text-xs font-medium text-muted-foreground">({suggestionCount})</span></h2>
        <span className="text-xs text-muted-foreground">mesmo dia e mesmo valor</span>
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
      <Column title="Extrato" count={columnLines.length} empty={data.lines.length ? "As linhas abertas restantes estão nas sugestões." : "Nenhuma linha aberta neste período."}>
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
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2">
        <span>Extrato ({chosenLines.length}): <strong className="num">{brl(summary.lines)}</strong></span>
        <span>Lançamentos ({chosenEntries.length}): <strong className="num">{brl(summary.entries)}</strong></span>
        <span role="status" aria-live="polite" className={cn("font-semibold", summary.difference === 0 && !summary.manyToMany ? "text-success" : "text-destructive")}>
          {summary.manyToMany ? "Escolha uma linha para vários lançamentos ou um lançamento para várias linhas" : summary.difference === 0 ? "✓ Somas conferem" : `Diferença: ${brl(summary.difference)}`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={clearSelection} disabled={pending}>Limpar</Button>
          <Button disabled={!summary.canLink || pending} onClick={() => run(() => linkReconciliation(chosenLines.map((l) => l.id), chosenEntries.map((e) => e.id)), clearSelection)}><IconLink /> Vincular</Button>
        </div>
      </div>
    </div>}

    <IgnoreDialog line={ignoring} pending={pending} onClose={() => setIgnoring(null)}
      onConfirm={(line, reason) => run(() => ignoreStatementLine(line.id, reason), () => { setIgnoring(null); setSelectedLines((s) => { const next = new Set(s); next.delete(line.id); return next; }); })} />
    <MoveDialog entry={moving} accounts={data.otherAccounts} pending={pending} onClose={() => setMoving(null)}
      onConfirm={(entry, accountId) => run(() => setEntryAccount(entry.id, accountId), () => setMoving(null))} />
  </div>;
}

function ClosingCard({ closing }: { closing: Closing }) {
  return <section aria-label="Fechamento do período" className="rounded-lg border bg-card px-3 py-2.5">
    <h2 className="m-0 mb-1.5 text-sm font-semibold">Fechamento</h2>
    {!closing.ok ? <p className="m-0 text-muted-foreground">Não dá para conferir o saldo: {closing.reason}</p> : <>
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

function IgnoreDialog({ line, pending, onClose, onConfirm }: { line: OpenLine | null; pending: boolean; onClose: () => void; onConfirm: (line: OpenLine, reason: string) => void }) {
  const [choice, setChoice] = useState<string>(IGNORE_REASONS[0]);
  const [detail, setDetail] = useState("");
  const reason = ignoreReasonText(choice, detail);
  const options = [...IGNORE_REASONS, OTHER_REASON].map((value) => ({ value, label: value }));
  return <Dialog open={line !== null} onOpenChange={(open) => { if (!open) { onClose(); setDetail(""); } }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Ignorar linha do extrato?</DialogTitle>
        <DialogDescription>{line && <>“{lineText(line)}” de <span className="num">{dateBR(line.date)}</span>, <span className="num">{brl(line.amountCents)}</span>, sai das pendências. Dá para reabrir depois em Ignoradas.</>}</DialogDescription>
      </DialogHeader>
      <form id="ignore-form" className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (line && reason) onConfirm(line, reason); }}>
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
