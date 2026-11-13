"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { cn } from "@geas/ui/lib/utils";

/** Filtros da lista de materiais, na query string: q, familia, alerta (mínimo/validade), inativos. O local (divisao/todos) vem das abas. */
export function MaterialFilters({ families }: { families: Option[] }) {
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

  return <div className="flex flex-wrap items-end gap-3">
    <div className="relative min-w-48 flex-1">
      <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label="Buscar material pelo nome" placeholder="Buscar material" className={cn("pl-7", q.trim() && "border-primary")} value={q} onChange={(event) => onSearch(event.target.value)} />
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
      <Checkbox id="filter-inactive" checked={params.get("inativos") === "1"} onCheckedChange={(checked) => apply({ inativos: checked === true ? "1" : null })} />
      <Label htmlFor="filter-inactive">Mostrar inativos</Label>
    </div>
  </div>;
}
