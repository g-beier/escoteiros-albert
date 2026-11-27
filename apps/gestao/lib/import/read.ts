import { readCsv } from "@/lib/csv-reader";
import { FILES, fileSpec, type Column, type FileKind, type FileSpec } from "@/lib/import/contract";
import {
  cleanText,
  parseCents,
  parseChoice,
  parseDate,
  parseInteger,
  parseMonthOrDate,
  parseYesNo,
  type Parsed,
} from "@/lib/import/values";
import { normalizeText } from "@/lib/text";

/**
 * Leitura de um CSV do contrato: identifica o tipo (nome do arquivo, senão cabeçalho), casa as colunas, converte cada
 * célula e junta os erros por linha. Puro: roda no navegador (pré-visualização) e no servidor (gravação).
 * As regras que dependem do que já está no app ficam em `plan.ts`.
 */

export type Values = Record<string, string | number | boolean>;

export type ReadRow = {
  /** Linha no arquivo (1 = cabeçalho). */
  line: number;
  /** Só as células preenchidas e válidas, já convertidas (datas em ISO, dinheiro em centavos). */
  values: Values;
  /** Colunas dinâmicas preenchidas (nome da coluna como veio → texto da célula). */
  dynamic: Record<string, string>;
  errors: string[];
};

export type ReadFile = {
  kind: FileKind;
  name: string;
  /** Chaves das colunas do contrato presentes no cabeçalho. */
  columns: string[];
  /** Colunas dinâmicas presentes (itens de controle, contagens). */
  dynamicColumns: string[];
  rows: ReadRow[];
  warnings: string[];
};

export type ReadResult = { file?: ReadFile; error?: string };

const MAX_ROWS = 5000;

function headerNames(column: Column) {
  return [column.header, ...(column.aliases ?? [])].map(normalizeText);
}

function matchColumn(spec: FileSpec, header: string): Column | undefined {
  const key = normalizeText(header.replace(/[_-]+/g, " "));
  return spec.columns.find((column) => headerNames(column).includes(key));
}

const COUNT_COLUMN = /^contagem (\d{4})$/;

function isDynamic(spec: FileSpec, header: string) {
  if (spec.kind === "controle") return true;
  if (spec.kind === "inventario-lotes") return COUNT_COLUMN.test(normalizeText(header));
  return false;
}

/** Ano de uma coluna `contagem AAAA`. */
export function countYear(header: string): number | null {
  const match = normalizeText(header).match(COUNT_COLUMN);
  return match ? Number(match[1]) : null;
}

/** Tipo do arquivo pelo nome (`pessoas.csv`, `2026-pessoas.csv`, `Pessoas (1).csv`…), senão pelo cabeçalho. */
export function detectKind(fileName: string, header: string[]): FileKind | null {
  const base = normalizeText(fileName.replace(/\.[^.]+$/, "")).replace(/[_\s]+/g, "-");
  const byName = [...FILES].sort((a, b) => b.kind.length - a.kind.length).find((spec) => base.includes(spec.kind));
  if (byName) return byName.kind;
  let best: { kind: FileKind; score: number } | null = null;
  for (const spec of FILES) {
    const matched = header.filter((cell) => matchColumn(spec, cell)).length;
    const required = spec.columns
      .filter((column) => column.required === "sempre")
      .every((column) => header.some((cell) => matchColumn(spec, cell) === column));
    const score = required ? matched : 0;
    if (score > 0 && (!best || score > best.score)) best = { kind: spec.kind, score };
  }
  return best?.kind ?? null;
}

function delimiterOf(text: string) {
  const first = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const count = (char: string) => first.split(char).length - 1;
  return count(";") >= count(",") ? (count("\t") > count(";") ? "\t" : ";") : ",";
}

export function parseCell(column: Column, raw: string): Parsed<string | number | boolean> {
  const text = cleanText(raw);
  const type = column.type;
  switch (type.kind) {
    case "texto":
      if (type.min && text.length < type.min) return { error: `${column.header}: mínimo de ${type.min} caracteres` };
      if (text.length > type.max) return { error: `${column.header}: máximo de ${type.max} caracteres` };
      return { value: text };
    case "id":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
        ? { value: text.toLowerCase() }
        : { error: `${column.header}: "${text}" não é um id do app` };
    case "data":
      return parseDate(text);
    case "mes_ou_data":
      return parseMonthOrDate(text, column.key === "end");
    case "sim_nao":
      return parseYesNo(text);
    case "inteiro":
      return parseInteger(text, type.min, type.max);
    case "dinheiro":
      return parseCents(text);
    case "lista":
      return parseChoice(text, type.choices);
    case "situacao_controle":
      return { value: text };
  }
}

/** Lê o texto (já decodificado) de um arquivo. `kind` força o tipo. */
export function readImportFile(name: string, text: string, kind?: FileKind): ReadResult {
  const clean = text.replace(/^﻿/, "");
  if (!clean.trim()) return { error: `${name}: arquivo vazio` };
  const table = readCsv(clean, { delimiter: delimiterOf(clean), headerRow: 1 });
  const header = table.header.map((cell) => cleanText(cell));
  const detected = kind ?? detectKind(name, header);
  if (!detected)
    return {
      error: `${name}: tipo não reconhecido. Use o nome de um dos arquivos do contrato (ex.: pessoas.csv) e o cabeçalho na primeira linha.`,
    };
  const spec = fileSpec(detected);

  const warnings: string[] = [];
  const at = new Map<number, Column>();
  const dynamicAt = new Map<number, string>();
  header.forEach((cell, index) => {
    if (!cell) return;
    const column = matchColumn(spec, cell);
    if (column) {
      if ([...at.values()].includes(column)) warnings.push(`Coluna "${cell}" repetida: só a primeira vale.`);
      else at.set(index, column);
    } else if (isDynamic(spec, cell)) dynamicAt.set(index, cell);
    else warnings.push(`Coluna "${cell}" não faz parte de ${spec.file} e foi ignorada.`);
  });
  const missing = spec.columns
    .filter((column) => column.required === "sempre" && ![...at.values()].includes(column))
    .map((column) => column.header);
  if (missing.length) return { error: `${name}: falta a coluna ${missing.join(", ")} (${spec.file}).` };

  const records = table.rows
    .map((record, i) => ({ record, line: table.rowNumbers[i] ?? i + 2 }))
    .filter(({ record }) => record.some((cell) => cell.trim() !== ""));
  if (records.length > MAX_ROWS)
    return { error: `${name}: no máximo ${MAX_ROWS.toLocaleString("pt-BR")} linhas por arquivo.` };

  const rows = records.map(({ record, line }): ReadRow => {
    const values: Values = {};
    const dynamic: Record<string, string> = {};
    const errors: string[] = [];
    for (const [index, column] of at) {
      const raw = cleanText(record[index] ?? "");
      if (!raw) {
        if (column.required === "sempre") errors.push(`${column.header} vazio`);
        continue;
      }
      const parsed = parseCell(column, raw);
      if (parsed.error !== undefined)
        errors.push(parsed.error.startsWith(column.header) ? parsed.error : `${column.header}: ${parsed.error}`);
      else values[column.key] = parsed.value;
    }
    for (const [index, headerName] of dynamicAt) {
      const raw = cleanText(record[index] ?? "");
      if (raw) dynamic[headerName] = raw;
    }
    return { line, values, dynamic, errors };
  });

  return {
    file: {
      kind: detected,
      name,
      columns: [...at.values()].map((column) => column.key),
      dynamicColumns: [...dynamicAt.values()],
      rows,
      warnings,
    },
  };
}

/** CSV de um arquivo do contrato (modelo vazio, exemplo ou exportação), `;` e BOM para o Excel abrir em UTF-8. */
export function writeImportCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [header, ...rows].map((row) => row.map(escape).join(";")).join("\r\n") + "\r\n";
}
