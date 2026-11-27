import { describe, expect, it } from "vitest";
import { entrySchema, toRpcSplits } from "./entry-schema";

const id = "0b6c7a4e-5d1f-4c1e-9a8b-2f3d4e5f6a7b";
const base = {
  date: "2026-11-11",
  name: "Fulano de Tal (PIX)",
  paymentMethodId: id,
  accountId: id,
  document: "NF 1",
  documentFiled: false,
  totalCents: 10000,
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
    const splits = [
      { ...base.splits[0], amountCents: 12000 },
      { ...base.splits[1], amountCents: -3000 },
    ];
    expect(entrySchema.safeParse({ ...base, totalCents: 9000, splits }).success).toBe(true);
  });

  it("exige descrição por rubrica", () => {
    const result = entrySchema.safeParse({
      ...base,
      splits: [{ ...base.splits[0], amountCents: 10000, description: " " }],
    });
    expect(result.error?.issues[0]?.message).toBe("Descreva cada rubrica.");
  });

  it("exige histórico do lançamento", () => {
    expect(entrySchema.safeParse({ ...base, name: " a " }).error?.issues[0]?.message).toMatch(
      /histórico do lançamento/,
    );
  });

  it("exige forma de pagamento", () => {
    expect(entrySchema.safeParse({ ...base, paymentMethodId: "" }).error?.issues[0]?.message).toBe(
      "Escolha a forma de pagamento.",
    );
  });
});

describe("toRpcSplits", () => {
  it("converte para o formato da função SQL", () => {
    expect(toRpcSplits(base.splits)[1]).toEqual({
      category_id: id,
      amount_cents: 2000,
      description: "Lanche",
      associate_id: null,
      debt_id: null,
      items: [],
    });
  });
  it("linhas de dívida vão depois, como kind divida", () => {
    const rpc = toRpcSplits(base.splits, [
      { debtId: null, categoryId: id, description: "Lenço", associateId: id, amountCents: 2000 },
    ]);
    expect(rpc[2]).toEqual({
      kind: "divida",
      debt_id: null,
      category_id: id,
      description: "Lenço",
      associate_id: id,
      amount_cents: 2000,
    });
  });
  it("leva os itens vendidos", () => {
    const split = { ...base.splits[1], items: [{ lotId: id, quantity: 2, unitPriceCents: 1000 }] };
    expect((toRpcSplits([split])[0] as { items: unknown }).items).toEqual([
      { lot_id: id, quantity: 2, unit_price_cents: 1000 },
    ]);
  });
});

describe("itens vendidos", () => {
  const withItems = (unitPriceCents: number) => ({
    ...base,
    splits: [base.splits[0], { ...base.splits[1], items: [{ lotId: id, quantity: 2, unitPriceCents }] }],
  });
  it("a soma tem de dar o valor do rateio", () => {
    expect(entrySchema.safeParse(withItems(1000)).success).toBe(true);
    expect(entrySchema.safeParse(withItems(900)).error?.issues[0]?.message).toMatch(/itens vendidos/);
  });
});

describe("observações", () => {
  it("são opcionais e limitadas a 2.000 caracteres", () => {
    expect(entrySchema.safeParse({ ...base, notes: "" }).success).toBe(true);
    expect(entrySchema.safeParse({ ...base, notes: "Pago na reunião de pais" }).success).toBe(true);
    expect(entrySchema.safeParse({ ...base, notes: "x".repeat(2001) }).error?.issues[0]?.message).toMatch(
      /2\.000 caracteres/,
    );
  });
});
