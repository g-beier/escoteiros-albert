"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { IconArrowDown, IconArrowUp, IconPencil, IconPlus } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { moveLocation, saveLocation, setLocationActive } from "@/app/configuracoes/divisoes/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";

export type LocationItem = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  path: string;
  depth: number;
  ancestors: string[];
  active: boolean;
  /** Lotes com saldo e peças ativas nesta divisão. */
  own: number;
  /** O mesmo, somando as subdivisões. */
  total: number;
  /** Primeira/última entre as irmãs (sem seta para subir/descer). */
  first: boolean;
  last: boolean;
};

const initial: ActionResult = {};
type Editing = { location: LocationItem | null; parentId: string | null };

/** Árvore de divisões na ordem escolhida pelo gestor (setas sobem/descem entre as irmãs); a indentação mostra o nível. */
export function LocationsManager({ locations, canManage }: { locations: LocationItem[]; canManage: boolean }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const active = locations.filter((location) => location.active).length;
  return <SectionCard aria-labelledby="locations-title">
    <SectionHeader title="Divisões" titleId="locations-title" description="Onde o material fica guardado, em árvore: Diretoria › Armário de ferro, Cozinha › Estante de canecas › 2º nível.">
      <SectionCount>{active} ativas de {locations.length}</SectionCount>
      {canManage && <Button onClick={() => setEditing({ location: null, parentId: null })}><IconPlus /> Nova divisão</Button>}
    </SectionHeader>
    {locations.length === 0
      ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma divisão cadastrada ainda.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[640px]">
        <TableCaption className="sr-only">Divisões do inventário</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={HEAD_CLASS}>Divisão</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28 text-right")} title="Lotes com saldo e peças nesta divisão">Aqui</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-36 text-right")} title="Somando as subdivisões">Com subdivisões</TableHead>
          <TableHead className={cn(HEAD_CLASS, canManage ? "w-72" : "w-24")}>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>{locations.map((location) => <LocationRow key={location.id} location={location} canManage={canManage}
          onEdit={() => setEditing({ location, parentId: location.parentId })} onAddChild={() => setEditing({ location: null, parentId: location.id })} />)}</TableBody>
      </Table></div>}
    {canManage && <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="w-[min(34rem,calc(100%-2rem))]">
        {editing !== null && <LocationForm key={editing.location?.id ?? `new-${editing.parentId ?? "root"}`} editing={editing} locations={locations} onDone={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>}
  </SectionCard>;
}

function LocationRow({ location, canManage, onEdit, onAddChild }: { location: LocationItem; canManage: boolean; onEdit: () => void; onAddChild: () => void }) {
  const [state, toggle, toggling] = useActionState(setLocationActive, initial);
  const [moveState, move, moving] = useActionState(moveLocation, initial);
  useActionToast(state);
  useActionToast(moveState);
  return <TableRow className={cn(!location.active && "text-muted-foreground")}>
    <TableCell className={CELL_CLASS}>
      <div style={{ paddingLeft: `${location.depth * 1.25}rem` }} className={cn(location.depth > 0 && "border-l border-dashed")}>
        <div className={cn(location.depth > 0 && "pl-2")}>
          <Link href={`/materiais?divisao=${location.id}`} className={cn("hover:underline", location.depth === 0 ? "font-semibold" : "font-medium")}>{location.name}</Link>
          {location.description && <div className="text-xs text-muted-foreground">{location.description}</div>}
        </div>
      </div>
    </TableCell>
    <TableCell className={cn(CELL_CLASS, "num text-right")}>{location.own || <span className="text-muted-foreground">—</span>}</TableCell>
    <TableCell className={cn(CELL_CLASS, "num text-right text-muted-foreground")}>{location.total}</TableCell>
    <TableCell className={CELL_CLASS}>
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", location.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{location.active ? "Ativa" : "Inativa"}</span>
        {canManage && <>
          <form action={move} className="flex">
            <input type="hidden" name="id" value={location.id} />
            <Button type="submit" name="offset" value="-1" variant="ghost" size="icon-sm" disabled={moving || location.first}
              aria-label={`Subir ${location.path}`} title="Subir"><IconArrowUp /></Button>
            <Button type="submit" name="offset" value="1" variant="ghost" size="icon-sm" disabled={moving || location.last}
              aria-label={`Descer ${location.path}`} title="Descer"><IconArrowDown /></Button>
          </form>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${location.path}`} onClick={onEdit}><IconPencil /></Button>
          {location.active && <Button type="button" variant="ghost" size="icon-sm" aria-label={`Nova subdivisão em ${location.path}`} title="Nova subdivisão" onClick={onAddChild}><IconPlus /></Button>}
          <form action={toggle}>
            <input type="hidden" name="id" value={location.id} /><input type="hidden" name="active" value={String(!location.active)} />
            <Button type="submit" variant="outline" size="sm" disabled={toggling} aria-label={`${location.active ? "Inativar" : "Reativar"} ${location.path}`}>{location.active ? "Inativar" : "Reativar"}</Button>
          </form>
        </>}
      </div>
    </TableCell>
  </TableRow>;
}

function LocationForm({ editing, locations, onDone }: { editing: Editing; locations: LocationItem[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveLocation, initial);
  const { location } = editing;
  const [parentId, setParentId] = useState(editing.parentId ?? "");
  useActionToast(state);
  useEffect(() => { if (state.success) onDone(); }, [state, onDone]);
  // Superior possível: divisões ativas que não sejam a própria nem estejam dentro dela.
  const parents = locations
    .filter((item) => item.active && (!location || (item.id !== location.id && !item.ancestors.includes(location.id))))
    .map((item) => ({ value: item.id, label: item.path }));
  const field = (id: string) => `location-${location?.id ?? "new"}-${id}`;
  return <form action={action} className="grid gap-3">
    <DialogHeader>
      <DialogTitle>{location ? `Editar ${location.name}` : "Nova divisão"}</DialogTitle>
      <DialogDescription>Divisões são lugares na sede (armário, estante, prateleira, caixa de patrulha). Deixe a superior vazia para uma divisão de primeiro nível.</DialogDescription>
    </DialogHeader>
    {location && <input type="hidden" name="id" value={location.id} />}
    <input type="hidden" name="parentId" value={parentId} />
    <div className="grid gap-1.5"><Label htmlFor={field("name")}>Nome</Label><Input id={field("name")} name="name" defaultValue={location?.name} maxLength={80} placeholder="Ex.: Armário de ferro" required /></div>
    <div className="grid gap-1.5"><Label htmlFor={field("parent")}>Dentro de</Label>
      <OptionSelect id={field("parent")} value={parentId} onValueChange={setParentId} options={parents} emptyLabel="Nenhuma (primeiro nível)" /></div>
    <div className="grid gap-1.5"><Label htmlFor={field("description")}>Descrição (opcional)</Label>
      <Textarea id={field("description")} name="description" defaultValue={location?.description ?? ""} maxLength={300} rows={2} placeholder="Ex.: Sala da diretoria, ao lado da porta" /></div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : location ? "Salvar divisão" : "Cadastrar divisão"}</Button>
    </DialogFooter>
  </form>;
}
