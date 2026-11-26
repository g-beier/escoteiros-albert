"use client";

import { IconPackage, IconPlus, IconTrash } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionCombobox, type Option } from "@geas/ui/components/option-controls";
import { cn } from "@geas/ui/lib/utils";
import { availableFor, type SaleItem, type SaleMaterial } from "@/lib/finance/sales";
import { centsToInput, formatCents } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";

// Lojinha (019): itens vendidos de um rateio de rubrica que vende itens. Ao salvar, o banco dá baixa no Inventário
// (lote que vence antes primeiro); editar ou excluir o lançamento devolve a diferença.

export type SaleItemDraft = { key: number; materialId: string; quantity: string; price: string };

let itemKey = 0;
const priceCents = (value: string) => Math.abs(parseMoneyToCents(value) ?? 0);
const quantityOf = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : 0);

export function toItemDrafts(items: SaleItem[]): SaleItemDraft[] {
  return items.map((item) => ({ key: ++itemKey, materialId: item.materialId, quantity: String(item.quantity), price: centsToInput(item.unitPriceCents) }));
}

/** Soma dos itens digitados, em centavos. */
export function itemDraftsTotal(items: SaleItemDraft[]): number {
  return items.reduce((sum, item) => sum + quantityOf(item.quantity) * priceCents(item.price), 0);
}

export function SaleItemsEditor({ index, items, materials, savedItems, readOnly, onChange, className }: {
  index: number; items: SaleItemDraft[]; materials: SaleMaterial[]; savedItems: SaleItem[]; readOnly: boolean;
  onChange: (items: SaleItemDraft[]) => void; className?: string;
}) {
  const byId = new Map(materials.map((m) => [m.id, m]));
  // À venda, mais os que já estão neste rateio (mesmo se saíram da venda depois).
  const options: Option[] = materials.filter((m) => m.for_sale || items.some((item) => item.materialId === m.id))
    .map((m) => ({ value: m.id, label: `${m.name} · ${availableFor(m, savedItems)} em estoque${m.for_sale ? "" : " (fora da venda)"}` }));
  const set = (key: number, patch: Partial<SaleItemDraft>) => onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const chooseMaterial = (key: number, materialId: string) => {
    const material = byId.get(materialId);
    const current = items.find((item) => item.key === key);
    set(key, { materialId, price: current?.price || (material?.sale_price_cents != null ? centsToInput(material.sale_price_cents) : "") });
  };
  // Quantidade pedida por material (o mesmo material pode estar em mais de uma linha).
  const asked = new Map<string, number>();
  for (const item of items) asked.set(item.materialId, (asked.get(item.materialId) ?? 0) + quantityOf(item.quantity));

  return <div role="group" aria-label={`Itens vendidos da rubrica ${index + 1}`} className={cn("grid gap-2 rounded-md border border-dashed bg-card p-2.5", className)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><IconPackage className="size-4 text-primary" aria-hidden /> Itens vendidos</span>
      {!readOnly && <Button type="button" variant="ghost" size="sm" disabled={options.length === 0}
        onClick={() => onChange([...items, { key: ++itemKey, materialId: "", quantity: "1", price: "" }])}>
        <IconPlus data-icon="inline-start" /> Adicionar item
      </Button>}
    </div>
    {items.length === 0 && <p className="m-0 text-xs text-muted-foreground">
      {options.length === 0
        ? "Nenhum material à venda. Marque \"À venda na Lojinha\" no material, no Inventário."
        : "Opcional: liste o que foi vendido para dar baixa no Inventário. Com itens, o valor da rubrica é a soma deles."}
    </p>}
    {items.map((item, row) => {
      const material = byId.get(item.materialId);
      const available = material ? availableFor(material, savedItems) : 0;
      const short = material && (asked.get(item.materialId) ?? 0) > available;
      const id = `sale-${index}-${row}`;
      return <div key={item.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_7rem_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor={`${id}-material`}>Material</Label>
          <OptionCombobox id={`${id}-material`} value={item.materialId} onValueChange={(value) => chooseMaterial(item.key, value)} options={options}
            placeholder="Buscar material…" emptyText="Nenhum material à venda." disabled={readOnly} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`${id}-quantity`}>Quantidade</Label>
          <Input id={`${id}-quantity`} inputMode="numeric" value={item.quantity} onChange={(e) => set(item.key, { quantity: e.target.value })}
            aria-invalid={short || undefined} className="text-right num" readOnly={readOnly} required /></div>
        <div className="grid gap-1.5"><Label htmlFor={`${id}-price`}>Preço unitário (R$)</Label>
          <Input id={`${id}-price`} inputMode="decimal" placeholder="0,00" value={item.price} onChange={(e) => set(item.key, { price: e.target.value })}
            className="text-right num" readOnly={readOnly} required /></div>
        <div className="grid gap-1.5"><span className="text-sm font-medium">Subtotal</span>
          <span className="flex h-8 items-center justify-end text-sm num">{formatCents(quantityOf(item.quantity) * priceCents(item.price))}</span></div>
        {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label={`Remover item ${row + 1}`}
          onClick={() => onChange(items.filter((other) => other.key !== item.key))}><IconTrash /></Button>}
        {short && <p role="alert" className="m-0 text-xs text-destructive sm:col-span-full">Só há {available} de {material.name} no inventário.</p>}
      </div>;
    })}
  </div>;
}
