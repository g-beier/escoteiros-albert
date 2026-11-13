"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { saveFamily, setFamilyActive } from "@/app/configuracoes/familias/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";

export type FamilyItem = { id: string; name: string; code: string | null; active: boolean; materials: number; tagged: number };

const initial: ActionResult = {};

export function FamiliesManager({ families, canManage }: { families: FamilyItem[]; canManage: boolean }) {
  const [editing, setEditing] = useState<FamilyItem | "new" | null>(null);
  return <SectionCard aria-labelledby="families-title">
    <SectionHeader title="Famílias" titleId="families-title" description="Agrupam materiais do mesmo tipo (todas as barracas, todos os fogareiros). O código de 3 dígitos entra na etiqueta: GEAS-001-0001.">
      <SectionCount>{families.filter((f) => f.active).length} ativas de {families.length}</SectionCount>
      {canManage && <Button onClick={() => setEditing("new")}><IconPlus /> Nova família</Button>}
    </SectionHeader>
    {families.length === 0
      ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma família cadastrada ainda.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[560px]">
        <TableCaption className="sr-only">Famílias de materiais</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD_CLASS, "w-24")}>Código</TableHead>
          <TableHead className={HEAD_CLASS}>Família</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28 text-right")}>Materiais</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28 text-right")} title="Peças com etiqueta">Etiquetadas</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-52")}>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>{families.map((family) => <FamilyRow key={family.id} family={family} canManage={canManage} onEdit={() => setEditing(family)} />)}</TableBody>
      </Table></div>}
    {canManage && <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="w-[min(30rem,calc(100%-2rem))]">
        {editing !== null && <FamilyForm key={editing === "new" ? "new" : editing.id} family={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>}
  </SectionCard>;
}

function FamilyRow({ family, canManage, onEdit }: { family: FamilyItem; canManage: boolean; onEdit: () => void }) {
  const [state, toggle, toggling] = useActionState(setFamilyActive, initial);
  useActionToast(state);
  return <TableRow className={cn(!family.active && "text-muted-foreground")}>
    <TableCell className={cn(CELL_CLASS, "num")}>{family.code ?? <span className="text-muted-foreground">—</span>}</TableCell>
    <TableCell className={CELL_CLASS}><Link href={`/materiais?familia=${family.id}`} className="font-medium hover:underline">{family.name}</Link></TableCell>
    <TableCell className={cn(CELL_CLASS, "num text-right")}>{family.materials}</TableCell>
    <TableCell className={cn(CELL_CLASS, "num text-right text-muted-foreground")}>{family.tagged}</TableCell>
    <TableCell className={CELL_CLASS}>
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", family.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{family.active ? "Ativa" : "Inativa"}</span>
        {canManage && <>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${family.name}`} onClick={onEdit}><IconPencil /></Button>
          <form action={toggle}>
            <input type="hidden" name="id" value={family.id} /><input type="hidden" name="active" value={String(!family.active)} />
            <Button type="submit" variant="outline" size="sm" disabled={toggling} aria-label={`${family.active ? "Inativar" : "Reativar"} ${family.name}`}>{family.active ? "Inativar" : "Reativar"}</Button>
          </form>
        </>}
      </div>
    </TableCell>
  </TableRow>;
}

function FamilyForm({ family, onDone }: { family: FamilyItem | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveFamily, initial);
  useActionToast(state);
  useEffect(() => { if (state.success) onDone(); }, [state, onDone]);
  const field = (id: string) => `family-${family?.id ?? "new"}-${id}`;
  return <form action={action} className="grid gap-3">
    <DialogHeader>
      <DialogTitle>{family ? `Editar ${family.name}` : "Nova família"}</DialogTitle>
      <DialogDescription>O código só é necessário quando as peças da família forem etiquetadas. Ele não muda depois que houver peças etiquetadas.</DialogDescription>
    </DialogHeader>
    {family && <input type="hidden" name="id" value={family.id} />}
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
      <div className="grid gap-1.5"><Label htmlFor={field("name")}>Nome</Label><Input id={field("name")} name="name" defaultValue={family?.name} minLength={2} maxLength={80} placeholder="Ex.: Barracas" required /></div>
      <div className="grid gap-1.5"><Label htmlFor={field("code")}>Código</Label>
        <Input id={field("code")} name="code" defaultValue={family?.code ?? ""} inputMode="numeric" pattern="[0-9]{3}" maxLength={3} placeholder="001" className="num" /></div>
    </div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : family ? "Salvar família" : "Cadastrar família"}</Button>
    </DialogFooter>
  </form>;
}
