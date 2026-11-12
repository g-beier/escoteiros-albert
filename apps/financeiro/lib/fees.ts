/**
 * Mensalidades: meses cobrados, vencimento, estado de cada caixinha e sugestões a partir dos rateios.
 * Datas em AAAA-MM-DD, sem fuso (o "hoje" vem de `todayInSaoPaulo`).
 */

/** Março a dezembro. */
export const FEE_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type FeeMonth = (typeof FEE_MONTHS)[number];
export const FEE_MONTH_LABELS: Record<number, string> = {
  3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun", 7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
};
export const FEE_MONTH_NAMES: Record<number, string> = {
  3: "março", 4: "abril", 5: "maio", 6: "junho", 7: "julho", 8: "agosto", 9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro",
};

export type DueRule = "dia_fixo" | "dia_util" | "fim_do_mes";
export type FeeSettings = { dueRule: DueRule; dueDay: number; categoryId: string | null };
export const DEFAULT_FEE_SETTINGS: FeeSettings = { dueRule: "dia_fixo", dueDay: 10, categoryId: null };

export const DUE_RULE_LABELS: Record<DueRule, string> = {
  dia_fixo: "Até o dia N do mês",
  dia_util: "Até o N-ésimo dia útil",
  fim_do_mes: "Até o último dia do mês",
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const fromUtc = (date: Date) => iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** Feriados nacionais (fixos e móveis: Carnaval, Sexta-feira Santa, Corpus Christi). */
export function brazilHolidays(year: number): Set<string> {
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${year}-${md}`);
  const sunday = easter(year);
  const movable = [-48, -47, -2, 60].map((offset) => fromUtc(addDays(sunday, offset)));
  return new Set([...fixed, ...movable]);
}

/** Data de vencimento da mensalidade do mês, pela regra do grupo. */
export function dueDate(year: number, month: number, settings: Pick<FeeSettings, "dueRule" | "dueDay">) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (settings.dueRule === "fim_do_mes") return iso(year, month, lastDay);
  if (settings.dueRule === "dia_fixo") return iso(year, month, Math.min(settings.dueDay, lastDay));
  const holidays = brazilHolidays(year);
  let count = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const date = utc(year, month, day);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6 || holidays.has(fromUtc(date))) continue;
    count += 1;
    if (count === settings.dueDay) return fromUtc(date);
  }
  return iso(year, month, lastDay);
}

/** Hoje no fuso do grupo. */
export function todayInSaoPaulo(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export type FeeStatus = "pago" | "atencao";
export type FeeRecord = { associateId: string; month: number; status: FeeStatus; note: string | null; splitIds: string[] };

/** pago/atencao registrados; atrasado = passou do vencimento sem registro; sugestao = rateio a confirmar; vazio = o resto. */
export type CellState = "pago" | "atencao" | "atrasado" | "sugestao" | "vazio";

export function cellState(record: FeeRecord | undefined, due: string, today: string, suggested: boolean): CellState {
  if (record) return record.status;
  if (suggested) return "sugestao";
  return today > due ? "atrasado" : "vazio";
}

export type FeeSplit = { splitId: string; associateId: string; entryId: string; entryDate: string; amountCents: number; description: string; linkedPeriods: number[] };
export type FeeSuggestion = { associateId: string; month: number; splitId: string };

/**
 * Rateios de mensalidade ainda sem caixinha viram sugestões: no mês da data do lançamento se ele estiver entre
 * março e dezembro e livre; senão, no mês mais antigo ainda livre do associado. Um rateio por caixinha.
 */
export function suggestFeeMonths(year: number, splits: FeeSplit[], records: FeeRecord[]): FeeSuggestion[] {
  const taken = new Set(records.map((r) => `${r.associateId}:${r.month}`));
  const result: FeeSuggestion[] = [];
  const pending = splits
    .filter((s) => s.linkedPeriods.length === 0 && s.amountCents > 0 && s.entryDate.startsWith(`${year}-`))
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.splitId.localeCompare(b.splitId));
  for (const split of pending) {
    const entryMonth = Number(split.entryDate.slice(5, 7));
    const free = (month: number) => !taken.has(`${split.associateId}:${month}`);
    const month = FEE_MONTHS.includes(entryMonth as FeeMonth) && free(entryMonth) ? entryMonth : FEE_MONTHS.find(free);
    if (!month) continue;
    taken.add(`${split.associateId}:${month}`);
    result.push({ associateId: split.associateId, month, splitId: split.splitId });
  }
  return result;
}

export type MonthSummary = { pago: number; atencao: number; atrasado: number };

/** Totais por mês (pessoas não isentas). */
export function monthSummary(states: CellState[][]): MonthSummary[] {
  return FEE_MONTHS.map((_, column) => {
    const summary: MonthSummary = { pago: 0, atencao: 0, atrasado: 0 };
    for (const row of states) {
      const state = row[column];
      if (state === "pago" || state === "atencao" || state === "atrasado") summary[state] += 1;
    }
    return summary;
  });
}

// Grade do ano -------------------------------------------------------------------------

export type FeeAssociate = { id: string; name: string; branch: string; section: string | null; active: boolean };
export type FeeExemption = { associateId: string; reason: string };

export type FeeRow = {
  associate: FeeAssociate;
  exemption: FeeExemption | null;
  /** Um por mês de FEE_MONTHS. */
  cells: { month: number; state: CellState; record?: FeeRecord; suggestion?: FeeSuggestion }[];
  paid: number;
  overdue: number;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

/**
 * Linhas da grade: associados ativos e os inativos com registro no ano, em ordem alfabética.
 * Isentos vêm marcados (sem atrasos); `overdue` conta os meses atrasados.
 */
export function buildFeeRows(input: {
  year: number; today: string; settings: FeeSettings; associates: FeeAssociate[]; records: FeeRecord[];
  exemptions: FeeExemption[]; suggestions: FeeSuggestion[];
}): FeeRow[] {
  const { year, today, settings } = input;
  const dues = FEE_MONTHS.map((month) => dueDate(year, month, settings));
  const recordKey = (associateId: string, month: number) => `${associateId}:${month}`;
  const records = new Map(input.records.map((r) => [recordKey(r.associateId, r.month), r]));
  const suggestions = new Map(input.suggestions.map((s) => [recordKey(s.associateId, s.month), s]));
  const exemptions = new Map(input.exemptions.map((e) => [e.associateId, e]));
  const withRecord = new Set(input.records.map((r) => r.associateId));
  return input.associates
    .filter((a) => a.active || withRecord.has(a.id) || exemptions.has(a.id))
    .sort(byName)
    .map((associate) => {
      const exemption = exemptions.get(associate.id) ?? null;
      const cells = FEE_MONTHS.map((month, i) => {
        const record = records.get(recordKey(associate.id, month));
        const suggestion = suggestions.get(recordKey(associate.id, month));
        const state = cellState(record, dues[i], today, Boolean(suggestion));
        // isento não fica atrasado
        return { month, state: exemption && state === "atrasado" ? "vazio" as const : state, record, suggestion };
      });
      return {
        associate, exemption, cells,
        paid: cells.filter((c) => c.state === "pago").length,
        overdue: cells.filter((c) => c.state === "atrasado").length,
      };
    });
}

/** Quem tem mensalidades atrasadas, do maior número para o menor (empate: nome). */
export function overdueRanking(rows: FeeRow[]) {
  return rows.filter((row) => !row.exemption && row.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || byName(a.associate, b.associate))
    .map((row) => ({ associate: row.associate, overdue: row.overdue }));
}

export type FeeAmounts = {
  /** Total recebido por associado no ano (centavos). */
  byAssociate: Record<string, number>;
  /** Recebido em cada mês de FEE_MONTHS, pela data do lançamento. */
  byMonth: number[];
  /** Recebido em janeiro e fevereiro (fora da grade). */
  outsideGrid: number;
  total: number;
  count: number;
};

/**
 * Valores de mensalidade recebidos no ano: rateios da rubrica de mensalidade lançados no ano, pela data do
 * lançamento (um pagamento de vários meses conta uma vez, no mês em que entrou).
 */
export function feeAmounts(year: number, splitsByAssociate: Record<string, FeeSplit[]>): FeeAmounts {
  const result: FeeAmounts = { byAssociate: {}, byMonth: FEE_MONTHS.map(() => 0), outsideGrid: 0, total: 0, count: 0 };
  for (const [associateId, splits] of Object.entries(splitsByAssociate)) {
    for (const split of splits) {
      if (!split.entryDate.startsWith(`${year}-`)) continue;
      const month = Number(split.entryDate.slice(5, 7));
      const column = FEE_MONTHS.indexOf(month as FeeMonth);
      if (column >= 0) result.byMonth[column] += split.amountCents; else result.outsideGrid += split.amountCents;
      result.byAssociate[associateId] = (result.byAssociate[associateId] ?? 0) + split.amountCents;
      result.total += split.amountCents;
      result.count += 1;
    }
  }
  return result;
}
