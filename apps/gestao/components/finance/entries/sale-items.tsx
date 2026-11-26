"use client";

import { IconPackage, IconPlus, IconTrash } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionCombobox, type Option } from "@geas/ui/components/option-controls";
import { cn } from "@geas/ui/lib/utils";
import { availableFor, saleLotName, type SaleItem, type SaleLot } from "@/lib/finance/sales";
import { centsToInput, formatCents } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";

// Lojinha (019, 021): itens vendidos de um rateio de rubrica que vende itens. Cada item é um lote à venda do Inventário;
// ao salvar, o banco dá baixa nele, e editar ou excluir o lançamento devolve a diferença ao mesmo lote.

export type SaleItemDraft = { key: number; lotId: string; quantity: string; price: string };

let itemKey = 0;
const priceCents = (value: string) => Math.abs(parseMoneyToCents(value) ?? 0);
const quantityOf = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : 0);

export function toItemDrafts(items: SaleItem[]): SaleItemDraft[] {
  return items.map((item) => ({ key: ++itemKey, lotId: item.lotId, quantity: String(item.quantity), price: centsToInput(item.unitPriceCents) }));
}

/** Soma dos itens digitados, em centavos. */
export function itemDraftsTotal(items: SaleItemDraft[]): number {
  return items.reduce((sum, item) => sum + quantityOf(item.quantity) * priceCents(item.price), 0);
}

/** "Anel de lenço · couro — Lojinha › Armário · R$ 15,00 · 8 em estoque". */
function lotLabel(lot: SaleLot, available: number) {
  const price = lot.sale_price_cents != null ? formatCents(lot.sale_price_cents) : "sem preço";
  return `${saleLotName(lot)}${lot.location_path ? ` — ${lot.location_path}` : ""} · ${price} · ${available} em estoque${lot.for_sale ? "" : " (fora da venda)"}`;
}

export function SaleItemsEditor({ index, items, lots, savedItems, readOnly, onChange, className }: {
  index: number; items: SaleItemDraft[]; lots: SaleLot[]; savedItems: SaleItem[]; readOnly: boolean;
  onChange: (items: SaleItemDraft[]) => void; className?: string;
}) {
  const byId = new Map(lots.map((lot) => [lot.id, lot]));
  // À venda com saldo, mais os que já estão neste rateio (mesmo se saíram da venda ou zeraram depois).
  const options: Option[] = lots.filter((lot) => lot.for_sale || items.some((item) => item.lotId === lot.id))
    .map((lot) => ({ value: lot.id, label: lotLabel(lot, availableFor(lot, savedItems)) }));
  const set = (key: number, patch: Partial<SaleItemDraft>) => onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  // O preço vem do lote escolhido (pode ser mudado na venda).
  const chooseLot = (key: number, lotId: string) => {
    const lot = byId.get(lotId);
    set(key, { lotId, price: lot?.sale_price_cents != null ? centsToInput(lot.sale_price_cents) : items.find((item) => item.key === key)?.price ?? "" });
  };
  // Quantidade pedida por lote (o mesmo lote pode estar em mais de uma linha).
  const asked = new Map<string, number>();
  for (const item of items) asked.set(item.lotId, (asked.get(item.lotId) ?? 0) + quantityOf(item.quantity));

  return <div role="group" aria-label={`Itens vendidos da rubrica ${index + 1}`} className={cn("grid gap-2 rounded-md border border-dashed bg-card p-2.5", className)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><IconPackage className="size-4 text-primary" aria-hidden /> Itens vendidos</span>
      {!readOnly && <Button type="button" variant="ghost" size="sm" disabled={options.length === 0}
        onClick={() => onChange([...items, { key: ++itemKey, lotId: "", quantity: "1", price: "" }])}>
        <IconPlus data-icon="inline-start" /> Adicionar item
      </Button>}
    </div>
    {items.length === 0 && <p className="m-0 text-xs text-muted-foreground">
      {options.length === 0
        ? "Nenhum lote à venda. No Inventário, ponha à venda os lotes da Lojinha (menu do lote, no material)."
        : "Opcional: liste o que foi vendido para dar baixa no Inventário. Com itens, o valor da rubrica é a soma deles."}
    </p>}
    {items.map((item, row) => {
      const lot = byId.get(item.lotId);
      const available = lot ? availableFor(lot, savedItems) : 0;
      const short = lot && (asked.get(item.lotId) ?? 0) > available;
      const id = `sale-${index}-${row}`;
      return <div key={item.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_7rem_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor={`${id}-lot`}>Item</Label>
          <OptionCombobox id={`${id}-lot`} value={item.lotId} onValueChange={(value) => chooseLot(item.key, value)} options={options}
            placeholder="Buscar item à venda…" emptyText="Nenhum lote à venda." disabled={readOnly} /></div>
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
        {short && <p role="alert" className="m-0 text-xs text-destructive sm:col-span-full">Só há {available} de {saleLotName(lot)} neste lote.</p>}
      </div>;
    })}
  </div>;
}
