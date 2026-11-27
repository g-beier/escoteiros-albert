"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { cn } from "@geas/ui/lib/utils";
import { STATUS_FILTERS, STATUS_LABELS, statusFilter } from "@/lib/associates/model";

const statusOptions = STATUS_FILTERS.map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Filtros da lista, na query string: q (nome) e situacao (ativos, padrão; desligados; todos). O ramo vem das abas. */
export function AssociateFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const apply = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes))
      if (value) next.set(key, value);
      else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const onSearch = (value: string) => {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ q: value.trim() || null }), 300);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-48 flex-1">
        <IconSearch
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Buscar associado pelo nome"
          placeholder="Buscar associado"
          className={cn("pl-7", q.trim() && "border-primary")}
          value={q}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-status">Situação</Label>
        <OptionSelect
          id="filter-status"
          value={statusFilter(params.get("situacao") ?? undefined)}
          options={statusOptions}
          className="w-40"
          onValueChange={(value) => apply({ situacao: value === "ativos" ? null : value })}
        />
      </div>
    </div>
  );
}
