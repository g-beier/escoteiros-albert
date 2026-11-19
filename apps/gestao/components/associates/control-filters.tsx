"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconEye, IconEyeOff, IconSearch } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { cn } from "@geas/ui/lib/utils";
import { directorateLabels, DIRECTORATES, hiddenParam, type Directorate } from "@/lib/associates/controls";

/**
 * Filtros da matriz, na query string: q, pendencias=1, desligados=1 e ocultar (slugs das diretorias escondidas).
 * O público (publico=jovens|adultos) fica nas abas do cabeçalho. Toda mudança mantém os outros filtros.
 */
export function ControlFilters({ hidden }: { hidden: Directorate[] }) {
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

  const toggleHidden = (directorate: Directorate) =>
    apply({ ocultar: hiddenParam(hidden.includes(directorate) ? hidden.filter((d) => d !== directorate) : [...hidden, directorate]) || null });

  return <div className="grid gap-3">
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-48 flex-1">
        <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Buscar associado pelo nome" placeholder="Buscar associado" className={cn("pl-7", q.trim() && "border-primary")} value={q} onChange={(event) => onSearch(event.target.value)} />
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Checkbox id="filter-pending" checked={params.get("pendencias") === "1"} onCheckedChange={(checked) => apply({ pendencias: checked === true ? "1" : null })} />
        <Label htmlFor="filter-pending">Só pendências</Label>
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <Checkbox id="filter-inactive" checked={params.get("desligados") === "1"} onCheckedChange={(checked) => apply({ desligados: checked === true ? "1" : null })} />
        <Label htmlFor="filter-inactive">Incluir desligados</Label>
      </div>
    </div>
    <div role="group" aria-labelledby="filter-hide-label" className="flex flex-wrap items-center gap-1.5">
      <span id="filter-hide-label" className="mr-1 text-xs font-medium text-muted-foreground">Ocultar diretoria</span>
      {DIRECTORATES.map((directorate) => {
        const off = hidden.includes(directorate);
        return <Button key={directorate} type="button" size="sm" variant="outline" aria-pressed={off} onClick={() => toggleHidden(directorate)}
          className={cn("rounded-full", off && "border-dashed text-muted-foreground line-through")}>
          {off ? <IconEyeOff aria-hidden /> : <IconEye aria-hidden />}{directorateLabels[directorate]}
        </Button>;
      })}
    </div>
  </div>;
}
