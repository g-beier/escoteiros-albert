import { describe, expect, it } from "vitest";
import { debtOpenCents, debtOriginLabel, debtStatus, debtTotals, groupDebts, type Debt } from "./debts";

const debt = (amountCents: number, paidCents: number, debtorNumber = 1, associateName: string | null = null): Debt => ({
  id: `${amountCents}-${paidCents}-${debtorNumber}`, date: "2026-03-01", amountCents, paidCents, description: "x", agreement: null,
  associateId: associateName && `id-${associateName}`, associateName, debtorNumber, payments: null,
  categoryId: "c", categoryLabel: "1.2 Atividades", origin: "manual", originEntryId: null, feeYear: null, feeMonth: null,
});

describe("debts", () => {
  it("status and open amount", () => {
    expect(debtStatus(debt(5000, 0))).toBe("aberta");
    expect(debtStatus(debt(5000, 3000))).toBe("parcial");
    expect(debtStatus(debt(5000, 5000))).toBe("quitada");
    expect(debtOpenCents(debt(5000, 6000))).toBe(0);
  });

  it("totals count only what is still owed", () => {
    expect(debtTotals([debt(5000, 3000), debt(1000, 0), debt(2000, 2500)])).toEqual({ openCount: 2, openCents: 3000, paidCents: 5000 });
  });

  it("groups by debtor, who owes most first; viewers get anonymous labels", () => {
    const groups = groupDebts([debt(1000, 0, 1, "Bia"), debt(5000, 1000, 2, "Ana"), debt(2000, 0, 1, "Bia"), debt(500, 500, 3, "Caio")]);
    expect(groups.map((g) => [g.label, g.openCents, g.openCount, g.debts.length])).toEqual([["Ana", 4000, 1, 1], ["Bia", 3000, 2, 2], ["Caio", 0, 0, 1]]);
    expect(groupDebts([debt(100, 100, 2), debt(100, 100, 1)]).map((g) => g.label)).toEqual(["Devedor 1", "Devedor 2"]);
  });

  it("origin label", () => {
    expect(debtOriginLabel({ origin: "mensalidade", feeYear: 2026, feeMonth: 4 })).toBe("Mensalidade abr./2026");
    expect(debtOriginLabel({ origin: "venda", feeYear: null, feeMonth: null })).toBe("Venda a pagar");
  });
});
