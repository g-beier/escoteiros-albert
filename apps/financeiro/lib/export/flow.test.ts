import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import type { StatementRow } from "@/lib/entry-queries";
import { statementWorkbook } from "./xlsx";

const row = (entry_date: string, total_cents: number): StatementRow =>
  ({ entry_id: entry_date, entry_date, name: "Fulano", payment_method_name: "PIX", document: null, document_filed: false, total_cents });

it("fluxo por extrato: datas, valores e totais", async () => {
  const buffer = await statementWorkbook([row("2026-03-01", 9000), row("2026-03-31", -2500)], { from: "2026-03-01", to: "2026-03-31" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Fluxo por extrato")!;
  expect(sheet.getCell("A1").value).toBe("Fluxo de caixa por extrato — 01/03/2026 a 31/03/2026");
  expect(sheet.getCell("A4").value).toBe("Data");
  expect((sheet.getCell("A5").value as Date).toISOString().slice(0, 10)).toBe("2026-03-01");
  expect(sheet.getCell("F6").value).toBe(-25);
  expect(sheet.getCell("F8").value).toMatchObject({ formula: 'SUMIF(F5:F6,">0")', result: 90 });
  expect(sheet.getCell("F10").value).toMatchObject({ formula: "SUM(F5:F6)", result: 65 });
});
