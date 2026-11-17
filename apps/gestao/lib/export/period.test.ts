import { describe, expect, it } from "vitest";
import { describePeriod, isIsoDate, periodBounds } from "./period";

describe("periodBounds", () => {
  it("mês com último dia correto, inclusive fevereiro bissexto", () => {
    expect(periodBounds({ kind: "mes", year: 2028, month: 2 })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodBounds({ kind: "mes", year: 2026, month: 2 })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds({ kind: "mes", year: 2026, month: 12 })).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("ano inteiro", () => expect(periodBounds({ kind: "ano", year: 2026 })).toEqual({ from: "2026-01-01", to: "2026-12-31" }));

  it("personalizado mantém as datas-limite e aceita um único dia", () => {
    expect(periodBounds({ kind: "personalizado", from: "2026-03-10", to: "2026-03-10" })).toEqual({ from: "2026-03-10", to: "2026-03-10" });
  });

  it("rejeita personalizado invertido ou inválido", () => {
    expect(periodBounds({ kind: "personalizado", from: "2026-03-10", to: "2026-03-09" })).toBeNull();
    expect(periodBounds({ kind: "personalizado", from: "2026-02-30", to: "2026-03-09" })).toBeNull();
    expect(periodBounds({ kind: "personalizado", from: "", to: "2026-03-09" })).toBeNull();
  });
});

it("isIsoDate e describePeriod", () => {
  expect(isIsoDate("2026-11-11")).toBe(true);
  expect(isIsoDate("2026-13-01")).toBe(false);
  expect(describePeriod({ from: "2026-03-01", to: "2026-03-31" })).toBe("01/03/2026 a 31/03/2026");
});
