import type { DateFormat, Decimal } from "./types";

/**
 * Parse a bank amount into signed integer cents, or null.
 * Accepts thousands separators, "R$", spaces, a leading/trailing "-" or "+", and "(1,00)" negatives.
 * More than two decimals are rounded half away from zero.
 */
export function parseAmount(raw: string, decimal: Decimal): number | null {
  let value = raw.replace(/[\s\u00a0]/g, "").replace(/^R\$/i, "");
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/^R\$/i, "");
  if (/^[-+]/.test(value)) {
    negative = negative !== (value[0] === "-");
    value = value.slice(1);
  } else if (/[-+]$/.test(value)) {
    negative = negative !== (value[value.length - 1] === "-");
    value = value.slice(0, -1);
  }
  value = value.replace(/^R\$/i, "");
  const [thousands, point] = decimal === "comma" ? [".", ","] : [",", "."];
  const match = new RegExp(`^(\\d{1,3}(?:\\${thousands}\\d{3})+|\\d+)(?:\\${point}(\\d+))?$`).exec(value);
  if (!match) return null;
  const integer = match[1].split(thousands).join("");
  const fraction = match[2] ?? "";
  let cents = Number(integer) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
  if (fraction.length > 2 && fraction[2] >= "5") cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

const DATE_PATTERNS: Record<DateFormat, { re: RegExp; order: ["y" | "m" | "d", "y" | "m" | "d", "y" | "m" | "d"] }> = {
  "DD/MM/YYYY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ["d", "m", "y"] },
  "DD-MM-YYYY": { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ["d", "m", "y"] },
  "DD.MM.YYYY": { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: ["d", "m", "y"] },
  "DD/MM/YY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ["d", "m", "y"] },
  "YYYY-MM-DD": { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ["y", "m", "d"] },
  "YYYY/MM/DD": { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ["y", "m", "d"] },
  "MM/DD/YYYY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ["m", "d", "y"] },
};

export const DATE_FORMATS = Object.keys(DATE_PATTERNS) as DateFormat[];

export function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse a date in the given format into YYYY-MM-DD, or null. A trailing time ("10/05/2026 14:03") is ignored. */
export function parseDate(raw: string, format: DateFormat): string | null {
  const value = raw.trim().split(/[\sT]/)[0] ?? "";
  const pattern = DATE_PATTERNS[format];
  const match = pattern.re.exec(value);
  if (!match) return null;
  const parts = { y: 0, m: 0, d: 0 };
  pattern.order.forEach((key, index) => (parts[key] = Number(match[index + 1])));
  if (format === "DD/MM/YY") parts.y += 2000;
  return isoDate(parts.y, parts.m, parts.d);
}
