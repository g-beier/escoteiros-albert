"use client";

import { Fragment, useActionState, useOptimistic, useState, useTransition } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { DragHandle, DragHandleSpacer, DROP_CLASS, useTreeDrag, type DropPlace } from "@geas/ui/components/tree-drag";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { placeControlItem, saveControlItem, toggleControlItem } from "@/app/(associados)/associados/configuracoes/itens/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import {
  audienceNames, audiencesSummary, CONTROL_AUDIENCES, CONTROL_ITEM_KINDS, CONTROL_STATUSES, CONTROL_VALUE_KINDS, directorateLabels, DIRECTORATES, itemKindLabels,
  orderedItems, statusLabels, validityLabel, valueKindLabels, type ControlAudience, type ControlItem, type Directorate,
} from "@/lib/associates/controls";
import { Field } from "./associate-form";

const kindOptions = CONTROL_ITEM_KINDS.map((value) => ({ value, label: itemKindLabels[value] }));
const directorateOptions = DIRECTORATES.map((value) => ({ value, label: directorateLabels[value] }));
const initialOptions = CONTROL_STATUSES.map((value) => ({ value, label: statusLabels[value] }));
const valueKindOptions = CONTROL_VALUE_KINDS.map((value) => ({ value, label: valueKindLabels[value] }));

/** Ordem local depois de soltar `id` antes/depois de `target` (mesma diretoria); posições 1..n como no banco. */
function placeLocal(items: ControlItem[], id: string, target: string, place: DropPlace): ControlItem[] {
  const moving = items.find((i) => i.id === id);
  if (!moving) return items;
  const list = orderedItems(items.filter((i) => i.directorate === moving.directorate && i.id !== id));
  const at = list.findIndex((i) => i.id === target) + (place === "after" ? 1 : 0);
  list.splice(at, 0, moving);
  const position = new Map(list.map((item, index) => [item.id, index + 1]));
  return items.map((item) => (position.has(item.id) ? { ...item, position: position.get(item.id)! } : item));
}

/**
 * Itens de controle por diretoria. Quem edita cria, edita (diálogo), desativa/reativa e reordena arrastando pela
 * alça dentro da diretoria (cada soltura grava na hora, control_item_place). Itens nunca se apagam.
 */
export function ControlItemsManager({ items: saved, canEdit }: { items: ControlItem[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<{ item: ControlItem | null; directorate: Directorate } | null>(null);
  const [items, applyPlace] = useOptimistic(saved, (current, move: { id: string; target: string; place: DropPlace }) => placeLocal(current, move.id, move.target, move.place));
  const [placing, startPlacing] = useTransition();
  const byId = new Map(items.map((i) => [i.id, i]));
  const drag = useTreeDrag({
    dropError: (id, target, place) => {
      if (place === "inside" || id === target) return "";
      return byId.get(id)?.directorate === byId.get(target)?.directorate ? null : "Arraste só dentro da mesma diretoria.";
    },
    onDrop: (id, target, place) => startPlacing(async () => {
      const next = placeLocal(items, id, target, place);
      applyPlace({ id, target, place });
      const result = await placeControlItem(id, next.find((i) => i.id === id)!.position);
      if (result.error) toast.error(result.error);
    }),
  });
  const active = items.filter((i) => i.active).length;
  const columns = canEdit ? 7 : 6;

  return <SectionCard aria-labelledby="items-title" className="min-w-0">
    <SectionHeader title="Itens de controle" titleId="items-title"
      description="O que se acompanha por pessoa (documentos, sistemas, canais, etapas), por diretoria. Desative o que deixou de valer: o histórico fica.">
      <SectionCount>{active} ativos de {items.length}</SectionCount>
      {canEdit && <Button onClick={() => setEditing({ item: null, directorate: "administrativa" })}><IconPlus /> Novo item</Button>}
    </SectionHeader>
    <div className="overflow-x-auto"><Table className="min-w-[760px]">
      <TableCaption className="sr-only">Itens de controle por diretoria</TableCaption>
      <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className={HEAD_CLASS}>Item</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-24")}>Tipo</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-60")}>Se aplica a (valor inicial)</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-24")}>Validade</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-28")}>No desligamento</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-24")}>Status</TableHead>
        {canEdit && <TableHead className={cn(HEAD_CLASS, "w-44")}><span className="sr-only">Ações</span></TableHead>}
      </TableRow></TableHeader>
      <TableBody>{DIRECTORATES.map((directorate) => {
        const group = orderedItems(items.filter((i) => i.directorate === directorate));
        return <Fragment key={directorate}>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="colgroup" colSpan={columns} className="h-7 bg-muted/50 px-3 text-xs font-semibold">
              {directorateLabels[directorate]} <span className="num font-normal text-muted-foreground">({group.length})</span>
            </TableHead>
          </TableRow>
          {group.length === 0 && <TableRow className="hover:bg-transparent"><TableCell colSpan={columns} className={cn(CELL_CLASS, "text-xs text-muted-foreground")}>Nenhum item.</TableCell></TableRow>}
          {group.map((item) => <ItemRow key={item.id} item={item} canEdit={canEdit} draggable={canEdit && !placing && group.length > 1}
            dragging={drag.dragKey === item.id} drop={drag.dropFor(item.id)} rowProps={drag.rowProps(item.id)} handleProps={drag.handleProps(item.id)}
            onEdit={() => setEditing({ item, directorate: item.directorate })} />)}
        </Fragment>;
      })}</TableBody>
    </Table></div>
    {drag.dragKey && <p className="m-0 border-t px-4 py-2 text-xs" aria-live="polite">
      {drag.hint ? <span className="text-destructive">{drag.hint}</span> : <span className="text-muted-foreground">Solte acima ou abaixo de outro item da mesma diretoria.</span>}
    </p>}
    {canEdit && <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]">
        {editing && <ItemForm key={editing.item?.id ?? "new"} item={editing.item} directorate={editing.directorate} onDone={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>}
  </SectionCard>;
}

type RowProps = {
  item: ControlItem; canEdit: boolean; draggable: boolean; dragging: boolean; drop: DropPlace | null;
  rowProps: ReturnType<ReturnType<typeof useTreeDrag>["rowProps"]>; handleProps: { onDragStart: () => void; onDragEnd: () => void };
  onEdit: () => void;
};

function ItemRow({ item, canEdit, draggable, dragging, drop, rowProps, handleProps, onEdit }: RowProps) {
  const [toggling, startToggle] = useTransition();
  const toggle = () => startToggle(async () => {
    const result = await toggleControlItem(item.id, !item.active);
    if (result.error) toast.error(result.error);
    else if (result.success) toast.success(result.success);
  });
  return <TableRow className={cn(!item.active && "text-muted-foreground", dragging && "opacity-40", drop && DROP_CLASS[drop])} {...(canEdit ? rowProps : {})}>
    <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>
      <div className="flex items-center gap-2">
        {canEdit && (draggable ? <DragHandle id={item.id} {...handleProps} /> : <DragHandleSpacer />)}
        <span className="font-medium">{item.name}</span>
      </div>
    </TableCell>
    <TableCell className={CELL_CLASS}>
      {itemKindLabels[item.kind]}
      {item.value_kind !== "situacao" && <span className="block text-[11px] text-muted-foreground">mostra {valueKindLabels[item.value_kind].toLowerCase()}</span>}
    </TableCell>
    <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>{audiencesSummary(item.audiences)}</TableCell>
    <TableCell className={CELL_CLASS}>{validityLabel(item.validity_months)}</TableCell>
    <TableCell className={CELL_CLASS}>{item.remove_on_leave ? "Remover" : "—"}</TableCell>
    <TableCell className={CELL_CLASS}>
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", item.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{item.active ? "Ativo" : "Inativo"}</span>
    </TableCell>
    {canEdit && <TableCell className={CELL_CLASS}>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Editar ${item.name}`}><IconPencil /> Editar</Button>
        <Button variant="outline" size="sm" onClick={toggle} disabled={toggling} aria-label={`${item.active ? "Desativar" : "Reativar"} ${item.name}`}>{item.active ? "Desativar" : "Reativar"}</Button>
      </div>
    </TableCell>}
  </TableRow>;
}

function ItemForm({ item, directorate: initialDirectorate, onDone }: { item: ControlItem | null; directorate: Directorate; onDone: () => void }) {
  const [kind, setKind] = useState<string>(item?.kind ?? "documento");
  const [valueKind, setValueKind] = useState<string>(item?.value_kind ?? "situacao");
  const [directorate, setDirectorate] = useState<string>(item?.directorate ?? initialDirectorate);
  // público → valor inicial ("" = sem registro); ausente = não se aplica
  const [audiences, setAudiences] = useState<Partial<Record<ControlAudience, string>>>(
    Object.fromEntries((item?.audiences ?? []).map((a) => [a.audience, a.initial_status ?? ""])));
  const [removeOnLeave, setRemoveOnLeave] = useState(item?.remove_on_leave ?? false);
  const [, action, pending] = useActionState(async (previous: ActionResult, data: FormData) => {
    const result = await saveControlItem(previous, data);
    if (result.error) toast.error(result.error);
    else if (result.success) {
      toast.success(result.success);
      onDone();
    }
    return result;
  }, {});
  const toggleAudience = (audience: ControlAudience, checked: boolean) => setAudiences((current) => {
    const next = { ...current };
    if (checked) next[audience] = "pendente";
    else delete next[audience];
    return next;
  });

  return <>
    <DialogHeader>
      <DialogTitle>{item ? `Editar ${item.name}` : "Novo item de controle"}</DialogTitle>
      <DialogDescription>Validade em branco: não vence. Ao desligar alguém, os itens marcados para remover ficam “a remover”.</DialogDescription>
    </DialogHeader>
    <form action={action} className="grid gap-3">
      {item && <><input type="hidden" name="id" value={item.id} /><input type="hidden" name="active" value={String(item.active)} /></>}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="valueKind" value={valueKind} />
      <input type="hidden" name="directorate" value={directorate} />
      {CONTROL_AUDIENCES.filter((a) => audiences[a] !== undefined).map((a) => <Fragment key={a}>
        <input type="hidden" name={`applies-${a}`} value="on" />
        <input type="hidden" name={`initial-${a}`} value={audiences[a]} />
      </Fragment>)}
      {removeOnLeave && <input type="hidden" name="removeOnLeave" value="on" />}
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="item-name" label="Nome" className="sm:col-span-2">
          <Input id="item-name" name="name" required minLength={2} maxLength={80} defaultValue={item?.name ?? ""} placeholder="Ex.: Ficha médica" />
        </Field>
        <Field id="item-directorate" label="Diretoria">
          <OptionSelect id="item-directorate" value={directorate} onValueChange={setDirectorate} options={directorateOptions} />
        </Field>
        <Field id="item-kind" label="Tipo">
          <OptionSelect id="item-kind" value={kind} onValueChange={setKind} options={kindOptions} />
        </Field>
        <fieldset className="m-0 grid gap-1.5 border-0 p-0 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Se aplica a</legend>
          <p className="m-0 text-[11px] text-muted-foreground">O valor inicial fica preenchido quando a pessoa é cadastrada. Mudar aqui não altera as situações já gravadas.</p>
          <div className="grid grid-cols-[minmax(8rem,auto)_1fr] items-center gap-x-4 gap-y-2">
            <span className="text-xs font-medium text-muted-foreground">Público</span>
            <span className="text-xs font-medium text-muted-foreground">Valor inicial</span>
            {CONTROL_AUDIENCES.map((a) => {
              const applies = audiences[a] !== undefined;
              return <Fragment key={a}>
                <div className="flex items-center gap-2">
                  <Checkbox id={`item-audience-${a}`} checked={applies} onCheckedChange={(checked) => toggleAudience(a, checked === true)} />
                  <Label htmlFor={`item-audience-${a}`}>{audienceNames[a]}</Label>
                </div>
                <div>
                  <Label htmlFor={`item-initial-${a}`} className="sr-only">Valor inicial: {audienceNames[a]}</Label>
                  <OptionSelect id={`item-initial-${a}`} value={audiences[a] ?? ""} disabled={!applies} emptyLabel="Sem registro" options={initialOptions}
                    onValueChange={(value) => setAudiences((current) => ({ ...current, [a]: value }))} className="sm:max-w-56" />
                </div>
              </Fragment>;
            })}
          </div>
        </fieldset>
        <Field id="item-validity" label="Validade (meses)" hint="Em branco: não vence. Ficha médica: 12.">
          <Input id="item-validity" name="validityMonths" type="number" min={1} max={120} step={1} className="num" defaultValue={item?.validity_months ?? ""} />
        </Field>
        <Field id="item-value-kind" label="Mostra na célula" hint="Ano ou Data: a matriz mostra o valor (ex.: 2026, 31/03/27) na cor da situação.">
          <OptionSelect id="item-value-kind" value={valueKind} onValueChange={setValueKind} options={valueKindOptions} />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="item-remove" checked={removeOnLeave} onCheckedChange={(checked) => setRemoveOnLeave(checked === true)} />
          <Label htmlFor="item-remove">Remover no desligamento (canais e acessos)</Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : item ? "Salvar item" : "Criar item"}</Button>
      </DialogFooter>
    </form>
  </>;
}
