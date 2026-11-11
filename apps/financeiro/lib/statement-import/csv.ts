import type { CsvSniff, CsvTable, DateFormat, Decimal } from "./types";
import { DATE_FORMATS, parseDate } from "./values";

/** RFC 4180 records: quoted fields with "" escapes, embedded delimiters and newlines; CRLF, LF or CR line ends. */
export function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  let i = 0;
  const pushField = () => {
    record.push(field);
    field = "";
    fieldStarted = false;
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };
  while (i < text.length) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      i += 1;
      continue;
    }
    if (char === '"' && !fieldStarted && field.trim() === "") {
      field = "";
      quoted = true;
      fieldStarted = true;
    } else if (text.startsWith(delimiter, i)) {
      pushField();
      i += delimiter.length;
      continue;
    } else if (char === "\r" || char === "\n") {
      pushRecord();
      if (char === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      field += char;
      fieldStarted = true;
    }
    i += 1;
  }
  if (field !== "" || record.length > 0 || fieldStarted) pushRecord();
  return records;
}

export function isBlankRecord(record: string[]) {
  return record.every((cell) => cell.trim() === "");
}

/** Split CSV text into preamble, header and data rows. `headerRow` is the 1-based record number of the header. */
export function readCsv(text: string, options: { delimiter: string; headerRow: number }): CsvTable {
  const records = parseCsvRecords(text, options.delimiter);
  const headerIndex = Math.max(0, options.headerRow - 1);
  const header = (records[headerIndex] ?? []).map((cell) => cell.trim());
  const preamble = records.slice(0, headerIndex).filter((record) => !isBlankRecord(record));
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  records.forEach((record, index) => {
    if (index <= headerIndex || isBlankRecord(record)) return;
    rows.push(record);
    rowNumbers.push(index + 1);
  });
  return { header, rows, preamble, rowNumbers, headerRow: headerIndex + 1 };
}

const DELIMITERS = [";", ",", "\t", "|"];
const NUMBER_LIKE = /^\(?[-+]?\s*(?:R\$)?\s*[-+]?[\d.,]*\d\)?[-+]?$/i;

function looksLikeData(cell: string) {
  const value = cell.trim();
  return value !== "" && (NUMBER_LIKE.test(value) || DATE_FORMATS.some((format) => parseDate(value, format)));
}

type DelimiterScore = { delimiter: string; headerIndex: number; score: number };

function scoreDelimiter(text: string, delimiter: string): DelimiterScore | null {
  const records = parseCsvRecords(text, delimiter).slice(0, 500);
  const counts = records.map((record) => (isBlankRecord(record) ? 0 : record.length));
  const frequency = new Map<number, number>();
  for (const count of counts) if (count > 1) frequency.set(count, (frequency.get(count) ?? 0) + 1);
  if (frequency.size === 0) return null;
  // The widest of the most frequent column counts is the table.
  const [columns, rowsWithColumns] = [...frequency.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  // Header: first row from which every non-blank row has the table's width.
  let headerIndex = counts.length - 1;
  for (let i = counts.length - 1; i >= 0; i -= 1) {
    if (counts[i] === 0) continue;
    if (counts[i] !== columns) break;
    headerIndex = i;
  }
  let score = rowsWithColumns * 10 + columns;
  if (records[headerIndex]?.some(looksLikeData)) score -= rowsWithColumns * 5;
  return { delimiter, headerIndex, score };
}

function inferDateFormat(rows: string[][]): DateFormat {
  const cells = rows.flat().map((cell) => cell.trim().split(/[\sT]/)[0]).filter(Boolean);
  let best: { format: DateFormat; hits: number } = { format: "DD/MM/YYYY", hits: 0 };
  // Order matters: DD/MM wins ties over MM/DD (Brazilian files).
  for (const format of DATE_FORMATS) {
    const hits = cells.filter((cell) => parseDate(cell, format)).length;
    if (hits > best.hits) best = { format, hits };
  }
  return best.format;
}

function inferDecimal(rows: string[][]): Decimal {
  let comma = 0;
  let dot = 0;
  for (const cell of rows.flat()) {
    const value = cell.trim();
    if (!NUMBER_LIKE.test(value) || DATE_FORMATS.some((format) => parseDate(value, format))) continue;
    const digits = value.replace(/[^\d.,]/g, "");
    if (/,\d{1,2}$/.test(digits) || /\.\d{3},/.test(digits)) comma += 1;
    else if (/\.\d{1,2}$/.test(digits) || /,\d{3}\./.test(digits)) dot += 1;
  }
  return dot > comma ? "dot" : "comma";
}

/** Guess delimiter, header row (1-based), date format and decimal separator from the file text. */
export function sniffCsv(text: string): CsvSniff {
  const scores = DELIMITERS.map((delimiter) => scoreDelimiter(text, delimiter)).filter(
    (score): score is DelimiterScore => score !== null,
  );
  const best = scores.sort((a, b) => b.score - a.score)[0] ?? { delimiter: ";", headerIndex: 0, score: 0 };
  const table = readCsv(text, { delimiter: best.delimiter, headerRow: best.headerIndex + 1 });
  const sample = table.rows.slice(0, 200);
  return {
    delimiter: best.delimiter,
    headerRow: best.headerIndex + 1,
    dateFormat: inferDateFormat(sample),
    decimal: inferDecimal(sample),
  };
}
