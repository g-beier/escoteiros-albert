"use client";

import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { ALL_DATES, defaultFrom } from "@/lib/finance/filters";
import { dateBR } from "@/lib/format";
import { useListParams } from "./filter-options";
import type { DraftFilter } from "./sort-menu";

/** Resumo do período (De vazio = todos os anos). */
function periodSummary(from: string, to: string) {
  if (from && to) return `de ${dateBR(from)} até ${dateBR(to)}`;
  if (from) return `desde ${dateBR(from)}`;
  if (to) return `até ${dateBR(to)}`;
  return "todos os anos";
}

/**
 * Período da lista (`de`/`ate`) no menu da coluna Data. Sem `de` na URL a lista começa em 1º de janeiro do ano
 * atual (padrão, sem filtro aparente); De vazio grava `de=tudo` (todos os anos).
 */
export function usePeriodFilter(): DraftFilter {
  const { params } = useListParams();
  const yearStart = defaultFrom();
  const rawFrom = params.get("de");
  const from = rawFrom === ALL_DATES ? "" : rawFrom ?? yearStart;
  const to = params.get("ate") ?? "";
  const active = Boolean((rawFrom && rawFrom !== yearStart) || to);
  return {
    title: "Período",
    summary: active ? periodSummary(from, to) : null,
    initial: () => ({ from, to }),
    invalid: (draftFrom, draftTo) => draftFrom && draftTo && draftFrom > draftTo ? "O fim é antes do início." : null,
    changes: (draftFrom, draftTo, clear) => clear
      ? { de: null, ate: null }
      : { de: !draftFrom ? ALL_DATES : draftFrom === yearStart ? null : draftFrom, ate: draftTo || null },
    fields: ({ from: draftFrom, to: draftTo, setFrom, setTo, onEnter }) => <div className="grid grid-cols-2 items-start gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor="period-from">De</Label>
        <Input id="period-from" type="date" className="num" value={draftFrom} onChange={(event) => setFrom(event.target.value)} onKeyDown={onEnter} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="period-to">Até</Label>
        <Input id="period-to" type="date" className="num" value={draftTo} onChange={(event) => setTo(event.target.value)} onKeyDown={onEnter} />
      </div>
    </div>,
    hint: "Sem filtro, a lista começa em 1º de janeiro deste ano. Deixe De vazio para ver todos os anos.",
  };
}
