import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import type { LedgerRow } from "@/lib/entry-queries";
import { LEDGER_EXPORT_COLUMNS } from "./columns";
import { toCsv } from "./csv";
import { ledgerWorkbook } from "./xlsx";

const row = (entry_date: string, total_cents: number, external_ids: string[] = []): LedgerRow =>
  ({ entry_id: entry_date, entry_date, name: "Fulano", account_name: "Conta corrente", payment_method_name: "PIX", document: null, document_filed: false, total_cents, external_ids });

it("fluxo, movimentações: datas, valores, ID OFX e totais", async () => {
  const buffer = await ledgerWorkbook([row("2026-03-01", 9000, ["FIT-1"]), row("2026-03-31", -2500)], { from: "2026-03-01", to: "2026-03-31" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Movimentações")!;
  expect(sheet.getCell("A1").value).toBe("Fluxo de caixa: movimentações — 01/03/2026 a 31/03/2026");
  expect(sheet.getCell("A4").value).toBe("Data");
  expect((sheet.getCell("A5").value as Date).toISOString().slice(0, 10)).toBe("2026-03-01");
  expect(sheet.getCell("C5").value).toBe("Conta corrente");
  expect(sheet.getCell("G5").value).toBe("FIT-1");
  expect(sheet.getCell("H6").value).toBe(-25);
  expect(sheet.getCell("H8").value).toMatchObject({ formula: 'SUMIF(H5:H6,">0")', result: 90 });
  expect(sheet.getCell("H10").value).toMatchObject({ formula: "SUM(H5:H6)", result: 65 });
});

it("fluxo em CSV usa as mesmas colunas", () => {
  expect(toCsv(LEDGER_EXPORT_COLUMNS, [row("2026-03-01", -123456, ["FIT-1"])])).toBe(
    "Data;Histórico;Conta;Forma pgto;Documento;Documentos;ID OFX;Valor\r\n" +
    "01/03/2026;Fulano;Conta corrente;PIX;;Pendente;FIT-1;-1234,56\r\n",
  );
});
