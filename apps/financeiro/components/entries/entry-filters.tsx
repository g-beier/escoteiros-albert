"use client";

import { useEffect, useRef, useState } from "react";
import { IconFilterOff, IconSearch, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_DATES, defaultFrom } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { useListParams } from "./filter-options";
import { MultiFilter } from "./multi-filter";

const FILTER_KEYS = ["de", "ate", "conta", "forma", "pasta", "conciliado", "associado", "rubrica", "q", "ofx"] as const;

export function EntryFilters() {
  const { params, apply, pending } = useListParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = FILTER_KEYS.some((key) => params.get(key));
  // sem "de" na URL, a lista começa em 1º de janeiro do ano atual; campo vazio = sem limite
  const yearStart = defaultFrom();
  const rawFrom = params.get("de");
  const fromValue = rawFrom === ALL_DATES ? "" : rawFrom ?? yearStart;
  const setFrom = (value: string) => apply({ de: !value ? ALL_DATES : value === yearStart ? null : value });

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  function onSearch(value: string) {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({ q: value.trim() || null }), 350);
  }

  function clear() {
    setQ("");
    apply(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
  }

  const dateClass = (key: string) => cn("h-7 w-[8.5rem] px-1.5", params.get(key) && "border-primary bg-accent/60");

  return <section aria-label="Filtros" aria-busy={pending} className="flex flex-wrap items-center gap-1.5">
    <div className="flex items-center gap-1">
      <Label htmlFor="filter-from" className="text-muted-foreground">De</Label>
      <Input id="filter-from" type="date" className={dateClass("de")} value={fromValue} onChange={(e) => setFrom(e.target.value)} title={rawFrom ? undefined : "Padrão: início do ano atual. Apague para ver todos os anos."} />
      <Label htmlFor="filter-to" className="text-muted-foreground">até</Label>
      <Input id="filter-to" type="date" className={dateClass("ate")} value={params.get("ate") ?? ""} onChange={(e) => apply({ ate: e.target.value || null })} />
    </div>
    <MultiFilter filterKey="conta" />
    <MultiFilter filterKey="forma" />
    <MultiFilter filterKey="pasta" />
    <MultiFilter filterKey="conciliado" />
    <MultiFilter filterKey="associado" />
    <MultiFilter filterKey="rubrica" />
    <div className="relative min-w-48 flex-1">
      <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label="Buscar por histórico, descrição ou ID OFX" className={cn("h-7 pl-7", q.trim() && "border-primary")} placeholder="Buscar histórico, descrição ou ID OFX" value={q} onChange={(e) => onSearch(e.target.value)} />
    </div>
    {params.get("ofx") && <Button variant="secondary" className="h-7 max-w-64" onClick={() => apply({ ofx: null })} title="Remover o filtro por ID OFX">
      <span className="truncate">ID OFX <span className="num">{params.get("ofx")}</span></span> <IconX />
    </Button>}
    {active && <Button variant="ghost" onClick={clear}><IconFilterOff /> Limpar filtros</Button>}
  </section>;
}
