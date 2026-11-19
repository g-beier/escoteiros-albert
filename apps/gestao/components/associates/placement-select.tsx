"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geas/ui/components/select";
import { cn } from "@geas/ui/lib/utils";
import { placementOptions, placementValue, resolvePlacement, type PatrolItem, type Placement, type SectionItem } from "@/lib/associates/model";

export type Catalog = { sections: SectionItem[]; patrols: PatrolItem[] };

export const EMPTY_PLACEMENT: Placement = { branch: "", sectionId: "", patrolId: "" };

/**
 * Divisão numa seleção só, em hierarquia: Ramo › Seção › Equipe. Escolher a equipe define a seção e o ramo;
 * escolher a seção define o ramo. Adulto é só o ramo; seções do Pioneiro não têm equipes.
 */
export function PlacementSelect({ id, catalog, value, current, onValueChange, className }: {
  id: string; catalog: Catalog; value: Placement; current?: Placement; onValueChange: (value: Placement) => void; className?: string;
}) {
  const options = placementOptions(catalog.sections, catalog.patrols, current);
  const selected = placementValue(value);
  return <Select items={options} value={selected || null} onValueChange={(next) => onValueChange(resolvePlacement((next as string | null) ?? "", catalog.sections, catalog.patrols))}>
    <SelectTrigger id={id} className={cn("w-full min-w-48", className)}>
      <SelectValue className="block min-w-0 truncate" placeholder="Selecione…" />
    </SelectTrigger>
    <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width)">
      {options.map((option) => <SelectItem key={option.value} value={option.value}
        className={cn(option.depth === 0 && "font-semibold", option.depth === 1 && "pl-5", option.depth === 2 && "pl-8 text-muted-foreground")}>
        {option.name}
      </SelectItem>)}
    </SelectContent>
  </Select>;
}

/** Campos escondidos que o servidor espera (ramo, seção e equipe). */
export function PlacementFields({ value }: { value: Placement }) {
  return <>
    <input type="hidden" name="branch" value={value.branch} />
    <input type="hidden" name="sectionId" value={value.sectionId} />
    <input type="hidden" name="patrolId" value={value.patrolId} />
  </>;
}
