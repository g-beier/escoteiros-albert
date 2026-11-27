"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@geas/ui/components/popover";
import { decodeCategorySelection, encodeCategorySelection } from "@/lib/finance/categories";
import { cn } from "@geas/ui/lib/utils";
import { useDimension, useListParams, type FilterKey, type FilterOption } from "./filter-options";
import { SortSection, useEntrySort, type ColumnSort } from "./sort-menu";
import { TriggerContent, triggerElement, type FilterVariant } from "./filter-trigger";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Itens marcados que não estão cobertos por um item pai também marcado (para o resumo). */
function topLevel(selected: string[], descendants: Record<string, string[]> | undefined) {
  if (!descendants) return selected;
  const covered = new Set(selected.flatMap((value) => descendants[value] ?? []));
  return selected.filter((value) => !covered.has(value));
}

/** Valores marcados na URL; nas listas hierárquicas, a seção compacta é expandida. */
function useSelected(key: FilterKey) {
  const dimension = useDimension(key);
  const { values } = useListParams();
  return () => {
    const raw = values(key);
    const expanded = dimension.hierarchy ? decodeCategorySelection(raw, dimension.hierarchy) : raw;
    return expanded.filter((v) => dimension.options.some((o) => o.value === v));
  };
}

/** Resumo do filtro para o rótulo do botão, ou null quando não há filtro. */
export function useFilterSummary(key: FilterKey) {
  const dimension = useDimension(key);
  const selected = useSelected(key)();
  if (!selected.length) return null;
  const labels = topLevel(selected, dimension.descendants).map(
    (v) => dimension.options.find((o) => o.value === v)?.label ?? v,
  );
  return labels.length <= 2 ? labels.join(", ") : `${selected.length} de ${dimension.options.length}`;
}

/**
 * Filtro por valores com seleção múltipla. Sem filtro, tudo aparece marcado (como na planilha);
 * desmarcar exclui. Aplicar com tudo marcado remove o filtro.
 * `variant="head"`: cabeçalho de coluna, igual ao menu de coluna dos Materiais (rótulo, indicador de filtro e seta).
 */
export function MultiFilter({
  filterKey,
  variant = "button",
  label,
  align = "start",
  sort,
}: {
  filterKey: FilterKey;
  variant?: FilterVariant;
  label?: string;
  align?: "start" | "end";
  sort?: ColumnSort;
}) {
  const dimension = useDimension(filterKey);
  const { apply } = useListParams();
  const selectedNow = useSelected(filterKey);
  const summary = useFilterSummary(filterKey);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const all = useMemo(() => dimension.options.map((o) => o.value), [dimension.options]);
  const order = useEntrySort(sort?.key ?? "data");
  const sorted = Boolean(sort) && order.sorted;

  function onOpenChange(next: boolean) {
    if (next) {
      const current = selectedNow();
      setChecked(new Set(current.length ? current : all));
      setSearch("");
    }
    setOpen(next);
  }

  const visible = useMemo(() => {
    const term = normalize(search.trim());
    return term ? dimension.options.filter((o) => normalize(o.label).includes(term)) : dimension.options;
  }, [dimension.options, search]);

  const group = (value: string) => [value, ...(dimension.descendants?.[value] ?? [])];
  const stateOf = (option: FilterOption): boolean | "partial" => {
    const items = group(option.value);
    const count = items.filter((v) => checked.has(v)).length;
    return count === items.length ? true : count === 0 ? false : "partial";
  };
  function toggle(option: FilterOption) {
    const items = group(option.value);
    const turnOn = stateOf(option) !== true;
    setChecked((current) => {
      const next = new Set(current);
      items.forEach((v) => (turnOn ? next.add(v) : next.delete(v)));
      return next;
    });
  }
  const setVisible = (on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      visible.forEach((o) => (on ? next.add(o.value) : next.delete(o.value)));
      return next;
    });

  function submit() {
    const selected = all.filter((v) => checked.has(v));
    const encoded = dimension.hierarchy ? encodeCategorySelection(selected, dimension.hierarchy) : selected;
    apply({ [filterKey]: selected.length === all.length ? null : encoded.join(",") });
    setOpen(false);
  }

  const trigger = {
    variant,
    label: variant === "head" ? (label ?? dimension.label) : dimension.label,
    summary,
    sorted,
    dir: order.dir,
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={triggerElement(trigger)}>
        <TriggerContent {...trigger} />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 gap-0 p-0 text-sm font-normal tracking-normal normal-case">
        {sort && (
          <>
            <div className="border-b px-3 py-2 text-sm font-semibold text-foreground">{label ?? dimension.label}</div>
            <div className="border-b">
              <SortSection
                labels={sort.labels}
                sorted={sorted}
                dir={order.dir}
                onSort={(next) => {
                  order.sortBy(next);
                  setOpen(false);
                }}
              />
            </div>
          </>
        )}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Filtrar {dimension.label.toLowerCase()}</span>
          <span className="num text-xs text-muted-foreground">
            {checked.size} de {all.length}
          </span>
        </div>
        <div className="grid gap-2 p-3 pb-2">
          {dimension.options.length > 6 && (
            <div className="relative">
              <IconSearch
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                autoFocus
                type="search"
                aria-label={`Buscar em ${dimension.label}`}
                placeholder="Buscar"
                className="pl-7"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => setVisible(true)}
            >
              Selecionar {search ? "visíveis" : "tudo"}
            </button>
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => setVisible(false)}
            >
              Limpar
            </button>
          </div>
          {dimension.shortcuts?.some((shortcut) => shortcut.values.length) && (
            <div className="flex flex-wrap gap-1">
              {dimension.shortcuts
                .filter((shortcut) => shortcut.values.length)
                .map((shortcut) => (
                  <button
                    key={shortcut.label}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                    onClick={() => {
                      setSearch("");
                      setChecked(new Set(shortcut.values));
                    }}
                  >
                    {shortcut.label}
                  </button>
                ))}
            </div>
          )}
        </div>
        <ul className="max-h-72 overflow-y-auto px-1.5 pb-1.5" aria-label={dimension.label}>
          {visible.map((option) => {
            const state = stateOf(option);
            return (
              <li key={option.value}>
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted"
                  style={{ paddingLeft: `${0.375 + (search ? 0 : (option.depth ?? 0)) * 0.875}rem` }}
                >
                  <Checkbox
                    checked={state === true}
                    indeterminate={state === "partial"}
                    onCheckedChange={() => toggle(option)}
                  />
                  <span
                    className={cn(
                      "truncate",
                      option.tone === "receita" && "text-success",
                      option.tone === "despesa" && "text-destructive",
                      (option.depth ?? 0) === 0 && dimension.descendants && "font-semibold",
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              </li>
            );
          })}
          {!visible.length && <li className="px-2 py-3 text-center text-muted-foreground">Nada encontrado.</li>}
        </ul>
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          {checked.size === 0 && <span className="mr-auto text-xs text-destructive">Marque ao menos um item.</span>}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={checked.size === 0}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
