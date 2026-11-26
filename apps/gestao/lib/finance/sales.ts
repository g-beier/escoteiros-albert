import type { CategoryItem } from "./categories";

// Lojinha (019): itens vendidos num rateio de rubrica marcada "venda de itens" dão baixa no Inventário.

/** Material oferecido no lançamento: à venda (ou já vendido antes), com preço sugerido e saldo somado dos lotes. */
export type SaleMaterial = { id: string; name: string; for_sale: boolean; sale_price_cents: number | null; stock: number };

/** Item vendido num rateio (valores em centavos). */
export type SaleItem = { materialId: string; quantity: number; unitPriceCents: number };

/** A rubrica ou alguma acima dela está marcada "venda de itens" (mesma regra de `category_sells_items`). */
export function categorySellsItems(categoryId: string, categories: Pick<CategoryItem, "id" | "parent_id" | "sells_items">[]): boolean {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let current = byId.get(categoryId);
  for (let depth = 0; current && depth < 10; depth++) {
    if (current.sells_items) return true;
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return false;
}

/** Soma dos itens (quantidade × preço). */
export function saleItemsTotal(items: Pick<SaleItem, "quantity" | "unitPriceCents">[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}

/**
 * Quantidade disponível para o lançamento: saldo de hoje mais o que este lançamento já tinha vendido (ao editar, o que
 * já saiu volta antes de sair de novo).
 */
export function availableFor(material: Pick<SaleMaterial, "id" | "stock">, savedItems: Pick<SaleItem, "materialId" | "quantity">[]): number {
  return material.stock + savedItems.filter((item) => item.materialId === material.id).reduce((sum, item) => sum + item.quantity, 0);
}
