"use client";

import { useActionState, useState } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { createAssociate, updateAssociate, type AssociateFormState } from "@/app/configuracoes/associados/actions";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geas/ui/components/select";
import { TableCell, TableRow } from "@geas/ui/components/table";
import { placementOptions, placementValue, resolvePlacement, type PatrolItem, type Placement, type ScoutBranch, type SectionItem } from "@/lib/associates";
import { useActionToast } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";

const initial: AssociateFormState = {};

type Catalog = { sections: SectionItem[]; patrols: PatrolItem[] };

/**
 * Divisão numa seleção só, em hierarquia: Ramo › Seção › Equipe. Escolher a equipe define a seção e o ramo;
 * escolher a seção define o ramo. Adulto é só o ramo; seções do Pioneiro não têm equipes.
 */
function PlacementSelect({ id, catalog, value, current, onValueChange, className, "aria-label": ariaLabel }: {
  id: string; catalog: Catalog; value: Placement; current?: Placement; onValueChange: (value: Placement) => void; className?: string; "aria-label"?: string;
}) {
  const options = placementOptions(catalog.sections, catalog.patrols, current);
  const selected = placementValue(value);
  return <Select items={options} value={selected || null} onValueChange={(next) => onValueChange(resolvePlacement((next as string | null) ?? "", catalog.sections, catalog.patrols))}>
    <SelectTrigger id={id} aria-label={ariaLabel} className={cn("w-full min-w-48", className)}>
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
function PlacementFields({ value, form }: { value: Placement; form?: string }) {
  return <>
    <input type="hidden" form={form} name="branch" value={value.branch} />
    <input type="hidden" form={form} name="sectionId" value={value.sectionId} />
    <input type="hidden" form={form} name="patrolId" value={value.patrolId} />
  </>;
}

const EMPTY: Placement = { branch: "", sectionId: "", patrolId: "" };

export function NewAssociate(catalog: Catalog) {
  const [state, action, pending] = useActionState(createAssociate, initial);
  const [place, setPlace] = useState<Placement>(EMPTY);
  useActionToast(state);
  return <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
    <div className="grid gap-1.5"><Label htmlFor="associate-name">Nome</Label><Input id="associate-name" name="name" maxLength={120} required /></div>
    <div className="grid gap-1.5"><Label htmlFor="associate-placement">Divisão</Label>
      <PlacementSelect id="associate-placement" catalog={catalog} value={place} onValueChange={setPlace} /><PlacementFields value={place} /></div>
    <Button type="submit" disabled={pending || !place.branch}><IconPlus /> {pending ? "Salvando…" : "Cadastrar"}</Button>
  </form>;
}

export type AssociateItem = { id: string; name: string; branch: ScoutBranch; section_id: string | null; section: string | null; patrol_id: string | null; patrol: string | null; active: boolean };

export function AssociateRow({ associate, catalog }: { associate: AssociateItem; catalog: Catalog }) {
  const [state, save, saving] = useActionState(updateAssociate, initial);
  const [toggleState, toggle, toggling] = useActionState(updateAssociate, initial);
  useActionToast(state);
  useActionToast(toggleState);
  const current: Placement = { branch: associate.branch, sectionId: associate.section_id ?? "", patrolId: associate.patrol_id ?? "" };
  const [place, setPlace] = useState<Placement>(current);
  const formId = `associate-${associate.id}`;
  return <TableRow className={cn(!associate.active && "text-muted-foreground")}>
    <TableCell className="px-3 py-1">
      <form id={formId} action={save}><input type="hidden" name="id" value={associate.id} /></form>
      <PlacementFields value={place} form={formId} />
      <Label className="sr-only" htmlFor={`${formId}-name`}>Nome</Label>
      <Input form={formId} id={`${formId}-name`} name="name" defaultValue={associate.name} maxLength={120} required />
    </TableCell>
    <TableCell className="px-3 py-1"><Label className="sr-only" htmlFor={`${formId}-placement`}>Divisão de {associate.name}</Label>
      <PlacementSelect id={`${formId}-placement`} catalog={catalog} value={place} current={current} onValueChange={setPlace} /></TableCell>
    <TableCell className="px-3 py-1"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", associate.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{associate.active ? "Ativo" : "Inativo"}</span></TableCell>
    <TableCell className="px-3 py-1">
      <div className="flex items-center gap-1.5">
        <Button form={formId} type="submit" variant="ghost" size="icon-sm" aria-label={`Salvar ${associate.name}`} disabled={saving}><IconCheck /></Button>
        <form action={toggle}><input type="hidden" name="id" value={associate.id} /><input type="hidden" name="active" value={String(!associate.active)} /><Button type="submit" variant="outline" size="sm" disabled={toggling}>{associate.active ? "Inativar" : "Reativar"}</Button></form>
      </div>
    </TableCell>
  </TableRow>;
}
