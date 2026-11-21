"use client";

import { useState } from "react";
import { IconArrowDown, IconArrowUp, IconCheck } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@geas/ui/components/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@geas/ui/components/popover";
import { cn } from "@geas/ui/lib/utils";
import { parseEntrySort, type EntrySortKey, type SortOrder } from "@/lib/finance/filters";
import { formatCents } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { useListParams } from "./filter-options";
import { TriggerContent, triggerElement, type FilterVariant } from "./filter-trigger";
import { usePeriodFilter } from "./date-filter";

export type ColumnSort = { key: EntrySortKey; labels: [string, string] };

/** Ordem atual da lista (URL) para uma coluna, e a função que muda a ordem (padrão data desc = sem parâmetros). */
export function useEntrySort(key: EntrySortKey) {
  const { params, apply } = useListParams();
  const current = parseEntrySort(Object.fromEntries(params.entries()));
  const sorted = current.key === key;
  const sortBy = (dir: SortOrder) => apply(key === "data" && dir === "desc" ? { ordem: null, dir: null } : { ordem: key, dir });
  return { sorted, dir: current.dir, sortBy };
}

/** Seção "Ordenar" do menu da coluna, igual à dos Materiais: vale na hora. */
export function SortSection({ labels, sorted, dir, onSort }: { labels: [string, string]; sorted: boolean; dir: SortOrder; onSort: (dir: SortOrder) => void }) {
  return <ToggleGroup orientation="vertical" aria-label="Ordenar" value={sorted ? [dir] : []} className="grid w-full gap-0 p-1.5">
    {(["asc", "desc"] as const).map((value, index) => {
      const active = sorted && dir === value;
      return <ToggleGroupItem key={value} value={value} onClick={() => onSort(value)}
        className="h-auto justify-start gap-2 rounded-md px-2 py-1.5 text-left text-xs font-normal hover:bg-muted aria-pressed:bg-transparent aria-pressed:font-semibold aria-pressed:hover:bg-muted">
        {value === "asc" ? <IconArrowUp className="size-3.5" aria-hidden /> : <IconArrowDown className="size-3.5" aria-hidden />}
        {labels[index]}
        {active && <IconCheck className="ml-auto size-3.5 text-primary" aria-hidden />}
      </ToggleGroupItem>;
    })}
  </ToggleGroup>;
}

/** Faixa de/até em reais (com sinal) nos parâmetros `from`/`to` da URL. */
export type ColumnRange = { from: string; to: string };

/** Rascunho de/até de um filtro do menu da coluna (faixa de valor ou período). */
export type Draft = { from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void; onEnter: (event: React.KeyboardEvent) => void };

/** Filtro de/até do menu da coluna: vale ao Aplicar (ou Enter). */
export type DraftFilter = {
  title: string;
  /** Resumo do filtro aplicado (para o `title` do cabeçalho, o botão e o chip), ou null sem filtro. */
  summary: string | null;
  initial: () => { from: string; to: string };
  /** Mensagem de erro do rascunho, ou null. */
  invalid: (from: string, to: string) => string | null;
  /** Mudanças na URL ao aplicar (`clear` = remover o filtro). */
  changes: (from: string, to: string, clear: boolean) => Record<string, string | null>;
  fields: (draft: Draft) => React.ReactNode;
  hint?: string;
};

const cents = (raw: string | null) => raw?.trim() ? parseMoneyToCents(raw.trim(), { allowNegative: true }) : null;
const validMoney = (value: string) => !value.trim() || cents(value) != null;

/** Resumo da faixa de valor (com sinal); null = sem faixa válida. */
export function rangeSummary(rawFrom: string | null, rawTo: string | null) {
  const from = cents(rawFrom);
  const to = cents(rawTo);
  if (from != null && to != null) return `de ${formatCents(from)} até ${formatCents(to)}`;
  if (from != null) return `a partir de ${formatCents(from)}`;
  if (to != null) return `até ${formatCents(to)}`;
  return null;
}

function useRangeFilter(range: ColumnRange | undefined, id: string): DraftFilter | null {
  const { params } = useListParams();
  if (!range) return null;
  const field = (key: string, text: string, value: string, set: (value: string) => void, onEnter: Draft["onEnter"]) => <div className="grid gap-1.5">
    <Label htmlFor={key}>{text} (R$)</Label>
    <Input id={key} value={value} onChange={(event) => set(event.target.value)} inputMode="decimal" className="num" onKeyDown={onEnter}
      aria-invalid={!validMoney(value) || undefined} />
  </div>;
  return {
    title: "Filtrar por faixa",
    summary: rangeSummary(params.get(range.from), params.get(range.to)),
    initial: () => ({ from: params.get(range.from) ?? "", to: params.get(range.to) ?? "" }),
    invalid: (from, to) => validMoney(from) && validMoney(to) ? null : "Valor inválido.",
    changes: (from, to, clear) => ({ [range.from]: clear ? null : from.trim() || null, [range.to]: clear ? null : to.trim() || null }),
    fields: ({ from, to, setFrom, setTo, onEnter }) => <div className="flex items-end gap-2">
      {field(`${id}-from`, "De", from, setFrom, onEnter)}
      {field(`${id}-to`, "Até", to, setTo, onEnter)}
    </div>,
    hint: "Despesas são negativas, como na coluna (ex.: de -500 até -100).",
  };
}

/**
 * Menu de coluna com ordenar (Data, Histórico, Valor) e, com `range` (Valor) ou `period` (Data), uma seção de
 * filtro de/até como nos Materiais: a ordem vale na hora; o filtro, ao Aplicar (ou Enter).
 */
export function SortMenu({ label, sort, range, period = false, align = "start", variant = "head" }: {
  label: string; sort: ColumnSort; range?: ColumnRange; period?: boolean; align?: "start" | "end"; variant?: FilterVariant;
}) {
  const [open, setOpen] = useState(false);
  const { sorted, dir, sortBy } = useEntrySort(sort.key);
  const { apply } = useListParams();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rangeFilter = useRangeFilter(range, sort.key);
  const periodFilter = usePeriodFilter();
  const filter = period ? periodFilter : rangeFilter;
  const error = filter?.invalid(from, to) ?? null;

  const onOpenChange = (next: boolean) => {
    if (next && filter) { const initial = filter.initial(); setFrom(initial.from); setTo(initial.to); }
    setOpen(next);
  };
  const applyFilter = (clear: boolean) => {
    if (!filter || (!clear && error)) return;
    apply(filter.changes(from, to, clear));
    setOpen(false);
  };
  const onEnter = (event: React.KeyboardEvent) => { if (event.key === "Enter") applyFilter(false); };
  const trigger = { variant, label, summary: filter?.summary ?? null, sorted, dir };

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger render={triggerElement(trigger)}><TriggerContent {...trigger} /></PopoverTrigger>
    <PopoverContent align={align} className={cn(period ? "w-80" : range ? "w-72" : "w-64", "gap-0 p-0 text-xs font-normal tracking-normal normal-case")}>
      <div className="border-b px-3 py-2 text-sm font-semibold text-foreground">{label}</div>
      <SortSection labels={sort.labels} sorted={sorted} dir={dir} onSort={(next) => { sortBy(next); setOpen(false); }} />
      {filter && <>
        <div className="grid gap-2 border-t p-3">
          <span className="font-semibold text-foreground">{filter.title}</span>
          {filter.fields({ from, to, setFrom, setTo, onEnter })}
          {filter.hint && <span className="text-muted-foreground">{filter.hint}</span>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          {error
            ? <span className="mr-auto text-destructive">{error}</span>
            : filter.summary !== null && <button type="button" className="mr-auto font-semibold text-primary hover:underline" onClick={() => applyFilter(true)}>Remover filtro</button>}
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => applyFilter(false)} disabled={Boolean(error)}>Aplicar</Button>
        </div>
      </>}
    </PopoverContent>
  </Popover>;
}
