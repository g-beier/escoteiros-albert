"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconColumns3, IconSearch, IconX } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger,
} from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { cn } from "@geas/ui/lib/utils";
import { COLUMNS_COOKIE, type ColumnId } from "@/lib/inventory/material-list";

const FILTER_KEYS = ["q", "familia", "alerta", "venda", "inativos", "estado", "unitario_de", "unitario_ate", "qtd_de", "qtd_ate"];

/**
 * Filtros gerais da lista de materiais, na query string: q, familia, alerta (mínimo/validade), venda (Lojinha), inativos. Estado, valor
 * unitário e quantidade se filtram no menu da própria coluna (ColumnMenu); o local (divisao) vem das abas. "Limpar
 * filtros" limpa todos. As colunas visíveis ficam num cookie.
 */
export function MaterialFilters({ families, columns, hidden }: {
  families: Option[];
  /** Colunas que o usuário pode mostrar ou ocultar (Material é fixa). */
  columns: { id: ColumnId; label: string }[];
  hidden: ColumnId[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const apply = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const onSearch = (value: string) => {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ q: value.trim() || null }), 300);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const [hiddenNow, setHiddenNow] = useState(new Set(hidden));
  const toggleColumn = (id: ColumnId, visible: boolean) => {
    const next = new Set(hiddenNow);
    if (visible) next.delete(id); else next.add(id);
    setHiddenNow(next);
    saveHiddenColumns([...next]);
    router.refresh();
  };

  const active = FILTER_KEYS.some((key) => params.get(key));
  const clear = () => {
    setQ("");
    apply(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  };

  return <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-48 flex-1">
        <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Buscar material por nome, descrição, família, observação ou etiqueta" placeholder="Buscar por nome, descrição, família, observação, etiqueta…" className={cn("pl-7", q.trim() && "border-primary")} value={q} onChange={(event) => onSearch(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-family">Família</Label>
        <OptionSelect id="filter-family" value={params.get("familia") ?? ""} onValueChange={(value) => apply({ familia: value || null })} options={families} emptyLabel="Todas" className="w-52" />
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Checkbox id="filter-alert" checked={params.get("alerta") === "1"} onCheckedChange={(checked) => apply({ alerta: checked === true ? "1" : null })} />
        <Label htmlFor="filter-alert">Só com alerta</Label>
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Checkbox id="filter-sale" checked={params.get("venda") === "1"} onCheckedChange={(checked) => apply({ venda: checked === true ? "1" : null })} />
        <Label htmlFor="filter-sale">Só à venda</Label>
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Checkbox id="filter-inactive" checked={params.get("inativos") === "1"} onCheckedChange={(checked) => apply({ inativos: checked === true ? "1" : null })} />
        <Label htmlFor="filter-inactive">Mostrar inativos</Label>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {active && <Button variant="ghost" onClick={clear}><IconX data-icon="inline-start" /> Limpar filtros</Button>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}><IconColumns3 data-icon="inline-start" /> Colunas</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
              {columns.map((column) => <DropdownMenuCheckboxItem key={column.id} checked={!hiddenNow.has(column.id)}
                onCheckedChange={(checked) => toggleColumn(column.id, checked)}>{column.label}</DropdownMenuCheckboxItem>)}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
  </div>;
}

/** Colunas ocultas num cookie de um ano, lido pela página no servidor (sem pulo ao carregar). */
function saveHiddenColumns(ids: ColumnId[]) {
  document.cookie = `${COLUMNS_COOKIE}=${ids.join(",")}; path=/inventario; max-age=31536000; samesite=lax`;
}
