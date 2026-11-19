"use client";

import { useState } from "react";
import { IconPencil } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import {
  cellStatus, cellStatusLabel, cellValue, directorateLabels, DIRECTORATES, isPending, itemApplies, orderedItems,
  type ControlAudience, type ControlItem, type ControlStatusRow,
} from "@/lib/associates/controls";
import { dateBR } from "@/lib/format";
import { ControlBadge } from "./control-badge";
import { ControlStatusDialog, type StatusTarget } from "./control-status-dialog";

/**
 * Controle de dados do associado: os itens ativos que se aplicam ao seu público (e os que já têm registro), por
 * diretoria, com situação, data, validade e observação. Quem edita abre o diálogo pelo lápis.
 */
export function AssociateControls({ associate, audiences, items, rows, canEdit, today }: {
  associate: { id: string; name: string; active: boolean }; audiences: ControlAudience[]; items: ControlItem[]; rows: ControlStatusRow[];
  canEdit: boolean; today: string;
}) {
  const [target, setTarget] = useState<StatusTarget | null>(null);
  const byItem = new Map(rows.map((row) => [row.item_id, row]));
  const shown = orderedItems(items.filter((item) => byItem.has(item.id) || (item.active && itemApplies(item, audiences))));
  const pending = shown.filter((item) => {
    const row = byItem.get(item.id);
    return (row || associate.active) && item.active && isPending(cellStatus(row));
  }).length;

  return <SectionCard aria-labelledby="controls-title">
    <SectionHeader title="Controle de dados" titleId="controls-title" description="Onde estão os dados e documentos desta pessoa (Doc 22). Os itens dependem do público: jovens ou adultos.">
      <SectionCount>{pending} {pending === 1 ? "pendência" : "pendências"}</SectionCount>
    </SectionHeader>
    {shown.length === 0
      ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum item de controle se aplica.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[680px]">
        <TableCaption className="sr-only">Controle de dados do associado</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={HEAD_CLASS}>Item</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-32")}>Situação</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-24")}>Data</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-24")}>Validade</TableHead>
          <TableHead className={HEAD_CLASS}>Observação</TableHead>
          {canEdit && <TableHead className={cn(HEAD_CLASS, "w-12")}><span className="sr-only">Editar</span></TableHead>}
        </TableRow></TableHeader>
        <TableBody>{DIRECTORATES.map((directorate) => {
          const group = shown.filter((item) => item.directorate === directorate);
          if (!group.length) return null;
          return [
            <TableRow key={directorate} className="hover:bg-transparent">
              <TableHead scope="colgroup" colSpan={canEdit ? 6 : 5} className="h-7 bg-muted/50 px-3 text-xs font-semibold">{directorateLabels[directorate]}</TableHead>
            </TableRow>,
            ...group.map((item) => {
              const row = byItem.get(item.id);
              const status = cellStatus(row);
              return <TableRow key={item.id} className={cn(!item.active && "text-muted-foreground")}>
                <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>{item.name}{!item.active && " (item desativado)"}</TableCell>
                <TableCell className={CELL_CLASS}><ControlBadge status={status} value={cellValue(item, row)} /></TableCell>
                <TableCell className={cn(CELL_CLASS, "num")}>{row?.status_date ? dateBR(row.status_date) : "—"}</TableCell>
                <TableCell className={cn(CELL_CLASS, "num")}>{row?.valid_until ? dateBR(row.valid_until) : "—"}</TableCell>
                <TableCell className={cn(CELL_CLASS, "whitespace-normal text-muted-foreground")}>{row?.note ?? ""}</TableCell>
                {canEdit && <TableCell className={CELL_CLASS}>
                  {item.active && <Button variant="ghost" size="icon-sm" aria-label={`Editar ${item.name}: ${cellStatusLabel(status)}`}
                    onClick={() => setTarget({ person: associate, item, row })}><IconPencil /></Button>}
                </TableCell>}
              </TableRow>;
            }),
          ];
        })}</TableBody>
      </Table></div>}
    {canEdit && <ControlStatusDialog target={target} today={today} onClose={() => setTarget(null)} />}
  </SectionCard>;
}
