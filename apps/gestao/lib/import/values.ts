import { normalizeText } from "@/lib/text";
import { parseMoneyToCents } from "@/lib/money";

/**
 * Leitura dos valores das células dos CSVs de importação (contrato em `docs/importacao.md`).
 * Cada função devolve `{ value }` ou `{ error }`; célula vazia é tratada antes, por quem chama.
 */

export type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

const ok = <T>(value: T): Parsed<T> => ({ value });
const fail = <T>(error: string): Parsed<T> => ({ error });

function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `dd/mm/aaaa`, `dd/mm/aa` (00–69 = 2000–2069), `d/m/aaaa`, `aaaa-mm-dd`; também com `.` ou `-` no lugar da barra. */
export function parseDate(text: string): Parsed<string> {
  const value = text.trim();
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const iso = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    return iso ? ok(iso) : fail(`data "${text}" inválida`);
  }
  match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!match) return fail(`data "${text}" fora do formato dd/mm/aaaa`);
  let year = Number(match[3]);
  if (match[3].length === 2) year += year < 70 ? 2000 : 1900;
  const iso = isoDate(year, Number(match[2]), Number(match[1]));
  return iso ? ok(iso) : fail(`data "${text}" inválida`);
}

/** Mês `mm/aaaa` (ou uma data completa): devolve o 1º dia do mês, ou o 1º dia do mês seguinte com `end`. */
export function parseMonthOrDate(text: string, end = false): Parsed<string> {
  const match = text.trim().match(/^(\d{1,2})[/.-](\d{4})$/);
  if (!match) {
    const date = parseDate(text);
    if (date.error) return fail(`"${text}" não é mês (mm/aaaa) nem data (dd/mm/aaaa)`);
    if (!end) return date;
    // Fim informado como data: o último dia conta, então o período termina no dia seguinte.
    const next = new Date(`${date.value}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return ok(next.toISOString().slice(0, 10));
  }
  let year = Number(match[2]);
  let month = Number(match[1]);
  if (month < 1 || month > 12) return fail(`mês "${text}" inválido`);
  if (end) {
    month += 1;
    if (month === 13) { month = 1; year += 1; }
  }
  return ok(isoDate(year, month, 1)!);
}

const YES = new Set(["sim", "s", "x", "1", "verdadeiro", "true", "yes", "y"]);
const NO = new Set(["nao", "n", "0", "falso", "false", "no", "-"]);

export function parseYesNo(text: string): Parsed<boolean> {
  const key = normalizeText(text);
  if (YES.has(key)) return ok(true);
  if (NO.has(key)) return ok(false);
  return fail(`"${text}" não é sim ou não`);
}

export function parseInteger(text: string, min = 0, max = 1_000_000): Parsed<number> {
  const value = text.trim().replace(/\.(?=\d{3}(\D|$))/g, "");
  if (!/^-?\d+$/.test(value)) return fail(`"${text}" não é número inteiro`);
  const number = Number(value);
  if (number < min || number > max) return fail(`${number} fora do intervalo ${min}–${max}`);
  return ok(number);
}

export function parseCents(text: string): Parsed<number> {
  const cents = parseMoneyToCents(text);
  if (cents === null || cents < 0) return fail(`valor "${text}" inválido (use 1.234,56)`);
  return ok(cents);
}

/** Valor de lista: compara sem acento nem maiúsculas com o valor e os apelidos. */
export function parseChoice<T extends string>(text: string, choices: readonly { value: T; label: string; aliases?: readonly string[] }[]): Parsed<T> {
  const key = normalizeText(text);
  for (const choice of choices) {
    if (key === normalizeText(choice.value) || key === normalizeText(choice.label) || choice.aliases?.some((alias) => normalizeText(alias) === key)) return ok(choice.value);
  }
  return fail(`"${text}" não é um valor aceito (${choices.map((c) => c.label).join(", ")})`);
}

/** Nome comparável: sem acento, maiúsculas nem espaços repetidos. */
export const nameKey = (name: string) => normalizeText(name);

/** Texto limpo: espaços repetidos e nas pontas removidos. */
export const cleanText = (text: string) => text.replace(/\s+/g, " ").trim();

/** Conteúdo de uma célula de `controle.csv` (docs/importacao.md). */
export type ControlCell = { status?: string; year?: number; validUntil?: string; statusDate?: string; note?: string };

/**
 * Célula do controle: `<situação> [dd/mm/aaaa] [- observação]`; item de ano: `<ano>` ou `<situação> <ano>`;
 * item de data: `<data>` (validade, situação ok). Códigos do Doc 22 aceitos (`CONTROL_STATUS_CHOICES`).
 */
export function parseControlCell(text: string, valueKind: string, choices: readonly { value: string; label: string; aliases?: readonly string[] }[]): Parsed<ControlCell> {
  const clean = cleanText(text);
  const dash = clean.search(/\s[-–]\s/);
  const main = (dash >= 0 ? clean.slice(0, dash) : clean).trim();
  const note = dash >= 0 ? clean.slice(dash).replace(/^\s[-–]\s/, "").trim() : "";
  if (note.length > 200) return { error: "observação com mais de 200 caracteres" };
  const withNote = (cell: ControlCell): Parsed<ControlCell> => ({ value: note ? { ...cell, note } : cell });

  if (valueKind === "ano" && /^\d{4}$/.test(main)) {
    const year = Number(main);
    return year >= 1900 && year <= 2100 ? withNote({ year }) : { error: `ano ${main} fora de 1900–2100` };
  }
  if (valueKind === "data" && /^[\d/.-]+$/.test(main)) {
    const date = parseDate(main);
    return date.error ? { error: date.error } : withNote({ validUntil: date.value });
  }
  let statusText = main;
  const cell: ControlCell = {};
  const trailingDate = main.match(/^(.*?)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/);
  const trailingYear = valueKind === "ano" ? main.match(/^(.*?)\s+(\d{4})$/) : null;
  if (trailingDate) {
    const date = parseDate(trailingDate[2]!);
    if (date.error) return { error: date.error };
    statusText = trailingDate[1]!;
    if (valueKind === "data") cell.validUntil = date.value; else cell.statusDate = date.value;
  } else if (trailingYear) {
    statusText = trailingYear[1]!;
    cell.year = Number(trailingYear[2]);
  }
  const status = parseChoice(statusText, choices);
  if (status.error) return { error: `"${main}" não é situação${valueKind === "ano" ? ", ano" : valueKind === "data" ? ", data" : ""} aceita` };
  return withNote({ ...cell, status: status.value });
}
