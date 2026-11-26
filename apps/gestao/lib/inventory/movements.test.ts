import { describe, expect, it } from "vitest";
import { movementDetail, saleEntryId, signedQuantity } from "./movements";

const base = { from_condition: null, to_condition: null, write_off_reason: null, details: {}, quantity: null } as const;

describe("detalhe do movimento", () => {
  it("condição de → para", () => expect(movementDetail({ ...base, kind: "condicao", from_condition: "bom", to_condition: "manutencao" })).toBe("Bom → Em manutenção"));
  it("ajuste de → para, com sinal na quantidade", () => {
    const row = { ...base, kind: "ajuste" as const, quantity: 5, details: { from: 5, to: 10 } };
    expect(movementDetail(row)).toBe("5 → 10");
    expect(signedQuantity(row)).toBe("+5");
    expect(signedQuantity({ ...row, details: { from: 8, to: 6 } })).toBe("−2");
  });
  it("edição do material lista o que mudou", () => {
    const details = { action: "material_updated", before: { name: "Caneca", minimum_quantity: 5, active: true, family_id: null }, after: { name: "Caneca", minimum_quantity: 8, active: false, family_id: null } };
    expect(movementDetail({ ...base, kind: "edicao", details })).toBe("Material editado: Mínimo: 5 → 8 · Inativado");
    expect(movementDetail({ ...base, kind: "edicao", details: { action: "lot_updated" } })).toBe("Dados do lote editados");
  });
  it("baixa mostra o motivo; entrada, a condição", () => {
    expect(movementDetail({ ...base, kind: "baixa", write_off_reason: "perda" })).toBe("Perda");
    expect(movementDetail({ ...base, kind: "entrada", to_condition: "novo" })).toBe("Novo");
  });
});

describe("saleEntryId (Lojinha)", () => {
  const row = (kind: "baixa" | "entrada" | "ajuste", write_off_reason: "venda" | "consumo" | null, details: Record<string, unknown>) =>
    ({ kind, write_off_reason, details });
  it("só baixa de venda e devolução de venda levam ao lançamento", () => {
    expect(saleEntryId(row("baixa", "venda", { entry_id: "e1" }))).toBe("e1");
    expect(saleEntryId(row("entrada", null, { sale_return: true, entry_id: "e1" }))).toBe("e1");
    expect(saleEntryId(row("baixa", "consumo", { entry_id: "e1" }))).toBeNull();
    expect(saleEntryId(row("entrada", null, { entry_id: "e1" }))).toBeNull();
    expect(saleEntryId(row("baixa", "venda", {}))).toBeNull();
  });
});

describe("lotSale (Lojinha)", () => {
  const sale = (before: object, after: object) => movementDetail({ ...base, kind: "edicao", details: { action: "lot_sale", before, after } }).replace(/\s/g, " ");
  it("descreve pôr à venda, mudar preço e tirar", () => {
    expect(sale({ for_sale: false }, { for_sale: true, sale_price_cents: 2500 })).toBe("Lojinha: à venda por R$ 25,00");
    expect(sale({ for_sale: true, sale_price_cents: 2000 }, { for_sale: true, sale_price_cents: 2500 })).toBe("Lojinha: preço R$ 20,00 → R$ 25,00");
    expect(sale({ for_sale: true, sale_price_cents: 2000 }, { for_sale: false, sale_price_cents: null })).toBe("Lojinha: fora da venda");
  });
});
