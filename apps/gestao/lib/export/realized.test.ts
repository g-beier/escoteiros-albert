import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { CategoryItem } from "@/lib/categories";
import { buildRealizedModel, rowFilterTokens } from "./realized";
import { realizedWorkbook } from "./xlsx";

const cat = (id: string, code: string | null, name: string, parent_id: string | null, active = true, kind?: CategoryItem["kind"]): CategoryItem =>
  ({ id, code, name, parent_id, active, kind: kind !== undefined ? kind : code?.startsWith("1") ? "receita" : code ? "despesa" : null });

const categories = [
  cat("r", "1", "Receitas", null),
  cat("r1", "1.1", "Mensalidades", "r"),
  cat("r6", "1.6", "Programa", "r"),
  cat("r61", "1.6.1", "Acampamento", "r6"),
  cat("r62", "1.6.2", "Acantonamento", "r6"),
  cat("d", "2", "Despesas", null),
  cat("d1", "2.1", "Administrativas", "d"),
  cat("d9", "2.9", "Antiga sem uso", "d", false),
  cat("d8", "2.8", "Antiga com uso", "d", false),
  cat("old", null, "Rubrica antiga", null, false),
];

const sums = [
  { category_id: "r1", month: 1, amount_cents: 6000 },
  { category_id: "r61", month: 4, amount_cents: 14000 },
  { category_id: "r62", month: 4, amount_cents: 1000 },
  // rateio misto: ressarcimento (despesa) no mesmo mês da mensalidade
  { category_id: "d1", month: 1, amount_cents: -2000 },
  { category_id: "d8", month: 2, amount_cents: -500 },
  { category_id: "old", month: 3, amount_cents: -300 },
];

describe("buildRealizedModel", () => {
  const model = buildRealizedModel(categories, sums, 2026);
  const row = (id: string) => model.rows.find((r) => r.id === id)!;

  it("monta a árvore com pais somando os filhos", () => {
    expect(model.rows.map((r) => r.label)).toEqual([
      "1. Receitas", "1.1. Mensalidades", "1.6. Programa", "1.6.1. Acampamento", "1.6.2. Acantonamento",
      "2. Despesas", "2.1. Administrativas", "2.8. Antiga com uso", "Rubrica antiga (sem código)",
    ]);
    expect(row("r6").total[3]).toBe(15000);
    expect(row("r").total[0]).toBe(6000);
  });

  it("mostra despesas positivas e omite inativas sem movimento", () => {
    expect(row("d").total.slice(0, 3)).toEqual([2000, 500, 300]);
    expect(model.rows.some((r) => r.id === "d9")).toBe(false);
  });

  it("filtra cada linha pela própria rubrica (que cobre as filhas) e pelas adotadas", () => {
    const index = (id: string) => model.rows.findIndex((r) => r.id === id);
    expect(rowFilterTokens(model, index("r6"))).toEqual(["r6"]);
    // a rubrica antiga sem código e sem pai fica sob Despesas: entra à parte
    expect(rowFilterTokens(model, model.roots.despesa!)).toEqual(["d", "old"]);
    // sem a rubrica "2", a raiz é sintética: só as adotadas
    const synthetic = buildRealizedModel(categories.filter((c) => c.id !== "d"), sums, 2026);
    expect(synthetic.rows[synthetic.roots.despesa!].id).toBe("root-despesa");
    expect(rowFilterTokens(synthetic, synthetic.roots.despesa!)).toEqual(["d1", "d8", "old"]);
  });
});

describe("realizedWorkbook", () => {
  it("gera fórmulas SUM, total anual e saldo", async () => {
    const buffer = await realizedWorkbook(buildRealizedModel(categories, sums, 2026));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Realizado 2026")!;
    expect(sheet.getCell("B1").value).toBe("Realizado 2026");
    expect(sheet.getCell("C3").value).toBe("JAN");
    expect(sheet.getCell("O3").value).toBe("Total");
    // linha 4 = 1. Receitas; 6 = 1.6 Programa; 7 e 8 = filhos
    expect(sheet.getCell("B6").value).toBe("1.6. Programa");
    expect(sheet.getCell("F6").value).toMatchObject({ formula: "SUM(F7,F8)", result: 150 });
    expect(sheet.getCell("O4").value).toMatchObject({ formula: "SUM(C4:N4)", result: 210 });
    expect(sheet.getCell("C4").numFmt).toContain('"R$"');
    const saldoRow = sheet.getColumn(2).values.findIndex((v) => typeof v === "string" && v.startsWith("Saldo"));
    expect(sheet.getCell(saldoRow, 3).value).toMatchObject({ formula: "C4-C10", result: 40 });
  });
});
