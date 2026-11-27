"use client";

import { useMemo, useState } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@geas/ui/components/popover";
import { Separator } from "@geas/ui/components/separator";
import { cn } from "@geas/ui/lib/utils";
import { decodeCategorySelection, descendantsMap, encodeCategorySelection } from "@/lib/finance/categories";
import { DIVISION_PARAM, NO_ASSOCIATE } from "@/lib/finance/filters";
import type { DivisionNode } from "@/lib/finance/associate-filter";
import { useAssociateOptions, useListParams } from "./filter-options";
import { TriggerContent, triggerElement, type FilterVariant } from "./filter-trigger";

const NAME_PARAM = "associado";
/** Quantos nomes a busca mostra de uma vez. */
const MAX_RESULTS = 40;

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const list = (labels: string[], plural: string) =>
  labels.length <= 2 ? labels.join(", ") : `${labels.length} ${plural}`;

/** Divisões, pessoas e mapas derivados (pais → descendentes, id → rótulo). */
function useAssociateData() {
  const data = useAssociateOptions();
  return useMemo(
    () => ({
      ...data,
      descendants: descendantsMap(data.divisions),
      divisionLabel: new Map(data.divisions.map((node) => [node.id, node.label])),
      person: new Map(data.people.map((person) => [person.id, person])),
    }),
    [data],
  );
}

/** Recorte aplicado (URL): nomes (`associado`, com o `nenhum` antigo) e divisões marcadas (`divisao`, expandidas). */
function useAppliedSelection(data: ReturnType<typeof useAssociateData>) {
  const { values } = useListParams();
  const raw = values(NAME_PARAM);
  const names = raw.filter((id) => data.person.has(id));
  const divisions = decodeCategorySelection(values(DIVISION_PARAM), data.divisions);
  if (raw.includes(NO_ASSOCIATE) && !divisions.includes(NO_ASSOCIATE)) divisions.unshift(NO_ASSOCIATE);
  return { names, divisions };
}

/** Resumos do filtro de associado aplicado: por nome e por divisão (cada um null quando não há). */
export function useAssociateSummary() {
  const data = useAssociateData();
  const { values } = useListParams();
  const names = values(NAME_PARAM).flatMap((id) =>
    id === NO_ASSOCIATE ? ["(Sem associado)"] : (data.person.get(id)?.name ?? []),
  );
  const divisions = decodeCategorySelection(values(DIVISION_PARAM), data.divisions);
  const covered = new Set(divisions.flatMap((id) => data.descendants[id] ?? []));
  const top = divisions.filter((id) => !covered.has(id)).map((id) => data.divisionLabel.get(id) ?? id);
  return {
    names: names.length ? list(names, "associados") : null,
    divisions: top.length ? list(top, "divisões") : null,
  };
}

/**
 * Menu da coluna Associado, em dois recortes exclusivos: por nome (busca com caixas de marcar, ativos e inativos)
 * ou por divisão (Ramo › Seção › Equipe, com estado parcial). Marcar um nome limpa as divisões do rascunho e
 * vice-versa; Aplicar grava só um dos parâmetros (`associado` ou `divisao`).
 */
export function AssociateFilter({
  variant = "head",
  label = "Associado",
  align = "start",
}: {
  variant?: FilterVariant;
  label?: string;
  align?: "start" | "end";
}) {
  const data = useAssociateData();
  const { params, apply } = useListParams();
  const applied = useAppliedSelection(data);
  const summary = useAssociateSummary();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const active = Boolean(params.get(NAME_PARAM) || params.get(DIVISION_PARAM));

  function onOpenChange(next: boolean) {
    if (next) {
      setSearch("");
      setNames(applied.names);
      setChecked(new Set(applied.names.length ? [] : applied.divisions));
    }
    setOpen(next);
  }

  const results = useMemo(() => {
    const words = normalize(search).split(/\s+/).filter(Boolean);
    return words.length
      ? data.people.filter((person) => words.every((word) => normalize(person.name).includes(word)))
      : [];
  }, [data.people, search]);

  function toggleName(id: string) {
    setNames((current) => (current.includes(id) ? current.filter((name) => name !== id) : [...current, id]));
    setChecked(new Set());
  }

  const group = (id: string) => [id, ...(data.descendants[id] ?? [])];
  const stateOf = (node: DivisionNode): boolean | "partial" => {
    const items = group(node.id);
    const count = items.filter((id) => checked.has(id)).length;
    return count === items.length ? true : count === 0 ? false : "partial";
  };
  function toggleDivision(node: DivisionNode) {
    const turnOn = stateOf(node) !== true;
    setChecked((current) => {
      const next = new Set(current);
      group(node.id).forEach((id) => (turnOn ? next.add(id) : next.delete(id)));
      return next;
    });
    setNames([]);
  }

  function submit() {
    const selected = data.divisions.map((node) => node.id).filter((id) => checked.has(id));
    apply({
      [NAME_PARAM]: names.length ? names.join(",") : null,
      [DIVISION_PARAM]:
        !names.length && selected.length ? encodeCategorySelection(selected, data.divisions).join(",") : null,
    });
    setOpen(false);
  }
  const clear = () => {
    apply({ [NAME_PARAM]: null, [DIVISION_PARAM]: null });
    setOpen(false);
  };

  const trigger = { variant, label, summary: summary.names ?? summary.divisions };
  const row = "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={triggerElement(trigger)}>
        <TriggerContent {...trigger} />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 gap-0 p-0 text-sm font-normal tracking-normal normal-case">
        <div className="border-b px-3 py-2 text-sm font-semibold text-foreground">{label}</div>
        <div className="flex flex-col gap-2 p-3 pb-2">
          <div className="relative">
            <IconSearch
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              type="search"
              aria-label="Buscar associado pelo nome"
              placeholder="Buscar associado…"
              className="pl-7"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {!search.trim() && names.length > 0 && (
            <div className="flex flex-wrap items-center gap-1" aria-label="Associados selecionados" role="group">
              <span className="text-xs text-muted-foreground">Selecionados:</span>
              {names.map((id) => (
                <Button
                  key={id}
                  variant="secondary"
                  size="sm"
                  onClick={() => toggleName(id)}
                  aria-label={`Remover ${data.person.get(id)?.name ?? id}`}
                >
                  <span className="max-w-40 truncate">{data.person.get(id)?.name ?? id}</span>{" "}
                  <IconX data-icon="inline-end" />
                </Button>
              ))}
            </div>
          )}
        </div>
        {search.trim() ? (
          <ul className="max-h-72 overflow-y-auto px-1.5 pb-1.5" aria-label="Associados encontrados">
            {results.slice(0, MAX_RESULTS).map((person) => (
              <li key={person.id}>
                <label className={row}>
                  <Checkbox checked={names.includes(person.id)} onCheckedChange={() => toggleName(person.id)} />
                  <span className="truncate">
                    {person.name}
                    {!person.active && <span className="text-muted-foreground"> (inativo)</span>}
                  </span>
                </label>
              </li>
            ))}
            {results.length > MAX_RESULTS && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">
                Mais {results.length - MAX_RESULTS}; continue digitando para achar.
              </li>
            )}
            {!results.length && <li className="px-2 py-3 text-center text-muted-foreground">Ninguém encontrado.</li>}
          </ul>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 pb-1 text-xs text-muted-foreground">
              <Separator className="flex-1" /> ou por divisão <Separator className="flex-1" />
            </div>
            <ul className="max-h-64 overflow-y-auto px-1.5 pb-1.5" aria-label="Divisões">
              {data.divisions.map((node) => {
                const state = stateOf(node);
                return (
                  <li key={node.id}>
                    <label className={row} style={{ paddingLeft: `${0.375 + node.depth * 0.875}rem` }}>
                      <Checkbox
                        checked={state === true}
                        indeterminate={state === "partial"}
                        onCheckedChange={() => toggleDivision(node)}
                      />
                      <span
                        className={cn(
                          "truncate",
                          node.depth === 0 && data.descendants[node.id]?.length && "font-semibold",
                        )}
                      >
                        {node.label}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
          {active && (
            <button
              type="button"
              className="mr-auto text-xs font-semibold text-primary hover:underline"
              onClick={clear}
            >
              Remover filtro
            </button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
