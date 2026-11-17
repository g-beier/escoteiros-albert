import { describe, expect, it } from "vitest";
import { monthlyTotals, nextDay, recentListStart, recentWindowStart } from "./dashboard";

describe("recentWindowStart", () => {
  it("volta 7 dias", () => {
    expect(recentWindowStart("2026-11-12")).toBe("2026-11-05");
  });
  it("atravessa mês e ano", () => {
    expect(recentWindowStart("2026-03-03")).toBe("2026-02-24");
    expect(recentWindowStart("2027-01-02")).toBe("2026-12-26");
  });
});

describe("recentListStart", () => {
  it("inclui o último dia com lançamentos antes da janela", () => {
    expect(recentListStart("2026-11-05", "2026-11-01")).toBe("2026-11-01");
  });
  it("sem lançamento anterior, fica na janela", () => {
    expect(recentListStart("2026-11-05", null)).toBe("2026-11-05");
  });
});

describe("monthlyTotals", () => {
  it("separa receitas e despesas pelo tipo da rubrica, e pelo sinal quando não há tipo", () => {
    const kinds = new Map<string, "receita" | "despesa" | null>([["r", "receita"], ["d", "despesa"], ["x", null]]);
    const months = monthlyTotals([
      { category_id: "r", month: 1, amount_cents: 1000 },
      { category_id: "d", month: 1, amount_cents: -400 },
      { category_id: "x", month: 2, amount_cents: -50 },
      { category_id: "x", month: 2, amount_cents: 70 },
    ], kinds);
    expect(months[0]).toEqual({ income: 1000, expense: 400 });
    expect(months[1]).toEqual({ income: 70, expense: 50 });
    expect(months).toHaveLength(12);
  });
});

describe("nextDay", () => {
  it("atravessa mês e ano", () => {
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
