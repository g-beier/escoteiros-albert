"use client";

import { useActionState, useState } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { createAssociate, updateAssociate, type AssociateFormState } from "@/app/associados/actions";
import { OptionSelect } from "@/components/option-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { branchLabels, SCOUT_BRANCHES, type ScoutBranch } from "@/lib/associates";
import { useActionToast } from "@/lib/use-action-toast";
import { cn } from "@/lib/utils";

const initial: AssociateFormState = {};
const branchOptions = SCOUT_BRANCHES.map((value) => ({ value, label: branchLabels[value] }));

export function NewAssociate() {
  const [state, action, pending] = useActionState(createAssociate, initial);
  const [branch, setBranch] = useState("");
  useActionToast(state);
  return <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
    <div className="grid gap-1.5"><Label htmlFor="associate-name">Nome</Label><Input id="associate-name" name="name" maxLength={120} required /></div>
    <div className="grid gap-1.5"><Label htmlFor="associate-branch">Ramo</Label><OptionSelect id="associate-branch" value={branch} onValueChange={setBranch} options={branchOptions} /><input type="hidden" name="branch" value={branch} /></div>
    <div className="grid gap-1.5"><Label htmlFor="associate-section">Seção (opcional)</Label><Input id="associate-section" name="section" maxLength={60} placeholder="Ex.: Alcateia Seeonee" /></div>
    <Button type="submit" disabled={pending}><IconPlus /> {pending ? "Salvando…" : "Cadastrar"}</Button>
  </form>;
}

export type AssociateItem = { id: string; name: string; branch: ScoutBranch; section: string | null; active: boolean };

export function AssociateRow({ associate }: { associate: AssociateItem }) {
  const [state, save, saving] = useActionState(updateAssociate, initial);
  const [toggleState, toggle, toggling] = useActionState(updateAssociate, initial);
  useActionToast(state);
  useActionToast(toggleState);
  const [branch, setBranch] = useState<string>(associate.branch);
  const formId = `associate-${associate.id}`;
  return <TableRow className={cn(!associate.active && "text-muted-foreground")}>
    <TableCell className="px-3 py-1.5">
      <form id={formId} action={save}><input type="hidden" name="id" value={associate.id} /><input type="hidden" name="branch" value={branch} /></form>
      <Label className="sr-only" htmlFor={`${formId}-name`}>Nome</Label>
      <Input form={formId} id={`${formId}-name`} name="name" defaultValue={associate.name} maxLength={120} required />
    </TableCell>
    <TableCell className="px-3 py-1.5"><OptionSelect value={branch} onValueChange={setBranch} options={branchOptions} aria-label={`Ramo de ${associate.name}`} /></TableCell>
    <TableCell className="px-3 py-1.5"><Label className="sr-only" htmlFor={`${formId}-section`}>Seção</Label><Input form={formId} id={`${formId}-section`} name="section" defaultValue={associate.section ?? ""} maxLength={60} /></TableCell>
    <TableCell className="px-3 py-1.5"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", associate.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{associate.active ? "Ativo" : "Inativo"}</span></TableCell>
    <TableCell className="px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <Button form={formId} type="submit" variant="ghost" size="icon-sm" aria-label={`Salvar ${associate.name}`} disabled={saving}><IconCheck /></Button>
        <form action={toggle}><input type="hidden" name="id" value={associate.id} /><input type="hidden" name="active" value={String(!associate.active)} /><Button type="submit" variant="outline" size="sm" disabled={toggling}>{associate.active ? "Inativar" : "Reativar"}</Button></form>
      </div>
    </TableCell>
  </TableRow>;
}
