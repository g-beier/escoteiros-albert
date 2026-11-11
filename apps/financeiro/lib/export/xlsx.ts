import ExcelJS from "exceljs";
import type { SplitRow, StatementRow } from "@/lib/entry-queries";
import { describePeriod, MONTHS_SHORT, type Period } from "./period";
import type { RealizedModel, RealizedRow } from "./realized";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const FONT = "Arial";
const argb = (hex: string) => ({ argb: `FF${hex.replace("#", "").toUpperCase()}` });
const fill = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: argb(hex) });
const reais = (cents: number) => cents / 100;
const toDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const today = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GEAS Financeiro";
  workbook.created = new Date();
  return workbook;
}

async function toBuffer(workbook: ExcelJS.Workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- fluxo de caixa

type Column<T> = { header: string; width: number; value: (row: T) => ExcelJS.CellValue; money?: boolean; date?: boolean };

const HEADER_ROW = 4;

function flowSheet<T>(workbook: ExcelJS.Workbook, name: string, title: string, period: Period, columns: Column<T>[], rows: T[], amount: (row: T) => number) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: HEADER_ROW }] });
  sheet.properties.defaultRowHeight = 16;
  columns.forEach((column, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = column.width;
    if (column.money) col.numFmt = MONEY;
    if (column.date) col.numFmt = "dd/mm/yyyy";
  });

  sheet.getCell("A1").value = `${title} — ${describePeriod(period)}`;
  sheet.getCell("A1").font = { name: FONT, size: 14, bold: true };
  sheet.getCell("A2").value = `Gerado em ${today()}`;
  sheet.getCell("A2").font = { name: FONT, size: 9, color: argb("#5D5962") };

  const header = sheet.getRow(HEADER_ROW);
  header.values = columns.map((c) => c.header);
  header.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: argb("#FFFFFF") };
    cell.fill = fill("#666666");
    cell.alignment = { vertical: "middle" };
  });
  header.height = 20;

  rows.forEach((row) => {
    const added = sheet.addRow(columns.map((c) => c.value(row)));
    added.font = { name: FONT, size: 10 };
  });
  const firstData = HEADER_ROW + 1;
  const lastData = HEADER_ROW + rows.length;
  if (rows.length) sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: lastData, column: columns.length } };
  else sheet.addRow(["Nenhum lançamento no período."]).font = { name: FONT, size: 10, italic: true, color: argb("#5D5962") };

  // totais: entradas, saídas e saldo, como fórmulas sobre a coluna de valor
  const moneyIndex = columns.findIndex((c) => c.money);
  const letter = sheet.getColumn(moneyIndex + 1).letter;
  const range = `${letter}${firstData}:${letter}${lastData}`;
  const values = rows.map(amount);
  const income = values.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const expense = values.filter((v) => v < 0).reduce((a, b) => a + b, 0);
  sheet.addRow([]);
  const totals: [string, string, number][] = [
    ["Entradas", `SUMIF(${range},">0")`, income],
    ["Saídas", `SUMIF(${range},"<0")`, expense],
    ["Saldo", `SUM(${range})`, income + expense],
  ];
  for (const [label, formula, result] of totals) {
    const row = sheet.addRow([]);
    row.getCell(moneyIndex).value = label;
    row.getCell(moneyIndex).alignment = { horizontal: "right" };
    row.getCell(moneyIndex + 1).value = rows.length ? { formula, result: reais(result) } : 0;
    row.font = { name: FONT, size: 10, bold: label === "Saldo" };
  }
  return sheet;
}

const folder = (filed: boolean) => filed ? "Arquivado" : "Pendente";

export async function statementWorkbook(rows: StatementRow[], period: Period) {
  const workbook = newWorkbook();
  flowSheet(workbook, "Fluxo por extrato", "Fluxo de caixa por extrato", period, [
    { header: "Data", width: 12, date: true, value: (r) => toDate(r.entry_date) },
    { header: "Nome", width: 40, value: (r) => r.name },
    { header: "Conta", width: 22, value: (r) => r.account_name },
    { header: "Forma pgto", width: 18, value: (r) => r.payment_method_name },
    { header: "Documento", width: 16, value: (r) => r.document ?? "" },
    { header: "Documentos", width: 12, value: (r) => folder(r.document_filed) },
    { header: "Valor", width: 16, money: true, value: (r) => reais(r.total_cents) },
  ], rows, (r) => r.total_cents);
  return toBuffer(workbook);
}

export async function splitWorkbook(rows: SplitRow[], period: Period) {
  const workbook = newWorkbook();
  flowSheet(workbook, "Fluxo por rubrica", "Fluxo de caixa por rubrica", period, [
    { header: "Data", width: 12, date: true, value: (r) => toDate(r.entry_date) },
    { header: "Nome do lançamento", width: 34, value: (r) => r.entry_name },
    { header: "Conta", width: 22, value: (r) => r.account_name },
    { header: "Forma pgto", width: 18, value: (r) => r.payment_method_name },
    { header: "Documento", width: 16, value: (r) => r.document ?? "" },
    { header: "Documentos", width: 12, value: (r) => folder(r.document_filed) },
    { header: "Código", width: 9, value: (r) => r.category_code ?? "" },
    { header: "Rubrica", width: 30, value: (r) => r.category_name },
    { header: "Tipo", width: 10, value: (r) => r.category_kind === "receita" ? "Receita" : r.category_kind === "despesa" ? "Despesa" : "" },
    { header: "Descrição", width: 34, value: (r) => r.description },
    { header: "Associado", width: 26, value: (r) => r.associate_name ?? "" },
    { header: "Valor", width: 16, money: true, value: (r) => reais(r.amount_cents) },
  ], rows, (r) => r.amount_cents);
  return toBuffer(workbook);
}

// ---------------------------------------------------------------- realizado anual

/** Cores do Realizado: raiz, nível 1 e níveis mais profundos. */
const PALETTE = {
  receita: ["#6AA84F", "#93C47D", "#B6D7A8"],
  despesa: ["#E69138", "#F6B26B", "#F9CB9C"],
} as const;
const FIRST_MONTH_COL = 3; // C
const TOTAL_COL = FIRST_MONTH_COL + 12; // O
const thin = { style: "thin" as const, color: argb("#FFFFFF") };
const medium = { style: "medium" as const, color: argb("#000000") };

export async function realizedWorkbook(model: RealizedModel) {
  const workbook = newWorkbook();
  const sheet = workbook.addWorksheet(`Realizado ${model.year}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3, showGridLines: false }],
  });
  sheet.getColumn(1).width = 2;
  sheet.getColumn(2).width = 40;
  for (let c = FIRST_MONTH_COL; c <= TOTAL_COL; c++) { sheet.getColumn(c).width = 14; sheet.getColumn(c).numFmt = MONEY; }
  const col = (c: number) => sheet.getColumn(c).letter;

  // faixa de título
  const band = sheet.getRow(1);
  band.height = 46;
  for (let c = 2; c <= TOTAL_COL; c++) band.getCell(c).fill = fill("#666666");
  band.getCell(2).value = `Realizado ${model.year}`;
  band.getCell(2).font = { name: FONT, size: 20, bold: true, color: argb("#FFFFFF") };
  band.getCell(2).alignment = { vertical: "middle" };
  band.getCell(TOTAL_COL).value = `Gerado em ${today()}`;
  band.getCell(TOTAL_COL).font = { name: FONT, size: 9, color: argb("#FFFFFF") };
  band.getCell(TOTAL_COL).alignment = { horizontal: "right", vertical: "top" };
  sheet.getRow(2).height = 6;

  const header = sheet.getRow(3);
  header.values = ["", "Rubricas", ...MONTHS_SHORT, "Total"];
  header.height = 20;
  for (let c = 2; c <= TOTAL_COL; c++) {
    const cell = header.getCell(c);
    cell.font = { name: FONT, bold: true };
    cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
    cell.border = { top: medium, bottom: medium, left: medium, right: medium };
  }

  // posição de cada linha do modelo na planilha (blocos separados por uma linha em branco)
  const rowNumber = new Map<number, number>();
  let next = 4;
  const blocks: number[][] = [];
  for (const kind of ["receita", "despesa"] as const) {
    const root = model.roots[kind];
    if (root === undefined) continue;
    const block: number[] = [];
    const walk = (i: number) => { block.push(i); model.rows[i].children.forEach(walk); };
    walk(root);
    if (blocks.length) next++;
    for (const i of block) rowNumber.set(i, next++);
    blocks.push(block);
  }

  const writeRow = (i: number, row: RealizedRow) => {
    const r = rowNumber.get(i)!;
    const excelRow = sheet.getRow(r);
    const shade = PALETTE[row.kind][Math.min(row.depth, 2)];
    excelRow.getCell(2).value = row.label;
    for (let m = 0; m < 12; m++) {
      const c = FIRST_MONTH_COL + m;
      if (row.children.length) {
        const refs = row.children.map((child) => `${col(c)}${rowNumber.get(child)}`).join(",");
        const own = row.own[m] ? `+${reais(row.own[m])}` : "";
        excelRow.getCell(c).value = { formula: `SUM(${refs})${own}`, result: reais(row.total[m]) };
      } else excelRow.getCell(c).value = reais(row.own[m]);
    }
    excelRow.getCell(TOTAL_COL).value = { formula: `SUM(${col(FIRST_MONTH_COL)}${r}:${col(TOTAL_COL - 1)}${r})`, result: reais(row.total.reduce((a, b) => a + b, 0)) };
    for (let c = 2; c <= TOTAL_COL; c++) {
      const cell = excelRow.getCell(c);
      cell.fill = fill(shade);
      cell.font = { name: FONT, size: 10, bold: row.depth === 0 };
      cell.border = { top: thin, bottom: thin, left: c === 2 ? medium : thin, right: c === TOTAL_COL ? medium : thin };
    }
  };
  for (const block of blocks) {
    block.forEach((i) => writeRow(i, model.rows[i]));
    // contorno grosso do bloco
    const first = rowNumber.get(block[0])!;
    const last = rowNumber.get(block[block.length - 1])!;
    for (let c = 2; c <= TOTAL_COL; c++) {
      const top = sheet.getCell(first, c); top.border = { ...top.border, top: medium };
      const bottom = sheet.getCell(last, c); bottom.border = { ...bottom.border, bottom: medium };
    }
  }

  // saldo: receitas − despesas
  const income = model.roots.receita;
  const expense = model.roots.despesa;
  const saldo = sheet.getRow(next + 1);
  saldo.getCell(2).value = "Saldo (receitas − despesas)";
  for (let c = FIRST_MONTH_COL; c <= TOTAL_COL; c++) {
    const m = c - FIRST_MONTH_COL;
    const ref = (i: number | undefined) => i === undefined ? "0" : `${col(c)}${rowNumber.get(i)}`;
    const value = (i: number | undefined) => i === undefined ? 0 : m < 12 ? model.rows[i].total[m] : model.rows[i].total.reduce((a, b) => a + b, 0);
    saldo.getCell(c).value = { formula: `${ref(income)}-${ref(expense)}`, result: reais(value(income) - value(expense)) };
  }
  for (let c = 2; c <= TOTAL_COL; c++) {
    const cell = saldo.getCell(c);
    cell.font = { name: FONT, size: 10, bold: true };
    cell.fill = fill("#D9D9D9");
    cell.border = { top: medium, bottom: medium, left: c === 2 ? medium : thin, right: c === TOTAL_COL ? medium : thin };
  }

  return toBuffer(workbook);
}
