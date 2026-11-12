"use client";

import { Fragment, useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { IconCheck, IconDots, IconSearch } from "@tabler/icons-react";
import { confirmFeeSuggestions, setFeeExemption, setFeeRecord } from "@/app/mensalidades/actions";
import { FeeCell, FeeMark, STATE_LABELS, type CellChange } from "@/components/fees/fee-cell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { branchLabels, isScoutBranch, NO_SECTION } from "@/lib/associates";
import { feeAmounts, feeBalance, FEE_MONTH_LABELS, FEE_MONTHS, monthSummary, type CellState, type FeePrice, type FeeRow, type FeeSplit, type FeeSuggestion } from "@/lib/fees";
import { normalizeText } from "@/lib/statement-import";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Optimistic = { associateId: string; month: number; state: CellState | null };

const LEGEND: CellState[] = ["pago", "atencao", "atrasado", "sugestao", "vazio"];

/** Grade de mensalidades do ano: associados × março a dezembro. */
export function FeeGrid({ year, rows, suggestions, splitsByAssociate, canEdit, price, onlyOverdue: initialOnlyOverdue = false }: {
  year: number; rows: FeeRow[]; suggestions: FeeSuggestion[]; splitsByAssociate: Record<string, FeeSplit[]>; canEdit: boolean;
  /** Valor do ano (nulo = não configurado: sem previsto/em aberto). */
  price: FeePrice | null;
  /** Começa mostrando só quem tem mensalidade atrasada (?atrasados=1). */
  onlyOverdue?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [showExempt, setShowExempt] = useState(false);
  const [bySection, setBySection] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(initialOnlyOverdue);
  const [exempting, setExempting] = useState<FeeRow | null>(null);
  // estado otimista por caixinha, até o servidor responder
  const [optimistic, addOptimistic] = useOptimistic<Record<string, CellState | null>, Optimistic>({},
    (current, change) => ({ ...current, [`${change.associateId}:${change.month}`]: change.state }));

  const visible = useMemo(() => {
    const q = normalizeText(query);
    return rows.filter((row) => (showExempt || !row.exemption) && (!onlyOverdue || (!row.exemption && row.overdue > 0))
      && (!q || normalizeText(row.associate.name).includes(q)));
  }, [rows, query, showExempt, onlyOverdue]);
  const overdueCount = rows.filter((r) => !r.exemption && r.overdue > 0).length;
  const stateOf = (row: FeeRow, index: number) => optimistic[`${row.associate.id}:${FEE_MONTHS[index]}`] ?? row.cells[index].state;
  const summary = monthSummary(visible.filter((r) => !r.exemption).map((row) => row.cells.map((_, i) => stateOf(row, i))));
  const exemptCount = rows.filter((r) => r.exemption).length;
  // valores recebidos (rateios de mensalidade lançados no ano) de quem está na tela
  const amounts = useMemo(() => feeAmounts(year, Object.fromEntries(visible.map((row) => [row.associate.id, splitsByAssociate[row.associate.id] ?? []]))),
    [year, visible, splitsByAssociate]);
  const filtered = visible.length !== rows.length;
  // previsto × recebido por associado (com valor do ano configurado)
  const balances = useMemo(() => new Map(visible.map((row) => [row.associate.id, feeBalance(row, splitsByAssociate[row.associate.id] ?? [], year, price)])),
    [visible, splitsByAssociate, year, price]);
  const expectedTotal = [...balances.values()].reduce((sum, b) => sum + b.expected, 0);
  const openTotal = [...balances.values()].reduce((sum, b) => sum + b.open, 0);
  const extra = price ? 1 : 0;
  const groups = useMemo(() => {
    if (!bySection) return [{ section: undefined as string | null | undefined, rows: visible }];
    const sections = [...new Set(visible.map((r) => r.associate.section?.trim() || null))]
      .sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, "pt-BR")));
    return sections.map((section) => ({ section, rows: visible.filter((r) => (r.associate.section?.trim() || null) === section) }));
  }, [visible, bySection]);

  function change(row: FeeRow, month: number, value: CellChange) {
    startTransition(async () => {
      addOptimistic({ associateId: row.associate.id, month, state: value.status ?? null });
      const result = await setFeeRecord({ associateId: row.associate.id, year, month, ...value });
      if (result.error) toast.error(result.error);
    });
  }

  function confirmAll() {
    startTransition(async () => {
      const result = await confirmFeeSuggestions(suggestions.map((s) => ({ ...s, year })));
      if (result.error) toast.error(result.error); else toast.success(result.success);
    });
  }

  return <div className="grid gap-3">
    <dl className="m-0 flex flex-wrap gap-3">
      <div className="grid gap-0.5 rounded-lg border bg-card px-4 py-2.5">
        <dt className="text-xs text-muted-foreground">Recebido em {year}{filtered && " (na seleção)"}</dt>
        <dd className="m-0 num text-xl font-bold text-success">{money(amounts.total / 100)}</dd>
      </div>
      <div className="grid gap-0.5 rounded-lg border bg-card px-4 py-2.5">
        <dt className="text-xs text-muted-foreground">Pagamentos</dt>
        <dd className="m-0 num text-xl font-bold">{amounts.count}</dd>
      </div>
      {price && <div className="grid gap-0.5 rounded-lg border bg-card px-4 py-2.5">
        <dt className="text-xs text-muted-foreground">Previsto ({money(price.monthlyCents / 100)}/mês)</dt>
        <dd className="m-0 num text-xl font-bold">{money(expectedTotal / 100)}</dd>
      </div>}
      {price && <div className="grid gap-0.5 rounded-lg border bg-card px-4 py-2.5">
        <dt className="text-xs text-muted-foreground">Em aberto</dt>
        <dd className={cn("m-0 num text-xl font-bold", openTotal > 0 && "text-destructive")}>{money(openTotal / 100)}</dd>
      </div>}
      {!price && canEdit && <p className="m-0 self-center text-xs text-muted-foreground">Configure o valor de {year} em Configurações › Mensalidades para ver previsto e em aberto.</p>}
      {amounts.outsideGrid > 0 && <div className="grid gap-0.5 rounded-lg border bg-card px-4 py-2.5">
        <dt className="text-xs text-muted-foreground">Recebido em jan/fev</dt>
        <dd className="m-0 num text-xl font-bold">{money(amounts.outsideGrid / 100)}</dd>
      </div>}
    </dl>

    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="relative w-64">
        <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Buscar associado" placeholder="Buscar associado" className="h-7 pl-7" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <Label className="font-normal"><Checkbox checked={bySection} onCheckedChange={(v) => setBySection(v === true)} /> Agrupar por seção</Label>
      <Label className="font-normal"><Checkbox checked={onlyOverdue} onCheckedChange={(v) => setOnlyOverdue(v === true)} /> Só com atrasos ({overdueCount})</Label>
      {exemptCount > 0 && <Label className="font-normal"><Checkbox checked={showExempt} onCheckedChange={(v) => setShowExempt(v === true)} /> Mostrar isentos ({exemptCount})</Label>}
      <ul className="m-0 flex list-none flex-wrap gap-3 p-0 text-xs text-muted-foreground" aria-label="Legenda">
        {LEGEND.map((state) => <li key={state} className="inline-flex items-center gap-1"><FeeMark state={state} className="size-4 [&_svg]:size-3" />{STATE_LABELS[state]}</li>)}
      </ul>
      {canEdit && suggestions.length > 0 && <Button className="ml-auto" disabled={pending} onClick={confirmAll}><IconCheck /> Confirmar sugestões ({suggestions.length})</Button>}
    </div>

    {visible.length === 0
      ? <p className="m-0 rounded-lg border bg-card px-4 py-8 text-center text-muted-foreground">{rows.length ? "Ninguém corresponde à busca." : "Nenhum associado ativo. Cadastre em Configurações › Associados."}</p>
      : <div className="overflow-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <caption className="sr-only">Mensalidades de {year}: associados por mês, de março a dezembro</caption>
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-semibold">Associado</th>
              {FEE_MONTHS.map((m) => <th key={m} scope="col" className="w-10 px-1 py-2 text-center font-semibold">{FEE_MONTH_LABELS[m]}</th>)}
              <th scope="col" className="px-3 py-2 text-right font-semibold">Pagos</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold" title="Rateios de mensalidade lançados no ano">Recebido</th>
              {price && <th scope="col" className="px-3 py-2 text-right font-semibold" title="Previsto do ano menos o recebido">Em aberto</th>}
              {canEdit && <th scope="col" className="w-10"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>{groups.map((group) => <Fragment key={group.section ?? "__all"}>
            {bySection && <tr className="bg-muted/50"><th scope="colgroup" colSpan={FEE_MONTHS.length + (canEdit ? 4 : 3) + extra} className="sticky left-0 px-3 py-1.5 text-left text-xs font-semibold">
              {group.section ?? NO_SECTION} <span className="font-normal text-muted-foreground">({group.rows.length})</span></th></tr>}
            {group.rows.map((row) => {
              const exempt = Boolean(row.exemption);
              const paid = row.cells.filter((_, i) => stateOf(row, i) === "pago").length;
              return <tr key={row.associate.id} className={cn("border-t", exempt && "text-muted-foreground")}>
                <th scope="row" className="sticky left-0 bg-card px-3 py-1 text-left font-medium">
                  <span className="block truncate">{row.associate.name}</span>
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {isScoutBranch(row.associate.branch) ? branchLabels[row.associate.branch] : row.associate.branch}
                    {row.associate.section && ` · ${row.associate.section}`}
                    {exempt && ` · isento: ${row.exemption!.reason}`}
                    {!row.associate.active && " · inativo"}
                  </span>
                </th>
                {row.cells.map((cell, i) => <td key={cell.month} className="px-1 py-1 text-center">
                  <FeeCell name={row.associate.name} month={cell.month} state={stateOf(row, i)} record={cell.record} suggestion={cell.suggestion}
                    splits={splitsByAssociate[row.associate.id] ?? []} canEdit={canEdit} exempt={exempt} onChange={(value) => change(row, cell.month, value)} />
                </td>)}
                <td className="px-3 py-1 text-right num">{exempt ? "—" : `${paid}/${FEE_MONTHS.length}`}</td>
                <td className="px-3 py-1 text-right num whitespace-nowrap">{amounts.byAssociate[row.associate.id] ? money(amounts.byAssociate[row.associate.id] / 100) : <span className="text-muted-foreground">—</span>}</td>
                {price && <td className={cn("px-3 py-1 text-right num whitespace-nowrap", (balances.get(row.associate.id)?.open ?? 0) > 0 && "text-destructive")}>
                  {exempt ? "—" : balances.get(row.associate.id)?.integral ? <span className="text-success" title="Pagamento integral com desconto">integral</span> : money((balances.get(row.associate.id)?.open ?? 0) / 100)}
                </td>}
                {canEdit && <td className="px-1 py-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${row.associate.name}`} />}><IconDots /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {exempt
                        ? <DropdownMenuItem onClick={() => startTransition(async () => { const r = await setFeeExemption(row.associate.id, year, ""); if (r.error) toast.error(r.error); else toast.success(r.success); })}>Remover isenção de {year}</DropdownMenuItem>
                        : <DropdownMenuItem onClick={() => setExempting(row)}>Isentar em {year}…</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>}
              </tr>;
            })}
          </Fragment>)}</tbody>
          <tfoot className="border-t bg-muted/50">
            <tr>
              <th scope="row" className="sticky left-0 bg-muted/50 px-3 py-1.5 text-left font-semibold">Por mês</th>
              {summary.map((s, i) => <td key={FEE_MONTHS[i]} className="px-1 py-1.5 text-center text-[11px] leading-tight num">
                <span className="block text-success" title="pagos">{s.pago}</span>
                {s.atrasado > 0 && <span className="block text-destructive" title="atrasados">{s.atrasado}</span>}
                {s.atencao > 0 && <span className="block text-amber-700" title="em atenção">{s.atencao}</span>}
              </td>)}
              <td colSpan={(canEdit ? 3 : 2) + extra} className="px-3 py-1.5 text-right text-[11px] text-muted-foreground">verde pagos · vermelho atrasados · amarelo atenção</td>
            </tr>
            <tr className="border-t">
              <th scope="row" className="sticky left-0 bg-muted/50 px-3 py-1.5 text-left font-semibold" title="Pela data do lançamento">Recebido no mês</th>
              {amounts.byMonth.map((cents, i) => <td key={FEE_MONTHS[i]} className="px-1 py-1.5 text-center text-[11px] whitespace-nowrap num">
                {cents ? money(cents / 100) : <span className="text-muted-foreground">—</span>}</td>)}
              <td className="px-3 py-1.5 text-right text-muted-foreground">Total</td>
              <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap num">{money(amounts.total / 100)}</td>
              {price && <td className={cn("px-3 py-1.5 text-right font-semibold whitespace-nowrap num", openTotal > 0 && "text-destructive")}>{money(openTotal / 100)}</td>}
              {canEdit && <td />}
            </tr>
          </tfoot>
        </table>
      </div>}

    <ExemptionDialog row={exempting} year={year} pending={pending} onClose={() => setExempting(null)}
      onConfirm={(row, reason) => startTransition(async () => {
        const result = await setFeeExemption(row.associate.id, year, reason);
        if (result.error) { toast.error(result.error); return; }
        toast.success(result.success);
        setExempting(null);
      })} />
  </div>;
}

const REASONS = ["Voluntário(a)", "Bolsa", "Escotista", "Outro"];

function ExemptionDialog({ row, year, pending, onClose, onConfirm }: { row: FeeRow | null; year: number; pending: boolean; onClose: () => void; onConfirm: (row: FeeRow, reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <Dialog open={row !== null} onOpenChange={(open) => { if (!open) { onClose(); setReason(""); } }}>
    <DialogContent>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (row && reason.trim().length >= 2) onConfirm(row, reason.trim()); }}>
        <DialogHeader>
          <DialogTitle>Isentar {row?.associate.name} em {year}?</DialogTitle>
          <DialogDescription>Quem é isento sai da grade (aparece com “Mostrar isentos”) e não conta como atrasado. Vale só para {year}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="exemption-reason">Motivo</Label>
          <Input id="exemption-reason" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} required minLength={2} list="exemption-reasons" />
          <datalist id="exemption-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={pending || reason.trim().length < 2}>Isentar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
