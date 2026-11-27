import type { CategoryItem } from "./categories";

// Lojinha (019, 021): itens vendidos num rateio de rubrica marcada "venda de itens" dão baixa no lote do Inventário.

/**
 * Lote oferecido no lançamento (`finance_sale_lots`): à venda com saldo, ou já vendido em algum lançamento (para editar
 * os antigos), com material, variação, divisão e preço do lote.
 */
export type SaleLot = {
  id: string; material_id: string; material_name: string; variant: string | null; location_path: string | null;
  for_sale: boolean; sale_price_cents: number | null; quantity: number;
};

/** Item vendido num rateio: o lote, a quantidade e o preço unitário (centavos). */
export type SaleItem = { lotId: string; quantity: number; unitPriceCents: number };

/** "Anel de lenço · couro" (material e variação do lote). */
export const saleLotName = (lot: Pick<SaleLot, "material_name" | "variant">) => (lot.variant ? `${lot.material_name} · ${lot.variant}` : lot.material_name);

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

/**
 * Linhas de dívida sem lançamento no caixa (024): "Nova dívida" em Devedores e lançamento sem valor recebido. Com itens
 * vendidos, o valor é a soma deles e o estoque baixa na hora.
 */
export type DebtLinesInput = {
  date: string;
  lines: { associateId: string; categoryId: string; description: string; amountCents: number | null; items: SaleItem[] }[];
};

/** Soma dos itens (quantidade × preço). */
export function saleItemsTotal(items: Pick<SaleItem, "quantity" | "unitPriceCents">[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}

/**
 * Quantidade disponível no lote para o lançamento: saldo de hoje mais o que este lançamento já tinha vendido dele (ao
 * editar, o que já saiu volta antes de sair de novo).
 */
export function availableFor(lot: Pick<SaleLot, "id" | "quantity">, savedItems: Pick<SaleItem, "lotId" | "quantity">[]): number {
  return lot.quantity + savedItems.filter((item) => item.lotId === lot.id).reduce((sum, item) => sum + item.quantity, 0);
}

/** Balanço da venda numa rubrica (025): itens vendidos = recebido no caixa (rateios) + a pagar (linhas de dívida). */
export type SaleBalance = { categoryId: string; itemsCents: number; receivedCents: number; owedCents: number; missingCents: number };

/**
 * Por rubrica com itens vendidos no lançamento: soma dos itens, do que entrou nos rateios dessa rubrica e das linhas de
 * dívida dela; `missingCents` = itens − recebido − a pagar (positivo: falta lançar; negativo: passou). Sem casar associado.
 */
export function saleBalance(
  splits: { categoryId: string; amountCents: number; itemsCents: number }[],
  debtLines: { categoryId: string; amountCents: number }[],
): SaleBalance[] {
  const categories = [...new Set(splits.filter((s) => s.itemsCents > 0).map((s) => s.categoryId))];
  return categories.map((categoryId) => {
    const itemsCents = splits.filter((s) => s.categoryId === categoryId).reduce((sum, s) => sum + s.itemsCents, 0);
    const receivedCents = splits.filter((s) => s.categoryId === categoryId).reduce((sum, s) => sum + s.amountCents, 0);
    const owedCents = debtLines.filter((l) => l.categoryId === categoryId).reduce((sum, l) => sum + l.amountCents, 0);
    return { categoryId, itemsCents, receivedCents, owedCents, missingCents: itemsCents - receivedCents - owedCents };
  });
}
