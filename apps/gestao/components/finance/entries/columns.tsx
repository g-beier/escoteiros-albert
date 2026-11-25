"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { IconColumns3 } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger,
} from "@geas/ui/components/dropdown-menu";
import { ENTRY_COLUMN_LABELS, VIEW_COLUMNS, columnsCookie, type EntryColumnId } from "@/lib/finance/entry-columns";
import type { EntryView } from "@/lib/finance/entry-rows";

type ColumnsApi = { view: EntryView; hidden: ReadonlySet<EntryColumnId>; toggle: (id: EntryColumnId, visible: boolean) => void };

const ColumnsContext = createContext<ColumnsApi | null>(null);

/** Colunas ocultas da visão: começam pelo cookie (lido no servidor) e mudam na hora, sem recarregar a lista. */
export function EntryColumnsProvider({ view, hidden, children }: { view: EntryView; hidden: EntryColumnId[]; children: ReactNode }) {
  const [current, setCurrent] = useState<ReadonlySet<EntryColumnId>>(() => new Set(hidden));
  function toggle(id: EntryColumnId, visible: boolean) {
    const next = new Set(current);
    if (visible) next.delete(id); else next.add(id);
    setCurrent(next);
    // um ano; só nas telas do Financeiro
    document.cookie = `${columnsCookie(view)}=${[...next].join(",")}; path=/financeiro; max-age=31536000; samesite=lax`;
  }
  return <ColumnsContext.Provider value={{ view, hidden: current, toggle }}>{children}</ColumnsContext.Provider>;
}

const ALL_VISIBLE: ReadonlySet<EntryColumnId> = new Set();

/** Colunas ocultas (fora do provider, nenhuma: as tabelas também servem a outras telas). */
export function useHiddenColumns(): ReadonlySet<EntryColumnId> {
  return useContext(ColumnsContext)?.hidden ?? ALL_VISIBLE;
}

/** Botão "Colunas" da linha de filtros: marca as colunas visíveis (Data, Histórico e Valor são fixas). */
export function ColumnsMenu() {
  const api = useContext(ColumnsContext);
  if (!api) return null;
  const hiddenCount = api.hidden.size;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="outline" className="h-7" />}>
      <IconColumns3 data-icon="inline-start" /> Colunas{hiddenCount > 0 && <span className="text-muted-foreground">({hiddenCount} {hiddenCount === 1 ? "oculta" : "ocultas"})</span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
        {VIEW_COLUMNS[api.view].map((id) => <DropdownMenuCheckboxItem key={id} checked={!api.hidden.has(id)}
          onCheckedChange={(checked) => api.toggle(id, checked === true)}>{ENTRY_COLUMN_LABELS[id]}</DropdownMenuCheckboxItem>)}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
