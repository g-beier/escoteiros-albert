"use client";

import { useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { IconSortAZ } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { DragHandle, DROP_CLASS } from "@geas/ui/components/tree-drag";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { orderMaterials } from "@/app/(inventario)/inventario/materiais/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";

export type OrderItem = { id: string; name: string; quantity: number; detail: string | null };
type Drop = { id: string; place: "before" | "after" };

/** Move `id` para antes/depois de `target` (rascunho da tela). */
function moveItem<T extends { id: string }>(items: T[], id: string, target: string, place: Drop["place"]): T[] {
  if (id === target) return items;
  const moving = items.find((item) => item.id === id);
  if (!moving) return items;
  const rest = items.filter((item) => item.id !== id);
  const at = rest.findIndex((item) => item.id === target);
  if (at < 0) return items;
  const index = place === "before" ? at : at + 1;
  return [...rest.slice(0, index), moving, ...rest.slice(index)];
}

/**
 * Ordem dos materiais de uma divisão: rascunho no cliente (arrastar pela alça, metade de cima solta antes, a de
 * baixo depois) gravado de uma vez em "Salvar ordem" (inventory_order_materials); depois volta para a lista.
 */
export function MaterialOrder({ locationId, title, items: saved, allPlaced, back }: { locationId: string; title: string; items: OrderItem[]; allPlaced: boolean; back: string }) {
  const router = useRouter();
  const [items, setItems] = useState(saved);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [saving, startSaving] = useTransition();
  // Sem posição gravada para todos, salvar já fixa a ordem que está na tela.
  const changed = !allPlaced || items.some((item, index) => item.id !== saved[index]?.id);

  const end = () => { setDragId(null); setDrop(null); };
  const rowProps = (id: string) => ({
    onDragOver: (event: DragEvent<HTMLTableRowElement>) => {
      if (!dragId || dragId === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const place = event.clientY - rect.top < rect.height / 2 ? "before" : "after";
      if (drop?.id !== id || drop.place !== place) setDrop({ id, place });
    },
    onDrop: (event: DragEvent<HTMLTableRowElement>) => {
      event.preventDefault();
      if (dragId && drop?.id === id) setItems((current) => moveItem(current, dragId, id, drop.place));
      end();
    },
  });

  const save = () => startSaving(async () => {
    const result = await orderMaterials(locationId, items.map((item) => item.id));
    if (result.error) { toast.error(result.error); return; }
    toast.success(result.success ?? "Ordem salva.");
    router.push(back);
  });

  return <SectionCard aria-labelledby="order-title">
    <SectionHeader title={title} titleId="order-title"
      description="Arraste pela alça para pôr os materiais na ordem em que ficam guardados (ou na ordem que faz sentido). Nada muda até salvar.">
      <SectionCount>{items.length} {items.length === 1 ? "material" : "materiais"}</SectionCount>
      <Button type="button" variant="outline" size="sm" disabled={saving}
        onClick={() => setItems((current) => [...current].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))}>
        <IconSortAZ data-icon="inline-start" /> De A a Z
      </Button>
    </SectionHeader>
    <div className="overflow-x-auto"><Table className="min-w-[480px]">
      <TableCaption className="sr-only">Materiais da divisão, na ordem escolhida</TableCaption>
      <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className={cn(HEAD_CLASS, "w-12 text-right")}>#</TableHead>
        <TableHead className={HEAD_CLASS}>Material</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-28 text-center")}>Quantidade</TableHead>
      </TableRow></TableHeader>
      <TableBody>{items.map((item, index) => {
        const place = drop?.id === item.id ? drop.place : null;
        return <TableRow key={item.id} {...rowProps(item.id)} className={cn(dragId === item.id && "opacity-40", place && DROP_CLASS[place])}>
          <TableCell className={cn(CELL_CLASS, "num text-right text-muted-foreground")}>{index + 1}</TableCell>
          <TableCell className={CELL_CLASS}>
            <div className="flex items-center gap-1.5">
              {!saving && <DragHandle id={item.id} onDragStart={() => setDragId(item.id)} onDragEnd={end} />}
              <div className="min-w-0">
                <div className="font-medium">{item.name}</div>
                {item.detail && <div className="text-xs text-muted-foreground">{item.detail}</div>}
              </div>
            </div>
          </TableCell>
          <TableCell className={cn(CELL_CLASS, "num text-center")}>{item.quantity}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table></div>
    <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
      <Button type="button" variant="outline" disabled={saving} onClick={() => router.push(back)}>Cancelar</Button>
      <Button type="button" disabled={saving || !changed} onClick={save}>{saving ? "Salvando…" : "Salvar ordem"}</Button>
    </div>
  </SectionCard>;
}
