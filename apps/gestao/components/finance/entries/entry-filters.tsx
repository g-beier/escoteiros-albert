"use client";

import { useEffect, useRef, useState } from "react";
import { IconAdjustmentsHorizontal, IconFilterOff, IconSearch, IconX } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { cn } from "@geas/ui/lib/utils";
import { COLUMN_RANGES, COLUMN_SORTS } from "@/components/finance/entry-tables";
import type { EntryView } from "@/lib/finance/entry-rows";
import { useDimension, useListParams, type FilterKey } from "./filter-options";
import { MultiFilter, useFilterSummary } from "./multi-filter";
import { SortMenu, rangeSummary } from "./sort-menu";
import { usePeriodFilter } from "./date-filter";
import { AssociateFilter, useAssociateSummary } from "./associate-filter";
import { ColumnsMenu } from "./columns";

const FILTER_KEYS = [
  "de",
  "ate",
  "conta",
  "forma",
  "pasta",
  "conciliado",
  "associado",
  "divisao",
  "rubrica",
  "q",
  "ofx",
  "valor_de",
  "valor_ate",
] as const;

type ChipItem = { key: string; label: React.ReactNode; title: string; clear: Record<string, null> };

/** Chip removível de um filtro ativo. */
function Chip({ label, title, onRemove }: { label: React.ReactNode; title: string; onRemove: () => void }) {
  return (
    <Button variant="secondary" className="h-7 max-w-72" onClick={onRemove} title={title}>
      <span className="truncate">{label}</span> <IconX data-icon="inline-end" />
    </Button>
  );
}

function useDimensionChip(filterKey: FilterKey): ChipItem | null {
  const { label } = useDimension(filterKey);
  const summary = useFilterSummary(filterKey);
  return summary
    ? {
        key: filterKey,
        label: `${label}: ${summary}`,
        title: `Remover o filtro de ${label.toLowerCase()}`,
        clear: { [filterKey]: null },
      }
    : null;
}

/** Filtros ativos, na ordem das colunas. A busca não vira chip (fica no campo). */
function useActiveFilters(): ChipItem[] {
  const { params } = useListParams();
  const period = usePeriodFilter().summary;
  const value = rangeSummary(params.get("valor_de"), params.get("valor_ate"));
  const associate = useAssociateSummary();
  const ofx = params.get("ofx");
  const account = useDimensionChip("conta");
  const method = useDimensionChip("forma");
  const folder = useDimensionChip("pasta");
  const reconciled = useDimensionChip("conciliado");
  const category = useDimensionChip("rubrica");
  return [
    period
      ? {
          key: "data",
          label: `Data: ${period}`,
          title: "Voltar ao período padrão (desde o início do ano)",
          clear: { de: null, ate: null },
        }
      : null,
    account,
    method,
    folder,
    reconciled,
    ofx
      ? {
          key: "ofx",
          label: (
            <>
              ID OFX <span className="num">{ofx}</span>
            </>
          ),
          title: "Remover o filtro por ID OFX",
          clear: { ofx: null },
        }
      : null,
    value
      ? {
          key: "valor",
          label: <span className="num">Valor {value}</span>,
          title: "Remover o filtro por faixa de valor",
          clear: { valor_de: null, valor_ate: null },
        }
      : null,
    associate.names
      ? {
          key: "associado",
          label: `Associado: ${associate.names}`,
          title: "Remover o filtro de associado",
          clear: { associado: null },
        }
      : null,
    associate.divisions
      ? {
          key: "divisao",
          label: `Divisão: ${associate.divisions}`,
          title: "Remover o filtro por divisão",
          clear: { divisao: null },
        }
      : null,
    category,
  ].filter((chip): chip is ChipItem => chip !== null);
}

/** Abaixo de `lg`: os filtros das colunas da tela num diálogo, um botão por filtro (abre o mesmo menu da coluna). */
function FiltersDialog({ view, count }: { view: EntryView; count: number }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" className="lg:hidden" />}>
        <IconAdjustmentsHorizontal data-icon="inline-start" /> Filtros
        {count > 0 && <span className="num"> ({count})</span>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Filtros</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <SortMenu variant="row" label="Data" sort={COLUMN_SORTS.Data} period />
          <MultiFilter variant="row" filterKey="conta" />
          <MultiFilter variant="row" filterKey="forma" />
          <MultiFilter variant="row" filterKey="pasta" />
          <MultiFilter variant="row" filterKey="conciliado" />
          <SortMenu variant="row" label="Valor" sort={COLUMN_SORTS.Valor} range={COLUMN_RANGES.Valor} />
          {view === "detalhamento" && (
            <>
              <AssociateFilter variant="row" />
              <MultiFilter variant="row" filterKey="rubrica" />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Barra acima da lista: busca, chips removíveis dos filtros ativos e "Limpar filtros". Os filtros ficam nos menus
 * dos cabeçalhos das colunas; abaixo de `lg`, também no botão "Filtros". Em Movimentações (sem colunas Associado e
 * Rubrica) esses filtros só chegam por link, e aparecem como chip.
 */
export function EntryFilters({ view }: { view: EntryView }) {
  const { params, apply, pending } = useListParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = FILTER_KEYS.some((key) => params.get(key));
  const chips = useActiveFilters();

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  function onSearch(value: string) {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: value.trim() || null }), 350);
  }

  function clear() {
    setQ("");
    apply(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  }

  return (
    <section aria-label="Filtros" aria-busy={pending} className="flex flex-wrap items-center gap-1.5">
      <div className="relative min-w-48 flex-1 lg:max-w-sm">
        <IconSearch
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Buscar por histórico, descrição, associado ou ID OFX"
          className={cn("h-7 pl-7", q.trim() && "border-primary")}
          placeholder="Buscar histórico, descrição, associado ou ID OFX"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <FiltersDialog view={view} count={chips.length} />
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} title={chip.title} onRemove={() => apply(chip.clear)} />
      ))}
      {active && (
        <Button variant="ghost" onClick={clear}>
          <IconFilterOff data-icon="inline-start" /> Limpar filtros
        </Button>
      )}
      <div className="ml-auto max-md:hidden">
        <ColumnsMenu />
      </div>
    </section>
  );
}
