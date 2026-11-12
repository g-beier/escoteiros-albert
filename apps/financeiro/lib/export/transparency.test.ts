import { describe, expect, it } from "vitest";
import type { CategoryItem } from "@/lib/categories";
import { buildRealizedModel } from "./realized";
import { buildTransparencyReport, UNDETAILED } from "./transparency";

const categories: CategoryItem[] = [
  { id: "r", code: "1", name: "Receitas", parent_id: null, active: true, kind: "receita" },
  { id: "r1", code: "1.1", name: "Mensalidades", parent_id: "r", active: true, kind: "receita" },
  { id: "d1", code: "2.1", name: "Administrativas", parent_id: null, active: true, kind: "despesa" },
];
const sums = [
  { category_id: "r1", month: 3, amount_cents: 6000 },
  { category_id: "d1", month: 3, amount_cents: -2500 },
];

describe("buildTransparencyReport", () => {
  const model = buildRealizedModel(categories, sums, 2026);

  it("publica as linhas do Realizado com código, nome e meses (despesas positivas)", () => {
    const report = buildTransparencyReport(model, new Date("2026-11-12T15:00:00Z"));
    expect(report.rows.map(({ code, name, kind, depth }) => ({ code, name, kind, depth }))).toEqual([
      { code: "1", name: "Receitas", kind: "receita", depth: 0 },
      { code: "1.1", name: "Mensalidades", kind: "receita", depth: 1 },
      { code: "2", name: "Despesas", kind: "despesa", depth: 0 },
      { code: "2.1", name: "Administrativas", kind: "despesa", depth: 1 },
    ]);
    expect(report.rows[0].months[2]).toBe(6000);
    expect(report.rows[2].months[2]).toBe(2500);
    expect(report.rows.every((r) => r.months.length === 12)).toBe(true);
  });

  it("não leva nada além de rubricas e valores", () => {
    const report = buildTransparencyReport(model, new Date("2026-11-12T15:00:00Z"));
    expect(Object.keys(report).sort()).toEqual(["generatedAt", "periodEnd", "rows", "version", "year"]);
    expect(Object.keys(report.rows[0]).sort()).toEqual(["code", "depth", "kind", "months", "name"]);
  });

  it("valor lançado direto num grupo vira a linha 'Sem rubrica detalhada', para o grupo fechar com as filhas", () => {
    const report = buildTransparencyReport(buildRealizedModel(categories, [...sums, { category_id: "r", month: 5, amount_cents: 1000 }], 2026));
    expect(report.rows.slice(0, 3).map((r) => [r.code, r.name, r.depth])).toEqual([["1", "Receitas", 0], ["1.1", "Mensalidades", 1], [null, UNDETAILED, 1]]);
    expect(report.rows[2].months[4]).toBe(1000);
    for (const parent of report.rows.filter((r) => r.depth === 0)) {
      const start = report.rows.indexOf(parent);
      const end = report.rows.findIndex((r, i) => i > start && r.depth === 0);
      const children = report.rows.slice(start + 1, end < 0 ? undefined : end).filter((r) => r.depth === 1);
      expect(children.reduce((acc, r) => acc.map((v, m) => v + r.months[m]), Array(12).fill(0))).toEqual(parent.months);
    }
  });

  it("ano em curso vai até hoje (fuso de São Paulo); ano encerrado, até 31/12", () => {
    expect(buildTransparencyReport(model, new Date("2026-11-13T01:00:00Z")).periodEnd).toBe("2026-11-12");
    expect(buildTransparencyReport(model, new Date("2027-02-01T12:00:00Z")).periodEnd).toBe("2026-12-31");
  });
});
