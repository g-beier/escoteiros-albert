import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { cleanupE2eGroup } from "./support/db";
import { E2E_ACCOUNTS } from "./support/env";
import { createEntry, uniqueName } from "./support/entries";

// Exportações (/financeiro/exportar/*): tipo, nome do arquivo e conteúdo mínimo de cada formato, com a sessão do administrador E2E.
// Usa um ano antigo para o arquivo ter só o lançamento deste teste.
const YEAR = 2003;
const name = uniqueName("Exportação");
test.afterAll(() => cleanupE2eGroup());

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await createEntry(page, { name, direction: "saida", date: `${YEAR}-03-15`, total: "40,00", account: E2E_ACCOUNTS[0], category: "Telefone", description: "conta de março" });
  await page.close();
});

/** Todas as células de texto da primeira planilha. */
async function sheetText(body: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(body as unknown as ArrayBuffer);
  const values: string[] = [];
  book.worksheets[0].eachRow((row) => row.eachCell((cell) => values.push(String(cell.text))));
  return values;
}

test("fluxo de caixa: XLSX e CSV com o lançamento do período", async ({ request }) => {
  const period = `de=${YEAR}-01-01&ate=${YEAR}-12-31`;
  const xlsx = await request.get(`/financeiro/exportar/fluxo?visao=movimentacoes&${period}`);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect(xlsx.headers()["content-disposition"]).toMatch(/^attachment; filename=".+\.xlsx"$/);
  expect(await sheetText(await xlsx.body())).toContain(name);

  const csv = await request.get(`/financeiro/exportar/fluxo?visao=detalhamento&${period}&formato=csv&codificacao=utf-8`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  const text = await csv.text();
  expect(text.split(/\r?\n/)[0]).toContain("Histórico");
  expect(text).toContain(name);
  expect(text).toContain("conta de março");

  const invalid = await request.get("/financeiro/exportar/fluxo?de=2003-12-31&ate=2003-01-01");
  expect(invalid.status()).toBe(400);
});

test("realizado: XLSX do ano", async ({ request }) => {
  const response = await request.get(`/financeiro/exportar/realizado?ano=${YEAR}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect((await sheetText(await response.body())).some((value) => value.endsWith("Telefone"))).toBe(true);
});

test("contábil: recusa rubrica sem conta contábil e gera o CSV de um período válido", async ({ request }) => {
  const refused = await request.get(`/financeiro/exportar/contabil?de=${YEAR}-01-01&ate=${YEAR}-12-31`);
  expect(refused.status()).toBe(422);
  expect((await refused.json()).error).toMatch(/^Rubricas sem conta contábil: .*Telefone/);

  // período sem lançamentos: só o cabeçalho, na codificação padrão do sistema contábil
  const empty = await request.get(`/financeiro/exportar/contabil?de=${YEAR - 1}-01-01&ate=${YEAR - 1}-01-31`);
  expect(empty.status()).toBe(200);
  expect(empty.headers()["content-type"]).toBe("text/csv; charset=windows-1252");
  expect(empty.headers()["content-disposition"]).toBe(`attachment; filename="contabil_${YEAR - 1}-01-01_${YEAR - 1}-01-31.csv"`);
  expect(new TextDecoder("windows-1252").decode(await empty.body())).toMatch(/^Data;Conta débito;Conta crédito;Valor/);
});

test("transparência: JSON do Realizado para o site", async ({ request }) => {
  const response = await request.get(`/financeiro/exportar/transparencia?ano=${YEAR}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toBe(`attachment; filename="prestacao-contas-${YEAR}.json"`);
  const report = await response.json();
  expect(report).toMatchObject({ version: 1, year: YEAR, periodEnd: `${YEAR}-12-31` });
  const phone = report.rows.find((row: { name: string }) => row.name === "Telefone");
  expect(phone).toBeDefined();
  expect(JSON.stringify(phone.months)).toMatch(/-?4000\b/);

  expect((await request.get("/financeiro/exportar/transparencia?ano=1999")).status()).toBe(400);
});
