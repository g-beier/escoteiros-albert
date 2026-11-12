"use client";

import { useActionState, useState } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { createAssociate, updateAssociate, type AssociateFormState } from "@/app/associados/actions";
import { OptionSelect } from "@/components/option-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { branchLabels, defaultSectionFor, patrolChoices, SCOUT_BRANCHES, sectionChoices, type PatrolItem, type ScoutBranch, type SectionItem } from "@/lib/associates";
import { useActionToast } from "@/lib/use-action-toast";
import { cn } from "@/lib/utils";

const initial: AssociateFormState = {};
const branchOptions = SCOUT_BRANCHES.map((value) => ({ value, label: branchLabels[value] }));

type Catalog = { sections: SectionItem[]; patrols: PatrolItem[] };

/** Ramo › Seção › Patrulha: a seção depende do ramo (pré-selecionada se o ramo tem uma só) e a patrulha, da seção. */
function usePlacement({ sections }: Catalog, initialBranch: string, initialSection = "", initialPatrol = "") {
  const [branch, setBranchState] = useState(initialBranch);
  const [section, setSectionState] = useState(initialSection);
  const [patrol, setPatrol] = useState(initialPatrol);
  const setBranch = (value: string) => { setBranchState(value); setSectionState(defaultSectionFor(sections, value)); setPatrol(""); };
  const setSection = (value: string) => { setSectionState(value); setPatrol(""); };
  return { branch, setBranch, section, setSection, patrol, setPatrol };
}

function SectionSelect({ id, catalog, branch, value, current, onValueChange, ...aria }: { id?: string; catalog: Catalog; branch: string; value: string; current?: string | null; onValueChange: (value: string) => void; "aria-label"?: string }) {
  const options = sectionChoices(catalog.sections, branch, current).map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} (inativa)` }));
  return <OptionSelect id={id} value={value} onValueChange={onValueChange} options={options} emptyLabel={branch && !options.length ? "Nenhuma no ramo" : "Sem seção"} disabled={!branch || !options.length} {...aria} />;
}

function PatrolSelect({ id, catalog, section, value, current, onValueChange, ...aria }: { id?: string; catalog: Catalog; section: string; value: string; current?: string | null; onValueChange: (value: string) => void; "aria-label"?: string }) {
  const options = patrolChoices(catalog.patrols, section, current).map((p) => ({ value: p.id, label: p.active ? p.name : `${p.name} (inativa)` }));
  return <OptionSelect id={id} value={value} onValueChange={onValueChange} options={options} emptyLabel="Sem patrulha" disabled={!options.length} {...aria} />;
}

export function NewAssociate(catalog: Catalog) {
  const [state, action, pending] = useActionState(createAssociate, initial);
  const place = usePlacement(catalog, "");
  useActionToast(state);
  return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
    <div className="grid gap-1.5"><Label htmlFor="associate-name">Nome</Label><Input id="associate-name" name="name" maxLength={120} required /></div>
    <div className="grid gap-1.5"><Label htmlFor="associate-branch">Ramo</Label><OptionSelect id="associate-branch" value={place.branch} onValueChange={place.setBranch} options={branchOptions} /><input type="hidden" name="branch" value={place.branch} /></div>
    <div className="grid gap-1.5"><Label htmlFor="associate-section">Seção</Label><SectionSelect id="associate-section" catalog={catalog} branch={place.branch} value={place.section} onValueChange={place.setSection} /><input type="hidden" name="sectionId" value={place.section} /></div>
    <div className="grid gap-1.5"><Label htmlFor="associate-patrol">Patrulha (opcional)</Label><PatrolSelect id="associate-patrol" catalog={catalog} section={place.section} value={place.patrol} onValueChange={place.setPatrol} /><input type="hidden" name="patrolId" value={place.patrol} /></div>
    <Button type="submit" disabled={pending}><IconPlus /> {pending ? "Salvando…" : "Cadastrar"}</Button>
  </form>;
}

export type AssociateItem = { id: string; name: string; branch: ScoutBranch; section_id: string | null; section: string | null; patrol_id: string | null; patrol: string | null; active: boolean };

export function AssociateRow({ associate, catalog }: { associate: AssociateItem; catalog: Catalog }) {
  const [state, save, saving] = useActionState(updateAssociate, initial);
  const [toggleState, toggle, toggling] = useActionState(updateAssociate, initial);
  useActionToast(state);
  useActionToast(toggleState);
  const place = usePlacement(catalog, associate.branch, associate.section_id ?? "", associate.patrol_id ?? "");
  const formId = `associate-${associate.id}`;
  return <TableRow className={cn(!associate.active && "text-muted-foreground")}>
    <TableCell className="px-3 py-1.5">
      <form id={formId} action={save}><input type="hidden" name="id" value={associate.id} /><input type="hidden" name="branch" value={place.branch} /><input type="hidden" name="sectionId" value={place.section} /><input type="hidden" name="patrolId" value={place.patrol} /></form>
      <Label className="sr-only" htmlFor={`${formId}-name`}>Nome</Label>
      <Input form={formId} id={`${formId}-name`} name="name" defaultValue={associate.name} maxLength={120} required />
    </TableCell>
    <TableCell className="px-3 py-1.5"><Label className="sr-only" htmlFor={`${formId}-branch`}>Ramo de {associate.name}</Label><OptionSelect id={`${formId}-branch`} value={place.branch} onValueChange={place.setBranch} options={branchOptions} /></TableCell>
    <TableCell className="px-3 py-1.5"><Label className="sr-only" htmlFor={`${formId}-section`}>Seção de {associate.name}</Label>
      <SectionSelect id={`${formId}-section`} catalog={catalog} branch={place.branch} value={place.section} current={associate.section_id} onValueChange={place.setSection} /></TableCell>
    <TableCell className="px-3 py-1.5"><Label className="sr-only" htmlFor={`${formId}-patrol`}>Patrulha de {associate.name}</Label>
      <PatrolSelect id={`${formId}-patrol`} catalog={catalog} section={place.section} value={place.patrol} current={associate.patrol_id} onValueChange={place.setPatrol} /></TableCell>
    <TableCell className="px-3 py-1.5"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", associate.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{associate.active ? "Ativo" : "Inativo"}</span></TableCell>
    <TableCell className="px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <Button form={formId} type="submit" variant="ghost" size="icon-sm" aria-label={`Salvar ${associate.name}`} disabled={saving}><IconCheck /></Button>
        <form action={toggle}><input type="hidden" name="id" value={associate.id} /><input type="hidden" name="active" value={String(!associate.active)} /><Button type="submit" variant="outline" size="sm" disabled={toggling}>{associate.active ? "Inativar" : "Reativar"}</Button></form>
      </div>
    </TableCell>
  </TableRow>;
}
