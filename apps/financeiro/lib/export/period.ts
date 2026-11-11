/** Período de exportação: limites inclusivos em AAAA-MM-DD, calculados sem fuso horário. */
export type PeriodPreset =
  | { kind: "mes"; year: number; month: number }
  | { kind: "ano"; year: number }
  | { kind: "personalizado"; from: string; to: string };

export type Period = { from: string; to: string };

export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"] as const;
export const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Data AAAA-MM-DD válida (rejeita 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function periodBounds(preset: PeriodPreset): Period | null {
  if (preset.kind === "ano") return { from: `${preset.year}-01-01`, to: `${preset.year}-12-31` };
  if (preset.kind === "mes") {
    const lastDay = new Date(Date.UTC(preset.year, preset.month, 0)).getUTCDate();
    return { from: `${preset.year}-${pad(preset.month)}-01`, to: `${preset.year}-${pad(preset.month)}-${pad(lastDay)}` };
  }
  if (!isIsoDate(preset.from) || !isIsoDate(preset.to) || preset.from > preset.to) return null;
  return { from: preset.from, to: preset.to };
}

/** 2026-03-01 → 01/03/2026 */
export const brDate = (iso: string) => iso.split("-").reverse().join("/");
export const describePeriod = ({ from, to }: Period) => `${brDate(from)} a ${brDate(to)}`;

/** Anos para exportação: do primeiro lançamento até o ano atual (ou o último lançamento, se futuro), mais recentes primeiro. */
export function exportYears(first?: string | null, last?: string | null, current = new Date().getFullYear()) {
  const start = first ? Math.min(Number(first.slice(0, 4)), current) : current;
  const end = Math.max(current, last ? Number(last.slice(0, 4)) : current);
  return Array.from({ length: end - start + 1 }, (_, i) => end - i);
}
