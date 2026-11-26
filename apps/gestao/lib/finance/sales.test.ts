import { describe, expect, it } from "vitest";
import { availableFor, categorySellsItems, saleItemsTotal } from "./sales";

describe("Lojinha", () => {
  const categories = [
    { id: "r", parent_id: null, sells_items: false },
    { id: "loja", parent_id: "r", sells_items: true },
    { id: "lencos", parent_id: "loja", sells_items: false },
    { id: "doacoes", parent_id: "r", sells_items: false },
  ];
  it("a marca vale para as filhas", () => {
    expect(["r", "loja", "lencos", "doacoes", "x"].map((id) => categorySellsItems(id, categories))).toEqual([false, true, true, false, false]);
  });
  it("soma dos itens", () => {
    expect(saleItemsTotal([{ quantity: 3, unitPriceCents: 2000 }, { quantity: 2, unitPriceCents: 500 }])).toBe(7000);
  });
  it("disponível ao editar inclui o que o lançamento já vendeu", () => {
    expect(availableFor({ id: "a", stock: 4 }, [{ materialId: "a", quantity: 3 }, { materialId: "b", quantity: 9 }])).toBe(7);
  });
});
