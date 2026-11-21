"use client";

import { useMemo, useState, type ReactNode } from "react";
import { statusKey, statusMap, type ControlItem, type ControlStatusRow } from "@/lib/associates/controls";
import { ControlStatusDialog, type StatusTarget } from "./control-status-dialog";

/**
 * Edição da matriz do Controle com um só ouvinte de clique (delegado): as células (`button[data-cell]`, renderizadas
 * no servidor) não levam dados; a pessoa vem do `<tr>` (`data-person-*`) e o item, da coluna (`cellIndex`: a 1ª
 * célula é o nome). Este componente abre o diálogo da situação. Com milhares de células,
 * hidratar um botão com handler por célula era o que sobrava de custo na carga e na rolagem da tela.
 */
export function ControlMatrixEditor({ items, rows, today, children }: { items: ControlItem[]; rows: ControlStatusRow[]; today: string; children: ReactNode }) {
  const [target, setTarget] = useState<StatusTarget | null>(null);
  const map = useMemo(() => statusMap(rows), [rows]);

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-cell]");
    const cell = button?.closest("td");
    const row = cell?.closest("tr");
    if (!cell || !row) return;
    const { personId, personName, relative, context } = row.dataset;
    const item = items[cell.cellIndex - 1];
    if (!personId || !personName || !item) return;
    const isRelative = relative !== undefined;
    setTarget({
      person: { id: personId, name: personName, relative: isRelative, context: context || undefined },
      item,
      row: map.get(statusKey(isRelative ? `r:${personId}` : personId, item.id)),
    });
  }

  return <>
    {/* Delegação: o clique (ou Enter/Espaço, que o navegador converte em clique no botão) sobe até aqui. */}
    <div onClick={onClick} className="contents">{children}</div>
    <ControlStatusDialog target={target} today={today} onClose={() => setTarget(null)} />
  </>;
}
