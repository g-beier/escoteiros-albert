import { describe, expect, it } from "vitest";
import { availableFor, categorySellsItems, saleItemsTotal, saleLotName } from "./sales";

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
  it("disponível ao editar inclui o que o lançamento já vendeu do lote", () => {
    expect(availableFor({ id: "a", quantity: 4 }, [{ lotId: "a", quantity: 3 }, { lotId: "b", quantity: 9 }])).toBe(7);
  });
  it("nome do lote com a variação", () => {
    expect(saleLotName({ material_name: "Anel de lenço", variant: "couro" })).toBe("Anel de lenço · couro");
    expect(saleLotName({ material_name: "Lenço", variant: null })).toBe("Lenço");
  });
});
