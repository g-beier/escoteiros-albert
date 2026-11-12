"use client";

import { Fragment, useActionState, useState } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { createPatrol, createSection, updateSectionOrPatrol, type AssociateFormState } from "@/app/associados/actions";
import { OptionSelect } from "@/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchLabels, SCOUT_BRANCHES, type PatrolItem, type SectionItem } from "@/lib/associates";
import { useActionToast } from "@/lib/use-action-toast";
import { cn } from "@/lib/utils";

const initial: AssociateFormState = {};
const branchOptions = SCOUT_BRANCHES.map((value) => ({ value, label: branchLabels[value] }));
const headClass = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

/** Cadastro Ramo › Seção › Patrulha: seções por ramo, patrulhas (opcionais) dentro de cada seção. */
export function SectionsManager({ sections, patrols, counts }: {
  sections: SectionItem[]; patrols: PatrolItem[];
  /** Associados por seção e por patrulha (id → quantidade). */
  counts: Record<string, number>;
}) {
  const [state, action, pending] = useActionState(createSection, initial);
  const [branch, setBranch] = useState("");
  useActionToast(state);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true });
  const branches = SCOUT_BRANCHES.map((b) => ({ branch: b, sections: sections.filter((s) => s.branch === b).sort(byName) })).filter((g) => g.sections.length > 0);

  return <SectionCard aria-labelledby="sections-title">
    <SectionHeader title="Seções e patrulhas" titleId="sections-title"
      description="Ramo › Seção › Patrulha. Cada seção é de um ramo; patrulhas são opcionais e dividem a seção em equipes.">
      <SectionCount>{sections.filter((s) => s.active).length} {sections.filter((s) => s.active).length === 1 ? "seção ativa" : "seções ativas"}</SectionCount>
    </SectionHeader>
    <form action={action} className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
      <div className="grid gap-1.5"><Label htmlFor="section-branch">Ramo</Label>
        <OptionSelect id="section-branch" value={branch} onValueChange={setBranch} options={branchOptions} /><input type="hidden" name="branch" value={branch} /></div>
      <div className="grid gap-1.5"><Label htmlFor="section-name">Nova seção</Label>
        <Input id="section-name" name="name" maxLength={60} required minLength={2} placeholder="Ex.: Alcateia Seeonee" /></div>
      <Button type="submit" disabled={pending || !branch}><IconPlus /> Adicionar seção</Button>
    </form>
    {branches.length === 0
      ? <p className="m-0 px-6 py-8 text-center text-xs text-muted-foreground">Nenhuma seção cadastrada. Comece pelo ramo e o nome da seção.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[560px]">
        <TableCaption className="sr-only">Seções e patrulhas por ramo</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={headClass}>Nome</TableHead>
          <TableHead className={cn(headClass, "w-28 text-right")}>Associados</TableHead>
          <TableHead className={cn(headClass, "w-24")}>Status</TableHead>
          <TableHead className={cn(headClass, "w-36")}><span className="sr-only">Ações</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{branches.map((group) => <Fragment key={group.branch}>
          <TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead scope="colgroup" colSpan={4} className="h-7 px-3 text-xs font-semibold">{branchLabels[group.branch]}</TableHead></TableRow>
          {group.sections.map((section) => <Fragment key={section.id}>
            <NameRow kind="section" item={section} count={counts[section.id] ?? 0} />
            {patrols.filter((p) => p.sectionId === section.id).sort(byName).map((patrol) =>
              <NameRow key={patrol.id} kind="patrol" item={patrol} count={counts[patrol.id] ?? 0} sectionName={section.name} />)}
            {section.active && <NewPatrolRow section={section} />}
          </Fragment>)}
        </Fragment>)}</TableBody>
      </Table></div>}
  </SectionCard>;
}

/** Linha editável de seção ou patrulha: renomear (✓) e inativar/reativar. A coluna "Nome" é o rótulo visível. */
function NameRow({ kind, item, count, sectionName }: { kind: "section" | "patrol"; item: { id: string; name: string; active: boolean }; count: number; sectionName?: string }) {
  const [state, save, saving] = useActionState(updateSectionOrPatrol, initial);
  const [toggleState, toggle, toggling] = useActionState(updateSectionOrPatrol, initial);
  useActionToast(state);
  useActionToast(toggleState);
  const formId = `${kind}-${item.id}`;
  const label = kind === "section" ? `Nome da seção ${item.name}` : `Nome da patrulha ${item.name} (${sectionName})`;
  return <TableRow className={cn(!item.active && "text-muted-foreground")}>
    <TableCell className={cn("px-3 py-1.5", kind === "patrol" && "pl-10")}>
      <form id={formId} action={save}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={item.id} /></form>
      <div className="flex items-center gap-2">
        {kind === "patrol" && <span aria-hidden className="text-muted-foreground">›</span>}
        <Label className="sr-only" htmlFor={`${formId}-name`}>{label}</Label>
        <Input form={formId} id={`${formId}-name`} name="name" defaultValue={item.name} maxLength={60} required minLength={2} className={cn("max-w-80", kind === "section" && "font-medium")} />
      </div>
    </TableCell>
    <TableCell className="num px-3 py-1.5 text-right">{count}</TableCell>
    <TableCell className="px-3 py-1.5"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", item.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{item.active ? "Ativa" : "Inativa"}</span></TableCell>
    <TableCell className="px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <Button form={formId} type="submit" variant="ghost" size="icon-sm" aria-label={`Salvar ${item.name}`} disabled={saving}><IconCheck /></Button>
        <form action={toggle}>
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="name" value={item.name} />
          <input type="hidden" name="active" value={String(!item.active)} />
          <Button type="submit" variant="outline" size="sm" disabled={toggling}>{item.active ? "Inativar" : "Reativar"}</Button>
        </form>
      </div>
    </TableCell>
  </TableRow>;
}

/** Última linha de cada seção ativa: cadastrar uma patrulha nela. */
function NewPatrolRow({ section }: { section: SectionItem }) {
  const [state, action, pending] = useActionState(createPatrol, initial);
  useActionToast(state);
  const formId = `new-patrol-${section.id}`;
  return <TableRow className="hover:bg-transparent">
    <TableCell className="px-3 py-1.5 pl-10">
      <form id={formId} action={action}><input type="hidden" name="sectionId" value={section.id} /></form>
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-muted-foreground">+</span>
        <Label className="sr-only" htmlFor={`${formId}-name`}>Nova patrulha em {section.name}</Label>
        <Input form={formId} id={`${formId}-name`} name="name" maxLength={60} required minLength={2} placeholder="Nova patrulha (opcional), ex.: Patrulha Lobo" className="max-w-80" />
      </div>
    </TableCell>
    <TableCell colSpan={2} />
    <TableCell className="px-3 py-1.5"><Button form={formId} type="submit" variant="outline" size="sm" disabled={pending}><IconPlus /> Patrulha</Button></TableCell>
  </TableRow>;
}
