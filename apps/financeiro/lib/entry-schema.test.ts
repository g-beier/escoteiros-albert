import { describe, expect, it } from "vitest";
import { entrySchema, toRpcSplits } from "./entry-schema";

const id = "0b6c7a4e-5d1f-4c1e-9a8b-2f3d4e5f6a7b";
const base = {
  date: "2026-11-11", name: "Fulano de Tal (PIX)", paymentMethodId: id, accountId: id, document: "NF 1", documentFiled: false, totalCents: 10000,
  splits: [
    { categoryId: id, amountCents: 8000, description: "Mensalidade", associateId: id },
    { categoryId: id, amountCents: 2000, description: "Lanche", associateId: null },
  ],
};

describe("entrySchema", () => {
  it("aceita lançamento balanceado", () => expect(entrySchema.safeParse(base).success).toBe(true));

  it("rejeita soma divergente", () => {
    const result = entrySchema.safeParse({ ...base, totalCents: 9999 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/soma das rubricas/);
  });

  it("aceita receitas e despesas no mesmo lançamento", () => {
    const splits = [{ ...base.splits[0], amountCents: 12000 }, { ...base.splits[1], amountCents: -3000 }];
    expect(entrySchema.safeParse({ ...base, totalCents: 9000, splits }).success).toBe(true);
  });

  it("exige descrição por rubrica", () => {
    const result = entrySchema.safeParse({ ...base, splits: [{ ...base.splits[0], amountCents: 10000, description: " " }] });
    expect(result.error?.issues[0]?.message).toBe("Descreva cada rubrica.");
  });

  it("exige histórico do lançamento", () => {
    expect(entrySchema.safeParse({ ...base, name: " a " }).error?.issues[0]?.message).toMatch(/histórico do lançamento/);
  });

  it("exige forma de pagamento", () => {
    expect(entrySchema.safeParse({ ...base, paymentMethodId: "" }).error?.issues[0]?.message).toBe("Escolha a forma de pagamento.");
  });
});

describe("toRpcSplits", () => {
  it("converte para o formato da função SQL", () => {
    expect(toRpcSplits(base.splits)[1]).toEqual({ category_id: id, amount_cents: 2000, description: "Lanche", associate_id: null });
  });
});
