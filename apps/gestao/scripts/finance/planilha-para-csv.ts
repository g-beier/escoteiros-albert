// Converte a aba "Movimentação Financeira" da planilha do Financeiro (exportada do Google Sheets como CSV: Data, Forma
// pgto, Pasta, Valor, Nome do Associado, Descrição, Rubrica) no lancamentos.csv do contrato de importação
// (apps/gestao/docs/importacao.md), pronto para a tela /importar. Um lançamento por linha (um rateio cada); agrupe
// depois no Detalhamento o que for um lançamento só.
//
// Conta e forma de pagamento saem da coluna "Forma pgto" (a planilha não tem conta):
//   PIX, BOLETO, DEPÓSITO, CARTÃO → Mercado Pago (CARTÃO = Cartão de crédito; DEPÓSITO = Depósito, criada)
//   PIX - Cora → Cora; DINHEIRO → Caixa; vazia → "A definir" (conta e forma; corrija em lote nas Movimentações)
// Ficam de fora, listadas no resumo: transferências entre contas próprias (rubrica 3.x Caixinhas, ou sem rubrica com
// "transfer" na descrição: na conciliação, ignore a linha do extrato), linhas sem data, valor ou rubrica.
// O CSV gerado é dado do grupo: não versione.
//
// Uso: npm run finance:csv --workspace=@geas/gestao -- <planilha.csv> <pasta de saída>
import fs from "node:fs";
import path from "node:path";
import { readCsv } from "@/lib/csv-reader";
import { readImportFile, writeImportCsv } from "@/lib/import/read";
import { fileSpec } from "@/lib/import/contract";

const base = process.env.INIT_CWD ?? process.cwd();
const [inArg, outArg] = process.argv.slice(2);
if (!inArg || !outArg) fail("Uso: npm run finance:csv --workspace=@geas/gestao -- <planilha.csv> <pasta de saída>");
const input = path.resolve(base, inArg);
const outDir = path.resolve(base, outArg);
if (!fs.existsSync(input)) fail(`Arquivo não encontrado: ${input}`);
if (outDir.startsWith(path.resolve(import.meta.dirname, "../../..") + path.sep)) {
  console.warn(`Atenção: ${outDir} fica dentro do repositório. O CSV é dado do grupo: não faça commit dele.`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Forma pgto da planilha → conta e forma de pagamento do app. */
const ROUTES: Record<string, { account: string; method: string }> = {
  pix: { account: "Mercado Pago", method: "PIX" },
  "pix - cora": { account: "Cora", method: "PIX" },
  boleto: { account: "Mercado Pago", method: "Boleto" },
  deposito: { account: "Mercado Pago", method: "Depósito" },
  cartao: { account: "Mercado Pago", method: "Cartão de crédito" },
  dinheiro: { account: "Caixa", method: "Dinheiro" },
  "": { account: "A definir", method: "A definir" },
};
const key = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const columnOf = (header: string[], name: string) => {
  const index = header.findIndex((cell) => key(cell) === key(name));
  if (index < 0) fail(`Coluna "${name}" não encontrada. Cabeçalho: ${header.join(", ")}`);
  return index;
};

const table = readCsv(fs.readFileSync(input, "utf8").replace(/^﻿/, ""), { delimiter: ",", headerRow: 1 });
const header = table.header.map((cell) => cell.trim());
const col = {
  date: columnOf(header, "Data"),
  method: columnOf(header, "Forma pgto"),
  filed: columnOf(header, "Pasta"),
  amount: columnOf(header, "Valor"),
  associate: columnOf(header, "Nome do Associado"),
  description: columnOf(header, "Descrição"),
  category: columnOf(header, "Rubrica"),
};

const out: string[][] = [];
const skipped = new Map<string, number[]>();
const skip = (reason: string, line: number) => skipped.set(reason, [...(skipped.get(reason) ?? []), line]);
const unknownMethods = new Map<string, number>();
table.rows.forEach((cells, index) => {
  const line = index + 2;
  const cell = (i: number) => (cells[i] ?? "").replace(/\s+/g, " ").trim();
  const date = cell(col.date),
    amount = cell(col.amount).replace(/^R\$\s*/, ""),
    category = cell(col.category),
    description = cell(col.description);
  if (!date && !amount && !category && !description) return; // linha vazia (só a caixa da Pasta)
  if (!date || !amount) {
    skip("sem data ou valor", line);
    return;
  }
  if (/^3(\.|\s|$)/.test(category)) {
    skip("Caixinha (transferência para a conta Caixinha)", line);
    return;
  }
  if (!category) {
    skip(
      /transfer/i.test(description)
        ? "transferência entre contas próprias (sem rubrica)"
        : "sem rubrica: classifique na planilha",
      line,
    );
    return;
  }
  const route = ROUTES[key(cell(col.method))];
  if (!route) {
    unknownMethods.set(cell(col.method), (unknownMethods.get(cell(col.method)) ?? 0) + 1);
    skip(`forma de pagamento desconhecida`, line);
    return;
  }
  const categoryName = category.replace(/^[\d.]+\s*/, "");
  const text = (description || cell(col.associate) || categoryName).slice(0, 200);
  out.push([
    "",
    "",
    date,
    text.length >= 2 ? text : `${text} (${categoryName})`,
    route.account,
    route.method,
    "",
    /^(true|verdadeiro|sim)$/i.test(cell(col.filed)) ? "sim" : "não",
    amount,
    category,
    "",
    cell(col.associate),
    "",
  ]);
});

const csv = writeImportCsv(fileSpec("lancamentos").example.header, out);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "lancamentos.csv"), csv);

const read = readImportFile("lancamentos.csv", csv);
if (!read.file) fail(read.error ?? "não foi possível reler o CSV gerado");
const bad = read.file.rows.filter((row) => row.errors.length);
const byAccount = out.reduce<Record<string, number>>(
  (acc, row) => ((acc[`${row[4]} / ${row[5]}`] = (acc[`${row[4]} / ${row[5]}`] ?? 0) + 1), acc),
  {},
);
console.log(`lançamentos: ${out.length} (de ${table.rows.length} linhas da planilha)`);
console.log(
  "conta / forma:",
  Object.entries(byAccount)
    .map(([k, v]) => `${k} ${v}`)
    .join(" | "),
);
for (const [reason, lines] of skipped) console.log(`de fora — ${reason}: ${lines.length} (linhas ${lines.join(", ")})`);
if (unknownMethods.size)
  console.log(
    "formas desconhecidas:",
    [...unknownMethods].map(([k, v]) => `"${k}" ${v}`).join(", "),
    "→ acrescente em ROUTES",
  );
if (bad.length)
  fail(
    `\n${bad.length} linha(s) com erro de formato:\n  ${bad.map((row) => `linha ${row.line}: ${row.errors.join("; ")}`).join("\n  ")}`,
  );
console.log(
  `\nPronto: ${path.join(outDir, "lancamentos.csv")}. Envie em /importar (Editor do Financeiro): a pré-visualização confere rubricas, associados e o que já existe.`,
);
