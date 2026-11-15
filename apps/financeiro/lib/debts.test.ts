import { describe, expect, it } from "vitest";
import { debtOpenCents, debtStatus, debtTotals, distributePayment, groupDebts, groupPaymentOptions, optionFreeCents, type Debt } from "./debts";

const debt = (amountCents: number, paidCents: number, debtorNumber = 1, associateName: string | null = null): Debt => ({
  id: `${amountCents}-${paidCents}-${debtorNumber}`, date: "2026-03-01", amountCents, paidCents, description: "x", agreement: null,
  associateId: associateName && `id-${associateName}`, associateName, debtorNumber, payments: null, paymentMismatch: null,
});

describe("debts", () => {
  it("status and open amount", () => {
    expect(debtStatus(debt(5000, 0))).toBe("aberta");
    expect(debtStatus(debt(5000, 3000))).toBe("parcial");
    expect(debtStatus(debt(5000, 5000))).toBe("quitada");
    expect(debtStatus(debt(5000, 6000))).toBe("quitada");
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

  it("payment options: revenue per entry, newest first, with allocations and free amount", () => {
    const options = groupPaymentOptions([
      { entry_id: "a", entry_date: "2026-04-10", entry_name: "Ana", amount_cents: 1000 },
      { entry_id: "b", entry_date: "2026-05-10", entry_name: "Ana e Bia", amount_cents: 24000 },
      { entry_id: "a", entry_date: "2026-04-10", entry_name: "Ana", amount_cents: 500 },
    ], [{ entry_id: "b", debt_id: "lanche", amount_cents: 1000 }]);
    expect(options.map((o) => [o.entryId, o.availableCents])).toEqual([["b", 24000], ["a", 1500]]);
    expect(optionFreeCents(options[0])).toBe(23000);
    expect(optionFreeCents(options[0], "lanche")).toBe(24000);
  });

  it("distributes a payment oldest first, up to what each debt owes", () => {
    expect(distributePayment(24000, [{ id: "lanche", owedCents: 1000 }, { id: "acampamento", owedCents: 23000 }]))
      .toEqual([{ debtId: "lanche", amountCents: 1000 }, { debtId: "acampamento", amountCents: 23000 }]);
    expect(distributePayment(5000, [{ id: "a", owedCents: 3000 }, { id: "b", owedCents: 0 }, { id: "c", owedCents: 4000 }]))
      .toEqual([{ debtId: "a", amountCents: 3000 }, { debtId: "c", amountCents: 2000 }]);
    expect(distributePayment(30000, [{ id: "a", owedCents: 1000 }])).toEqual([{ debtId: "a", amountCents: 1000 }]);
  });

  it("debtor credit: unallocated revenue of linked entries, counted once per entry", () => {
    const pay = (entryId: string, unallocated: number) => ({ entryId, entryDate: "2026-05-01", entryName: "x", amountCents: 1, paidCents: 1, entryAvailableCents: 1, entryUnallocatedCents: unallocated });
    const groups = groupDebts([
      { ...debt(1000, 1000, 1, "Ana"), payments: [pay("e", 500)] },
      { ...debt(2000, 1000, 1, "Ana"), id: "outra", payments: [pay("e", 500), pay("f", -100)] },
    ]);
    expect(groups[0].creditCents).toBe(500);
  });
});
