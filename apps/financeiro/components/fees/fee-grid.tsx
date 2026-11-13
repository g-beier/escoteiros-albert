"use client";

import { Fragment, useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { IconCheck, IconChevronRight, IconDots, IconHelpCircle, IconSearch } from "@tabler/icons-react";
import { addAssociateMovement, confirmFeeSuggestions, deleteAssociateMovement, setFeeAssociatePrice, setFeeExemption, setFeeRecord } from "@/app/mensalidades/actions";
import { FilterOptionsProvider, type FilterOption } from "@/components/entries/filter-options";
import { MultiFilter } from "@/components/entries/multi-filter";
import { OptionSelect } from "@/components/option-controls";
import { FeeCell, FeeMark, STATE_LABELS, type CellChange } from "@/components/fees/fee-cell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { branchLabels, isScoutBranch, NO_SECTION } from "@/lib/associates";
import { feeAmounts, feeBalance, priceForAssociate, todayInSaoPaulo, FEE_MONTH_LABELS, FEE_MONTH_NAMES, FEE_MONTHS, monthSummary, type AssociateMovement, type MonthSummary, type CellState, type MovementKind, type FeePrice, type FeeRow, type FeeSplit, type FeeSuggestion } from "@/lib/fees";
import { normalizeText } from "@/lib/statement-import";
import { dateBR, money } from "@/lib/format";
import { cn } from "@/lib/utils";

type Optimistic = { associateId: string; month: number; state: CellState | null };

const LEGEND: CellState[] = ["pago", "isento", "atencao", "nao_pago", "atrasado", "sugestao", "vazio", "fora"];

/** Grade de mensalidades do ano: associados × março a dezembro. */
export function FeeGrid({ year, rows, suggestions, splitsByAssociate, canEdit, price, individualPrices, onlyOverdue: initialOnlyOverdue = false, sectionOptions = [] }: {
  year: number; rows: FeeRow[]; suggestions: FeeSuggestion[]; splitsByAssociate: Record<string, FeeSplit[]>; canEdit: boolean;
  /** Valor do ano (nulo = não configurado: sem previsto/em aberto). */
  price: FeePrice | null;
  /** Valores individuais do ano por associado. */
  individualPrices: Record<string, { monthlyCents: number; reason: string }>;
  /** Começa mostrando só quem tem mensalidade atrasada (?atrasados=1). */
  onlyOverdue?: boolean;
  /** Seções do ano para o filtro `secao` (vazio = filtro escondido). */
  sectionOptions?: FilterOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [moving, setMoving] = useState<FeeRow | null>(null);
  const [bySection, setBySection] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(initialOnlyOverdue);
  // seções recolhidas (accordion) na visão agrupada
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sectionKey = (section: string | null | undefined) => section ?? NO_SECTION;
  const toggleSection = (key: string) => setCollapsed((set) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const [exempting, setExempting] = useState<FeeRow | null>(null);
  const [pricing, setPricing] = useState<FeeRow | null>(null);
  // estado otimista por caixinha, até o servidor responder
  const [optimistic, addOptimistic] = useOptimistic<Record<string, CellState | null>, Optimistic>({},
    (current, change) => ({ ...current, [`${change.associateId}:${change.month}`]: change.state }));

  const visible = useMemo(() => {
    const q = normalizeText(query);
    return rows.filter((row) => (showHidden || !row.hidden) && (!onlyOverdue || (!row.hidden && row.overdue > 0))
      && (!q || normalizeText(row.associate.name).includes(q)));
  }, [rows, query, showHidden, onlyOverdue]);
  const overdueCount = rows.filter((r) => !r.exemption && r.overdue > 0).length;
  const stateOf = (row: FeeRow, index: number) => optimistic[`${row.associate.id}:${FEE_MONTHS[index]}`] ?? row.cells[index].state;
  const summary = monthSummary(visible.filter((r) => !r.hidden).map((row) => row.cells.map((_, i) => stateOf(row, i))));
  const hiddenCount = rows.filter((r) => r.hidden).length;
  // valores recebidos (rateios de mensalidade lançados no ano) de quem está na tela
  const amounts = useMemo(() => feeAmounts(year, Object.fromEntries(visible.map((row) => [row.associate.id, splitsByAssociate[row.associate.id] ?? []]))),
    [year, visible, splitsByAssociate]);
  const filtered = visible.length !== rows.length;
  // previsto × recebido por associado (com valor do ano configurado)
  const balances = useMemo(() => new Map(visible.map((row) => [row.associate.id, feeBalance(row, splitsByAssociate[row.associate.id] ?? [], year,
    priceForAssociate(price, individualPrices[row.associate.id]?.monthlyCents))])),
    [visible, splitsByAssociate, year, price, individualPrices]);
  const expectedTotal = [...balances.values()].reduce((sum, b) => sum + b.expected, 0);
  const openTotal = [...balances.values()].reduce((sum, b) => sum + b.open, 0);
  const hasPrices = Boolean(price) || Object.keys(individualPrices).length > 0;
  const extra = hasPrices ? 1 : 0;
  const groups = useMemo(() => {
    if (!bySection) return [{ section: undefined as string | null | undefined, rows: visible }];
    const sections = [...new Set(visible.map((r) => r.associate.section?.trim() || null))]
      .sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, "pt-BR")));
    return sections.map((section) => ({ section, rows: visible.filter((r) => (r.associate.section?.trim() || null) === section) }));
  }, [visible, bySection]);

  function change(row: FeeRow, month: number, value: CellChange) {
    return new Promise<void>((resolve) => startTransition(async () => {
      addOptimistic({ associateId: row.associate.id, month, state: value.status ?? null });
      const result = await setFeeRecord({ associateId: row.associate.id, year, month, ...value });
      if (result.error) toast.error(result.error);
      resolve();
    }));
  }

  function confirmAll() {
    startTransition(async () => {
      const result = await confirmFeeSuggestions(suggestions.map((s) => ({ ...s, year })));
      if (result.error) toast.error(result.error); else toast.success(result.success);
    });
  }

  return <div className="grid gap-3 md:flex md:min-h-0 md:flex-1 md:flex-col">
    <dl className="m-0 flex flex-wrap items-stretch rounded-lg border bg-card py-2 [&>div+div]:border-l">
      <Figure label={`Recebido em ${year}${filtered ? " (na seleção)" : ""}`} value={money(amounts.total / 100)} className="text-success" />
      <Figure label="Pagamentos" value={String(amounts.count)} />
      {price && <Figure label={`Previsto (${money(price.monthlyCents / 100)}/mês)`} value={money(expectedTotal / 100)} />}
      {price && <Figure label="Em aberto" value={money(openTotal / 100)} className={openTotal > 0 ? "text-destructive" : undefined} />}
      {amounts.outsideGrid > 0 && <Figure label="Recebido em jan/fev" value={money(amounts.outsideGrid / 100)} />}
      {!price && <Tooltip>
        <TooltipTrigger render={<button type="button" className="mx-4 ml-auto grid size-6 place-items-center self-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Por que não há previsto e em aberto?" />}>
          <IconHelpCircle className="size-4" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="max-w-64">Configure o valor de {year} em Configurações › Mensalidades para ver o previsto e o em aberto.</TooltipContent>
      </Tooltip>}
    </dl>

    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="relative w-64">
        <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Buscar associado" placeholder="Buscar associado" className="h-7 pl-7" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {sectionOptions.length > 0 && <FilterOptionsProvider dimensions={{ secao: { label: "Seção", options: sectionOptions } }}>
        <MultiFilter filterKey="secao" />
      </FilterOptionsProvider>}
      <Label className="font-normal"><Checkbox checked={bySection} onCheckedChange={(v) => setBySection(v === true)} /> Agrupar por seção</Label>
      {bySection && groups.length > 1 && <Button variant="ghost" size="sm" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => sectionKey(g.section))))}>
        {collapsed.size ? "Expandir todas" : "Recolher todas"}</Button>}
      <Label className="font-normal"><Checkbox checked={onlyOverdue} onCheckedChange={(v) => setOnlyOverdue(v === true)} /> Só com atrasos ({overdueCount})</Label>
      {hiddenCount > 0 && <Label className="font-normal" title="Isentos no ano e quem está fora do grupo o ano todo (saídas, evasões)"><Checkbox checked={showHidden} onCheckedChange={(v) => setShowHidden(v === true)} /> Mostrar ocultos ({hiddenCount})</Label>}
      {canEdit && suggestions.length > 0 && <Button className="ml-auto" disabled={pending} onClick={confirmAll}><IconCheck /> Confirmar sugestões ({suggestions.length})</Button>}
    </div>

    {visible.length === 0
      ? <p className="m-0 rounded-lg border bg-card px-4 py-8 text-center text-muted-foreground">{rows.length ? "Ninguém corresponde à busca." : "Nenhum associado ativo. Cadastre em Configurações › Associados."}</p>
      : <div className="overflow-auto rounded-lg border bg-card md:min-h-0">
        <table className="w-full min-w-[60rem] table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">Mensalidades de {year}: associados por mês, de março a dezembro</caption>
          {/* larguras fixas: recolher seções não pode mudar as colunas; o nome fica com o espaço que sobra */}
          <colgroup>
            <col />
            {FEE_MONTHS.map((m) => <col key={m} className="w-10" />)}
            <col className="w-16" />
            <col className="w-28" />
            {hasPrices && <col className="w-28" />}
            {canEdit && <col className="w-10" />}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-2 text-right font-semibold">Associado</th>
              {FEE_MONTHS.map((m) => <th key={m} scope="col" className="px-1 py-2 text-center font-semibold">{FEE_MONTH_LABELS[m]}</th>)}
              <th scope="col" className="px-2 py-2 text-right font-semibold">Pagos</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold" title="Rateios de mensalidade lançados no ano">Recebido</th>
              {hasPrices && <th scope="col" className="px-2 py-2 text-right font-semibold" title="Previsto do ano menos o recebido">Em aberto</th>}
              {canEdit && <th scope="col"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>{groups.map((group) => <Fragment key={group.section ?? "__all"}>
            {bySection && (() => {
              const key = sectionKey(group.section);
              const open = !collapsed.has(key);
              const late = group.rows.filter((r) => !r.exemption && r.overdue > 0).length;
              return <tr className="bg-muted/50 *:border-t *:border-border"><th scope="colgroup" colSpan={FEE_MONTHS.length + (canEdit ? 4 : 3) + extra} className="sticky left-0 p-0 text-left text-xs font-semibold">
                <button type="button" aria-expanded={open} onClick={() => toggleSection(key)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-muted">
                  <IconChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
                  {key} <span className="font-normal text-muted-foreground">({group.rows.length}{late > 0 && `, ${late} com atraso`})</span>
                </button>
              </th></tr>;
            })()}
            {(!bySection || !collapsed.has(sectionKey(group.section))) && group.rows.map((row) => {
              const exempt = Boolean(row.exemption);
              const paid = row.cells.filter((_, i) => stateOf(row, i) === "pago").length;
              return <tr key={row.associate.id} className={cn("group/row *:border-t *:border-border hover:bg-accent has-[[aria-expanded=true]]:bg-accent", exempt && "text-muted-foreground")}>
                <th scope="row" className="sticky left-0 bg-card px-3 py-1.5 text-right normal-case tracking-normal group-hover/row:bg-accent group-has-[[aria-expanded=true]]/row:bg-accent">
                  <span className={cn("block truncate text-sm font-semibold", exempt ? "text-muted-foreground" : "text-foreground")}>{row.associate.name}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    {isScoutBranch(row.associate.branch) ? branchLabels[row.associate.branch] : row.associate.branch}
                    {row.associate.section && ` · ${row.associate.section}`}{row.associate.patrol && ` › ${row.associate.patrol}`}
                    {exempt && ` · isento: ${row.exemption!.reason}`}
                    {row.hidden === "fora" && " · fora do grupo no ano"}
                    {row.movements.length > 0 && <MovementSummary movements={row.movements} />}
                    {individualPrices[row.associate.id] && <span className="text-foreground"> · {money(individualPrices[row.associate.id].monthlyCents / 100)}/mês ({individualPrices[row.associate.id].reason})</span>}
                    {!row.associate.active && " · inativo"}
                  </span>
                </th>
                {row.cells.map((cell, i) => <td key={cell.month} className="px-1 py-1 text-center">
                  <FeeCell name={row.associate.name} month={cell.month} state={stateOf(row, i)} record={cell.record} suggestion={cell.suggestion}
                    splits={splitsByAssociate[row.associate.id] ?? []} canEdit={canEdit} exempt={exempt} onChange={(value) => change(row, cell.month, value)} />
                </td>)}
                <td className="px-2 py-1 text-right num">{exempt || !row.monthsInGroup ? "—" : `${paid}/${row.monthsInGroup}`}</td>
                <td className="px-2 py-1 text-right num whitespace-nowrap">{amounts.byAssociate[row.associate.id] ? money(amounts.byAssociate[row.associate.id] / 100) : <span className="text-muted-foreground">—</span>}</td>
                {hasPrices && <td className={cn("px-2 py-1 text-right num whitespace-nowrap", (balances.get(row.associate.id)?.open ?? 0) > 0 && "text-destructive")}>
                  {exempt ? "—" : balances.get(row.associate.id)?.integral ? <span className="text-success" title="Pagamento integral com desconto">integral</span> : money((balances.get(row.associate.id)?.open ?? 0) / 100)}
                </td>}
                {canEdit && <td className="px-1 py-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${row.associate.name}`} />}><IconDots /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPricing(row)}>{individualPrices[row.associate.id] ? "Alterar valor individual…" : `Valor individual em ${year}…`}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMoving(row)}>Entradas e saídas…</DropdownMenuItem>
                      {exempt
                        ? <DropdownMenuItem onClick={() => startTransition(async () => { const r = await setFeeExemption(row.associate.id, year, ""); if (r.error) toast.error(r.error); else toast.success(r.success); })}>Remover isenção de {year}</DropdownMenuItem>
                        : <DropdownMenuItem onClick={() => setExempting(row)}>Isentar em {year}…</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>}
              </tr>;
            })}
          </Fragment>)}</tbody>
          <tfoot className="sticky bottom-0 z-10 bg-muted shadow-[0_-1px_0_var(--border)]">
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-1.5 text-left font-semibold">Alertas</th>
              {summary.map((s, i) => <td key={FEE_MONTHS[i]} className="p-0 text-center num">
                <MonthAlerts month={FEE_MONTHS[i]} summary={s} receivedCents={amounts.byMonth[i]} />
              </td>)}
              <td className="px-2 py-1.5 text-right text-muted-foreground">Total</td>
              <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap num">{money(amounts.total / 100)}</td>
              {hasPrices && <td className={cn("px-2 py-1.5 text-right font-semibold whitespace-nowrap num", openTotal > 0 && "text-destructive")}>{money(openTotal / 100)}</td>}
              {canEdit && <td />}
            </tr>
            <tr>
              <td colSpan={FEE_MONTHS.length + (canEdit ? 4 : 3) + extra} className="border-t border-border p-0">
                <ul className="sticky left-0 m-0 flex w-fit list-none flex-wrap gap-x-3 gap-y-1 px-3 py-1.5 text-xs text-muted-foreground" aria-label="Legenda">
                  {LEGEND.map((state) => <li key={state} className="inline-flex items-center gap-1"><FeeMark state={state} className="size-4 [&_svg]:size-3" />{STATE_LABELS[state]}</li>)}
                </ul>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>}

    <MovementsDialog row={moving} onClose={() => setMoving(null)} />
    <PriceDialog row={pricing} year={year} pending={pending} current={pricing ? individualPrices[pricing.associate.id] : undefined}
      yearPrice={price} onClose={() => setPricing(null)}
      onConfirm={(row, monthly, reason) => startTransition(async () => {
        const result = await setFeeAssociatePrice(row.associate.id, year, monthly, reason);
        if (result.error) { toast.error(result.error); return; }
        toast.success(result.success);
        setPricing(null);
      })} />
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
const MOVEMENT_REASONS = ["Evasão", "Transferência", "Mudança de cidade", "Retorno", "Novo associado"];

/** Última movimentação, resumida na linha ("saiu 15/06/2026 · Evasão"). */
function MovementSummary({ movements }: { movements: AssociateMovement[] }) {
  const last = movements[movements.length - 1];
  return <> · {last.kind === "saida" ? "saiu" : "entrou"} <span className="num">{dateBR(last.date)}</span>{last.reason && ` (${last.reason})`}</>;
}

/** Entradas, saídas e retornos do associado: definem os meses cobrados. */
function MovementsDialog({ row, onClose }: { row: FeeRow | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<MovementKind>("saida");
  const [date, setDate] = useState(todayInSaoPaulo());
  const [reason, setReason] = useState("");
  const run = (action: () => Promise<{ error?: string; success?: string }>, after?: () => void) => startTransition(async () => {
    const result = await action();
    if (result.error) { toast.error(result.error); return; }
    toast.success(result.success);
    after?.();
  });
  return <Dialog open={row !== null} onOpenChange={(open) => { if (!open) { onClose(); setReason(""); } }}>
    <DialogContent>
      {row && <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Entradas e saídas de {row.associate.name}</DialogTitle>
          <DialogDescription>Fora do grupo (depois de uma saída e antes de um retorno), o mês não é cobrado nem fica atrasado. Sem registros, vale como no grupo o tempo todo.</DialogDescription>
        </DialogHeader>
        {row.movements.length > 0
          ? <ul className="m-0 grid list-none gap-1 p-0">{row.movements.map((m) => <li key={m.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
              <span className={cn("rounded px-1.5 py-0.5 font-semibold", m.kind === "saida" ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success")}>{m.kind === "saida" ? "Saída" : "Entrada"}</span>
              <span className="num">{dateBR(m.date)}</span>
              {m.reason && <span className="text-muted-foreground">{m.reason}</span>}
              <Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={pending} onClick={() => run(() => deleteAssociateMovement(m.id), onClose)}>Remover</Button>
            </li>)}</ul>
          : <p className="m-0 text-xs text-muted-foreground">Nenhuma movimentação registrada.</p>}
        <form className="grid gap-3 rounded-md bg-muted/50 p-3" onSubmit={(event) => { event.preventDefault(); run(() => addAssociateMovement(row.associate.id, date, kind, reason), () => { setReason(""); onClose(); }); }}>
          <p className="m-0 text-xs font-semibold">Registrar</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5"><Label htmlFor="movement-kind">Tipo</Label>
              <OptionSelect id="movement-kind" value={kind} onValueChange={(value) => setKind(value as MovementKind)}
                options={[{ value: "saida", label: "Saída" }, { value: "entrada", label: "Entrada / retorno" }]} /></div>
            <div className="grid gap-1.5"><Label htmlFor="movement-date">Data</Label>
              <Input id="movement-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="num" /></div>
            <div className="grid min-w-48 flex-1 gap-1.5"><Label htmlFor="movement-reason">Motivo (opcional)</Label>
              <Input id="movement-reason" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} list="movement-reasons" />
              <datalist id="movement-reasons">{MOVEMENT_REASONS.map((r) => <option key={r} value={r} />)}</datalist></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
            <Button type="submit" disabled={pending || !date}>Registrar</Button>
          </DialogFooter>
        </form>
      </div>}
    </DialogContent>
  </Dialog>;
}
const PRICE_REASONS = ["Irmãos", "Combinação", "Bolsa parcial"];

/** Valor individual do associado no ano: substitui o valor do ano; o desconto do integral também vale sobre ele. */
function PriceDialog({ row, year, current, yearPrice, pending, onClose, onConfirm }: {
  row: FeeRow | null; year: number; current?: { monthlyCents: number; reason: string }; yearPrice: FeePrice | null; pending: boolean;
  onClose: () => void; onConfirm: (row: FeeRow, monthly: string, reason: string) => void;
}) {
  return <Dialog open={row !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      {row && <PriceForm key={row.associate.id} row={row} year={year} current={current} yearPrice={yearPrice} pending={pending} onClose={onClose} onConfirm={onConfirm} />}
    </DialogContent>
  </Dialog>;
}

function PriceForm({ row, year, current, yearPrice, pending, onClose, onConfirm }: {
  row: FeeRow; year: number; current?: { monthlyCents: number; reason: string }; yearPrice: FeePrice | null; pending: boolean;
  onClose: () => void; onConfirm: (row: FeeRow, monthly: string, reason: string) => void;
}) {
  const [monthly, setMonthly] = useState(current ? (current.monthlyCents / 100).toFixed(2).replace(".", ",") : "");
  const [reason, setReason] = useState(current?.reason ?? "");
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); onConfirm(row, monthly, reason); }}>
    <DialogHeader>
      <DialogTitle>Valor individual de {row.associate.name} em {year}</DialogTitle>
      <DialogDescription>
        Substitui {yearPrice ? <>o valor do ano (<span className="num">{money(yearPrice.monthlyCents / 100)}</span>/mês)</> : "o valor do ano"} no previsto, no em aberto e nas sugestões. O desconto do pagamento integral também vale sobre ele.
      </DialogDescription>
    </DialogHeader>
    <div className="flex flex-wrap gap-3">
      <div className="grid gap-1.5"><Label htmlFor="price-monthly">Mensalidade (R$)</Label>
        <Input id="price-monthly" inputMode="decimal" placeholder="Ex.: 40,00" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="w-32 text-right num" required /></div>
      <div className="grid min-w-56 flex-1 gap-1.5"><Label htmlFor="price-reason">Motivo</Label>
        <Input id="price-reason" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} list="price-reasons" required minLength={2} />
        <datalist id="price-reasons">{PRICE_REASONS.map((r) => <option key={r} value={r} />)}</datalist></div>
    </div>
    <DialogFooter>
      {current && <Button type="button" variant="ghost" className="mr-auto" disabled={pending} onClick={() => onConfirm(row, "", "")}>Remover valor individual</Button>}
      <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
      <Button type="submit" disabled={pending}>Salvar</Button>
    </DialogFooter>
  </form>;
}

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

/** Número da faixa de totais: rótulo pequeno e valor em destaque, lado a lado com os outros. */
function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className="grid min-w-36 gap-0.5 px-5 py-1">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={cn("m-0 num text-lg leading-tight font-bold", className)}>{value}</dd>
  </div>;
}

/** Rótulos (no plural) do detalhe de cada mês, na ordem do tooltip. */
const MONTH_DETAIL: { state: CellState; label: string }[] = [
  { state: "pago", label: "pagos" },
  { state: "isento", label: "isentos" },
  { state: "atrasado", label: "atrasados" },
  { state: "nao_pago", label: "não pagos" },
  { state: "atencao", label: "em atenção" },
  { state: "sugestao", label: "a confirmar" },
  { state: "vazio", label: "sem registro" },
  { state: "fora", label: "fora do grupo" },
];

/** Linha "Alertas" do rodapé: atrasados, não pagos e atenção somados; o tooltip detalha o mês (só o que não é zero) e o recebido. */
function MonthAlerts({ month, summary, receivedCents }: { month: number; summary: MonthSummary; receivedCents: number }) {
  const alerts = summary.late + summary.atencao;
  const details = MONTH_DETAIL.filter(({ state }) => summary[state] > 0);
  const received = receivedCents ? money(receivedCents / 100) : "nada";
  const label = `${FEE_MONTH_NAMES[month]}: ${alerts} ${alerts === 1 ? "alerta" : "alertas"}; ${details.map(({ state, label }) => `${summary[state]} ${label}`).join(", ")}; recebido ${received}`;
  return <Tooltip>
    <TooltipTrigger render={<button type="button" aria-label={label}
      className="grid min-h-full w-full cursor-help place-items-center px-1 py-1.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" />}>
      {alerts > 0
        ? <span aria-hidden className="inline-flex min-w-6 justify-center rounded bg-destructive px-1 text-xs font-semibold text-white">{alerts}</span>
        : <span aria-hidden className="text-muted-foreground">—</span>}
    </TooltipTrigger>
    <TooltipContent className="grid w-auto max-w-none min-w-40 items-stretch gap-1 p-2.5">
      <p className="m-0 font-semibold capitalize">{FEE_MONTH_NAMES[month]}</p>
      {details.map(({ state, label }) => <p key={state} className="m-0 flex items-center gap-2">
        <span className="grid rounded bg-background p-0.5"><FeeMark state={state} className="size-3.5 [&_svg]:size-2.5" /></span>
        <span className="flex-1">{label}</span><span className="num font-semibold">{summary[state]}</span>
      </p>)}
      <p className="m-0 flex justify-between gap-3 border-t border-background/20 pt-1"><span>Recebido</span><span className="num font-semibold">{receivedCents ? money(receivedCents / 100) : "—"}</span></p>
    </TooltipContent>
  </Tooltip>;
}
