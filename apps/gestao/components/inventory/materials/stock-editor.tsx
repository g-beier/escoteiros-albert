"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { loadRowLots } from "@/app/(inventario)/inventario/materiais/actions";
import { RowStockDialog, type WithdrawLot } from "./withdraw";

type Target = { materialId: string; materialName: string; consumable: boolean; locationId: string; locationPath: string; lots: WithdrawLot[] };

/**
 * Botões ± da lista de Materiais com um só ouvinte de clique (delegado). Os botões (`button[data-stock]`) são
 * renderizados no servidor, sem dados nem handler; a linha (`<tr>`) leva o material e a divisão em `data-*`
 * (`data-m`, `data-l`, `data-name`, `data-path`, `data-cons`). Os lotes da linha vêm do servidor ao clicar, e não no
 * HTML de cada linha (era a maior parte do peso da página, junto com as classes do botão).
 */
export function StockEditor({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);

  async function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-stock]");
    const row = button?.closest("tr");
    if (!button || !row || button.getAttribute("aria-busy") === "true") return;
    const { m: materialId, l: locationId, name, path, cons } = row.dataset;
    if (!materialId || !locationId || !name) return;
    button.setAttribute("aria-busy", "true");
    try {
      const result = await loadRowLots(materialId, locationId);
      if ("error" in result) { toast.error(result.error); return; }
      const locationPath = path ?? "";
      setTarget({
        materialId, materialName: name, consumable: cons !== undefined, locationId, locationPath,
        lots: result.lots.map((lot) => ({ ...lot, path: locationPath || "—" })),
      });
    } catch {
      toast.error("Não foi possível carregar os lotes. Tente de novo.");
    } finally {
      button.removeAttribute("aria-busy");
    }
  }

  return <>
    {/* Delegação: o clique (ou Enter/Espaço, que o navegador converte em clique no botão) sobe até aqui. */}
    <div onClick={onClick} className="contents">{children}</div>
    {target && <RowStockDialog key={`${target.materialId}|${target.locationId}`} {...target} onOpenChange={(open) => { if (!open) setTarget(null); }} />}
  </>;
}
