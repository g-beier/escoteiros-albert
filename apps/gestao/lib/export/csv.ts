import { brDate } from "./period";
import type { Column } from "./columns";

export type CsvEncoding = "windows-1252" | "utf-8";

export const CSV_ENCODINGS: { value: CsvEncoding; label: string }[] = [
  { value: "windows-1252", label: "Windows-1252 (contábil)" },
  { value: "utf-8", label: "UTF-8" },
];

export function isCsvEncoding(value: unknown): value is CsvEncoding {
  return value === "windows-1252" || value === "utf-8";
}

/** Centavos → "1234,56": vírgula decimal, sem separador de milhar (o que os importadores esperam). */
export function csvMoney(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Texto numa linha só, sem o separador: alguns importadores não aceitam aspas. */
export function csvText(value: string, max?: number) {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/;/g, ",").replace(/"/g, "'").replace(/\s{2,}/g, " ").trim();
  return max ? clean.slice(0, max) : clean;
}

function cell<T>(column: Column<T>, row: T) {
  const value = column.value(row);
  if (value === null || value === "") return "";
  if (column.type === "money") return csvMoney(Number(value));
  if (column.type === "date") return brDate(String(value));
  return csvText(String(value));
}

/** CSV com `;`, cabeçalho na primeira linha e quebras CRLF. */
export function toCsv<T>(columns: Column<T>[], rows: T[]) {
  const lines = [columns.map((column) => csvText(column.header)), ...rows.map((row) => columns.map((column) => cell(column, row)))];
  return lines.map((line) => line.join(";")).join("\r\n") + "\r\n";
}

// Windows-1252: Latin-1, exceto 0x80–0x9F.
const CP1252_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Bytes do arquivo: UTF-8 com BOM (o Excel reconhece) ou Windows-1252 (caracteres fora dele viram "?"). */
export function encodeCsv(text: string, encoding: CsvEncoding): Uint8Array {
  if (encoding === "utf-8") return new TextEncoder().encode(`﻿${text}`);
  const normalized = text.normalize("NFC");
  const bytes = new Uint8Array(normalized.length);
  let length = 0;
  for (const char of normalized) {
    const code = char.codePointAt(0)!;
    bytes[length++] = CP1252_EXTRA[char] ?? (code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : 0x3f);
  }
  return bytes.slice(0, length);
}
