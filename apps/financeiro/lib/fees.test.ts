import { describe, expect, it } from "vitest";
import { brazilHolidays, buildFeeRows, cellState, feeAmounts, dueDate, easter, monthSummary, overdueRanking, suggestFeeMonths, todayInSaoPaulo, type FeeSplit } from "./fees";

describe("feriados", () => {
  it("calcula a Páscoa e os feriados móveis", () => {
    expect(easter(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    const holidays = brazilHolidays(2026);
    for (const day of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-04-21", "2026-11-20"]) expect(holidays.has(day)).toBe(true);
  });
});

describe("dueDate", () => {
  it("dia fixo, mesmo caindo no domingo", () => {
    expect(dueDate(2026, 5, { dueRule: "dia_fixo", dueDay: 10 })).toBe("2026-05-10");
  });
  it("fim do mês", () => {
    expect(dueDate(2026, 4, { dueRule: "fim_do_mes", dueDay: 10 })).toBe("2026-04-30");
    expect(dueDate(2028, 2, { dueRule: "fim_do_mes", dueDay: 10 })).toBe("2028-02-29");
  });
  it("N-ésimo dia útil pula fins de semana e feriados", () => {
    // março/2026 começa num domingo: 1º dia útil = 02/03; 10º = 13/03
    expect(dueDate(2026, 3, { dueRule: "dia_util", dueDay: 1 })).toBe("2026-03-02");
    expect(dueDate(2026, 3, { dueRule: "dia_util", dueDay: 10 })).toBe("2026-03-13");
    // abril/2026: Sexta-feira Santa (03/04) e Tiradentes (21/04)
    expect(dueDate(2026, 4, { dueRule: "dia_util", dueDay: 2 })).toBe("2026-04-02");
    expect(dueDate(2026, 4, { dueRule: "dia_util", dueDay: 3 })).toBe("2026-04-06");
    expect(dueDate(2026, 4, { dueRule: "dia_util", dueDay: 14 })).toBe("2026-04-22");
  });
});

describe("cellState", () => {
  const record = { associateId: "a", month: 3, status: "pago" as const, note: null, splitIds: [] };
  it("registro manda; sem registro, atrasado só depois do vencimento", () => {
    expect(cellState(record, "2026-03-10", "2026-05-01", false)).toBe("pago");
    expect(cellState({ ...record, status: "atencao" }, "2026-03-10", "2026-03-01", false)).toBe("atencao");
    expect(cellState(undefined, "2026-03-10", "2026-03-10", false)).toBe("vazio");
    expect(cellState(undefined, "2026-03-10", "2026-03-11", false)).toBe("atrasado");
    expect(cellState(undefined, "2026-03-10", "2026-03-11", true)).toBe("sugestao");
  });
  it("hoje no fuso de São Paulo", () => {
    expect(todayInSaoPaulo(new Date("2026-03-11T02:00:00Z"))).toBe("2026-03-10");
  });
});

describe("suggestFeeMonths", () => {
  const split = (splitId: string, associateId: string, entryDate: string, linkedPeriods: number[] = []): FeeSplit =>
    ({ splitId, associateId, entryId: "e", entryDate, amountCents: 3000, description: "", linkedPeriods });
  it("usa o mês do lançamento; se ocupado ou fora de março–dezembro, o primeiro livre", () => {
    const result = suggestFeeMonths(2026, [
      split("s1", "a", "2026-04-08"), split("s2", "a", "2026-04-20"), split("s3", "b", "2026-01-15"),
      split("s4", "b", "2026-05-02", [202605]), split("s5", "c", "2025-12-01"),
    ], [{ associateId: "a", month: 3, status: "pago", note: null, splitIds: [] }]);
    expect(result).toEqual([
      { associateId: "b", month: 3, splitId: "s3" },
      { associateId: "a", month: 4, splitId: "s1" },
      { associateId: "a", month: 5, splitId: "s2" },
    ]);
  });
});

describe("monthSummary", () => {
  it("conta pagos, atenção e atrasados por mês", () => {
    const row = (first: string) => [first, ...Array(9).fill("vazio")] as never;
    expect(monthSummary([row("pago"), row("atrasado"), row("atrasado"), row("sugestao")])[0]).toEqual({ pago: 1, atencao: 0, atrasado: 2 });
  });
});

describe("buildFeeRows e overdueRanking", () => {
  const associates = [
    { id: "c", name: "Carla", branch: "adulto", section: null, active: true },
    { id: "a", name: "ana", branch: "lobinho", section: "Alcateia", active: true },
    { id: "b", name: "Bruno", branch: "escoteiro", section: null, active: false },
    { id: "d", name: "Davi", branch: "senior", section: null, active: true },
  ];
  const rows = buildFeeRows({
    year: 2026, today: "2026-05-20", settings: { dueRule: "dia_fixo", dueDay: 10, categoryId: null }, associates,
    records: [{ associateId: "a", month: 3, status: "pago", note: null, splitIds: [] }, { associateId: "b", month: 3, status: "pago", note: null, splitIds: [] }],
    exemptions: [{ associateId: "d", reason: "Voluntário" }],
    suggestions: [{ associateId: "c", month: 4, splitId: "s" }],
  });
  it("ordena por nome, inclui inativo com registro e calcula estados", () => {
    expect(rows.map((r) => r.associate.name)).toEqual(["ana", "Bruno", "Carla", "Davi"]);
    expect(rows[0].cells.slice(0, 4).map((c) => c.state)).toEqual(["pago", "atrasado", "atrasado", "vazio"]);
    expect(rows[2].cells.slice(0, 3).map((c) => c.state)).toEqual(["atrasado", "sugestao", "atrasado"]);
    expect(rows[3].overdue).toBe(0);
  });
  it("ranking de atrasos em ordem decrescente, sem isentos", () => {
    expect(overdueRanking(rows).map((r) => [r.associate.name, r.overdue])).toEqual([["ana", 2], ["Bruno", 2], ["Carla", 2]]);
  });
});

describe("feeAmounts", () => {
  it("soma por associado e por mês do lançamento; jan/fev fora da grade; outro ano não conta", () => {
    const split = (associateId: string, entryDate: string, amountCents: number): FeeSplit =>
      ({ splitId: `${associateId}${entryDate}`, associateId, entryId: "e", entryDate, amountCents, description: "", linkedPeriods: [] });
    const result = feeAmounts(2026, {
      a: [split("a", "2026-03-08", 9000), split("a", "2026-04-02", 3000)],
      b: [split("b", "2026-02-10", 3000), split("b", "2025-12-20", 3000)],
    });
    expect(result.byAssociate).toEqual({ a: 12000, b: 3000 });
    expect(result.byMonth.slice(0, 2)).toEqual([9000, 3000]);
    expect(result.outsideGrid).toBe(3000);
    expect([result.total, result.count]).toEqual([15000, 3]);
  });
});
