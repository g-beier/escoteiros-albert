/** Mês do calendário (AAAA-MM) e intervalo inclusivo de datas. */

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function monthKeyFromDate(isoDate: string) {
  return isoDate.slice(0, 7);
}

/** `mes` da query (`AAAA-MM`) ou o mês de `today` (AAAA-MM-DD). */
export function parseMonth(mes: string | undefined, today: string): string {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) return mes;
  return monthKeyFromDate(today);
}

export function monthLabel(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} de ${y}`;
}

/** Só o nome do mês (`Novembro`). */
export function monthName(mes: string) {
  const m = Number(mes.slice(5, 7));
  return MONTHS[(m || 1) - 1]!;
}

/** Cabeçalho compacto do calendário (`Novembro 2026`). */
export function monthLabelShort(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export type CalendarCell = { date: string; inMonth: boolean };

const WEEKDAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"] as const;

/** Dia da semana em maiúsculas (`SÁB`), a partir de AAAA-MM-DD. */
export function weekdayShort(isoDate: string) {
  return WEEKDAY_SHORT[new Date(`${isoDate}T12:00:00Z`).getUTCDay()]!;
}

/** Grade do mês com dias vizinhos (para o mini calendário). Domingo = 0. */
export function monthCellsFull(mes: string): CalendarCell[] {
  const { from, to } = monthRange(mes);
  const firstWeekday = new Date(`${from}T12:00:00Z`).getUTCDay();
  const lastDay = Number(to.slice(8, 10));
  const prev = shiftMonth(mes, -1);
  const next = shiftMonth(mes, 1);
  const prevLast = Number(monthRange(prev).to.slice(8, 10));
  const cells: CalendarCell[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: `${prev}-${String(prevLast - i).padStart(2, "0")}`, inMonth: false });
  }
  for (let day = 1; day <= lastDay; day++) {
    cells.push({ date: `${mes}-${String(day).padStart(2, "0")}`, inMonth: true });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: `${next}-${String(nextDay).padStart(2, "0")}`, inMonth: false });
    nextDay += 1;
  }
  return cells;
}

/** Primeiro e último dia do mês (AAAA-MM-DD). */
export function monthRange(mes: string): { from: string; to: string } {
  const [y, m] = mes.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(m!)}-01`, to: `${y}-${pad(m!)}-${pad(last)}` };
}

export function shiftMonth(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m! - 1) + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Células do mês: `null` = dia fora do mês (preenchimento da grade). Domingo = 0. */
export function monthCells(mes: string): (string | null)[] {
  const { from, to } = monthRange(mes);
  const firstWeekday = new Date(`${from}T12:00:00Z`).getUTCDay();
  const lastDay = Number(to.slice(8, 10));
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= lastDay; day++) {
    cells.push(`${mes}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Hora do banco (`HH:MM:SS` ou `HH:MM`) → `HH:MM`. */
export function timeHM(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 5);
}

/** Datas inclusivas de `from` até `to` (AAAA-MM-DD). Se `to` for anterior/vazio, só `from`. */
export function eachDateInRange(from: string, to?: string | null): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return [];
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) && to >= from ? to : from;
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
