"use client";

import { Link } from "@geas/ui/components/link";
import { useActionState, useEffect, useOptimistic, useState, useTransition } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@geas/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { DragHandle, DragHandleSpacer, DROP_CLASS, useTreeDrag, type DropPlace } from "@geas/ui/components/tree-drag";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { Badge } from "@geas/ui/components/badge";
import { cn } from "@geas/ui/lib/utils";
import {
  placeLocation,
  saveLocation,
  setLocationActive,
} from "@/app/(inventario)/inventario/configuracoes/divisoes/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import { placeError, placeLocal } from "@/lib/inventory/locations";

import type { LocationItem } from "@/lib/inventory/model";
import { ActionForm } from "@geas/ui/components/action-form";

export type { LocationItem };

const initial: ActionResult = {};
type Editing = { location: LocationItem | null; parentId: string | null };

/**
 * Árvore de divisões na ordem escolhida pelo gestor; a indentação mostra o nível. O gestor arrasta pela alça
 * (acima, abaixo ou no meio de outra, para pôr dentro dela) e cada soltura grava na hora (inventory_place_location).
 */
export function LocationsManager({ locations: saved, canManage }: { locations: LocationItem[]; canManage: boolean }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [locations, applyPlace] = useOptimistic(
    saved,
    (items, move: { id: string; target: string; place: DropPlace }) =>
      placeLocal(items, move.id, move.target, move.place),
  );
  const [placing, startPlacing] = useTransition();
  const drag = useTreeDrag({
    dropError: (id, target, place) => placeError(locations, id, target, place),
    onDrop: (id, target, place) =>
      startPlacing(async () => {
        applyPlace({ id, target, place });
        const result = await placeLocation(id, target, place);
        if (result.error) toast.error(result.error);
      }),
  });
  const active = locations.filter((location) => location.active).length;
  return (
    <SectionCard aria-labelledby="locations-title">
      <SectionHeader
        title="Divisões"
        titleId="locations-title"
        description="Onde o material fica guardado, em árvore: Diretoria › Armário de ferro, Cozinha › Estante de canecas › 2º nível."
      >
        <SectionCount>
          {active} ativas de {locations.length}
        </SectionCount>
        {canManage && (
          <Button onClick={() => setEditing({ location: null, parentId: null })}>
            <IconPlus /> Nova divisão
          </Button>
        )}
      </SectionHeader>
      {locations.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma divisão cadastrada ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableCaption className="sr-only">Divisões do inventário</TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD_CLASS}>Divisão</TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-28 text-right")} title="Lotes com saldo e peças nesta divisão">
                  Aqui
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-36 text-right")} title="Somando as subdivisões">
                  Com subdivisões
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, canManage ? "w-64" : "w-24")}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => (
                <LocationRow
                  key={location.id}
                  location={location}
                  canManage={canManage}
                  draggable={canManage && !placing}
                  dragging={drag.dragKey === location.id}
                  drop={drag.dropFor(location.id)}
                  rowProps={drag.rowProps(location.id)}
                  handleProps={drag.handleProps(location.id)}
                  onEdit={() => setEditing({ location, parentId: location.parentId })}
                  onAddChild={() => setEditing({ location: null, parentId: location.id })}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {drag.dragKey && (
        <p className="m-0 border-t px-4 py-2 text-xs" aria-live="polite">
          {drag.hint ? (
            <span className="text-destructive">{drag.hint}</span>
          ) : (
            <span className="text-muted-foreground">
              Solte acima, abaixo ou no meio de uma divisão (para pôr dentro dela).
            </span>
          )}
        </p>
      )}
      {canManage && (
        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="w-[min(34rem,calc(100%-2rem))]">
            {editing !== null && (
              <LocationForm
                key={editing.location?.id ?? `new-${editing.parentId ?? "root"}`}
                editing={editing}
                locations={locations}
                onDone={() => setEditing(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </SectionCard>
  );
}

type RowProps = {
  location: LocationItem;
  canManage: boolean;
  draggable: boolean;
  dragging: boolean;
  drop: DropPlace | null;
  rowProps: ReturnType<ReturnType<typeof useTreeDrag>["rowProps"]>;
  handleProps: { onDragStart: () => void; onDragEnd: () => void };
  onEdit: () => void;
  onAddChild: () => void;
};

function LocationRow({
  location,
  canManage,
  draggable,
  dragging,
  drop,
  rowProps,
  handleProps,
  onEdit,
  onAddChild,
}: RowProps) {
  const [state, toggle, toggling] = useActionState(setLocationActive, initial);
  useActionToast(state);
  return (
    <TableRow
      className={cn(!location.active && "text-muted-foreground", dragging && "opacity-40", drop && DROP_CLASS[drop])}
      {...rowProps}
    >
      <TableCell className={CELL_CLASS}>
        <div className="flex items-center gap-1.5">
          {canManage && (draggable ? <DragHandle id={location.id} {...handleProps} /> : <DragHandleSpacer />)}
          <div
            style={{ marginLeft: `${location.depth * 1.25}rem` }}
            className={cn("min-w-0 flex-1", location.depth > 0 && "border-l border-dashed")}
          >
            <div className={cn(location.depth > 0 && "pl-2")}>
              <Link
                href={`/inventario/materiais?divisao=${location.id}`}
                className={cn("hover:underline", location.depth === 0 ? "font-semibold" : "font-medium")}
              >
                {location.name}
              </Link>
              {location.description && <div className="text-xs text-muted-foreground">{location.description}</div>}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className={cn(CELL_CLASS, "text-right num")}>
        {location.own || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className={cn(CELL_CLASS, "text-right num text-muted-foreground")}>{location.total}</TableCell>
      <TableCell className={CELL_CLASS}>
        <div className="flex items-center gap-2">
          <Badge size="md" variant={location.active ? "success" : "muted"}>
            {location.active ? "Ativa" : "Inativa"}
          </Badge>
          {canManage && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${location.path}`}
                onClick={onEdit}
              >
                <IconPencil />
              </Button>
              {location.active && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Nova subdivisão em ${location.path}`}
                  title="Nova subdivisão"
                  onClick={onAddChild}
                >
                  <IconPlus />
                </Button>
              )}
              <form action={toggle}>
                <input type="hidden" name="id" value={location.id} />
                <input type="hidden" name="active" value={String(!location.active)} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={toggling}
                  aria-label={`${location.active ? "Inativar" : "Reativar"} ${location.path}`}
                >
                  {location.active ? "Inativar" : "Reativar"}
                </Button>
              </form>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function LocationForm({
  editing,
  locations,
  onDone,
}: {
  editing: Editing;
  locations: LocationItem[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveLocation, initial);
  const { location } = editing;
  const [parentId, setParentId] = useState(editing.parentId ?? "");
  useActionToast(state);
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);
  // Superior possível: divisões ativas que não sejam a própria nem estejam dentro dela.
  const parents = locations
    .filter((item) => item.active && (!location || (item.id !== location.id && !item.ancestors.includes(location.id))))
    .map((item) => ({ value: item.id, label: item.path }));
  const field = (id: string) => `location-${location?.id ?? "new"}-${id}`;
  return (
    <ActionForm action={action} result={state} className="grid gap-3">
      <DialogHeader>
        <DialogTitle>{location ? `Editar ${location.name}` : "Nova divisão"}</DialogTitle>
        <DialogDescription>
          Divisões são lugares na sede (armário, estante, prateleira, caixa de patrulha). Deixe a superior vazia para
          uma divisão de primeiro nível.
        </DialogDescription>
      </DialogHeader>
      {location && <input type="hidden" name="id" value={location.id} />}
      <input type="hidden" name="parentId" value={parentId} />
      <div className="grid gap-1.5">
        <Label htmlFor={field("name")}>Nome</Label>
        <Input
          id={field("name")}
          name="name"
          defaultValue={location?.name}
          maxLength={80}
          placeholder="Ex.: Armário de ferro"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={field("parent")}>Dentro de</Label>
        <OptionSelect
          id={field("parent")}
          value={parentId}
          onValueChange={setParentId}
          options={parents}
          emptyLabel="Nenhuma (primeiro nível)"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={field("description")}>Descrição (opcional)</Label>
        <Textarea
          id={field("description")}
          name="description"
          defaultValue={location?.description ?? ""}
          maxLength={300}
          rows={2}
          placeholder="Ex.: Sala da diretoria, ao lado da porta"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : location ? "Salvar divisão" : "Cadastrar divisão"}
        </Button>
      </DialogFooter>
    </ActionForm>
  );
}
