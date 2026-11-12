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

/** Registrados à mão. "nao_pago" é a dívida confirmada (com observação); "atrasado" é só calculado. */
export type FeeStatus = "pago" | "atencao" | "nao_pago";
export type FeeRecord = { associateId: string; month: number; status: FeeStatus; note: string | null; splitIds: string[] };

/** pago/atencao registrados; atrasado = passou do vencimento sem registro; sugestao = rateio a confirmar; vazio = o resto. */
/** "fora": mês em que o associado não está no grupo (saiu, ainda não entrou): sem cobrança nem atraso. */
export type CellState = "pago" | "atencao" | "nao_pago" | "atrasado" | "sugestao" | "vazio" | "fora";

export type MovementKind = "entrada" | "saida";
export type AssociateMovement = { id: string; associateId: string; date: string; kind: MovementKind; reason: string | null };

/**
 * Meses (de FEE_MONTHS) em que o associado está no grupo, pelas entradas, saídas e retornos.
 * Sem movimentações: todos. Antes da primeira movimentação, está fora se ela é uma entrada e dentro se é uma saída.
 * O mês conta se ele está no grupo no dia 1º ou se entra durante o mês.
 */
export function monthsInGroup(year: number, movements: Pick<AssociateMovement, "date" | "kind">[]): Set<number> {
  if (!movements.length) return new Set(FEE_MONTHS);
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "saida" ? -1 : 1));
  const inBefore = (date: string) => {
    let inside = sorted[0].kind === "saida";
    for (const movement of sorted) {
      if (movement.date >= date) break;
      inside = movement.kind === "entrada";
    }
    return inside;
  };
  const result = new Set<number>();
  for (const month of FEE_MONTHS) {
    const start = iso(year, month, 1);
    const next = month === 12 ? iso(year + 1, 1, 1) : iso(year, month + 1, 1);
    const entersDuring = sorted.some((m) => m.kind === "entrada" && m.date >= start && m.date < next);
    if (inBefore(start) || entersDuring) result.add(month);
  }
  return result;
}

export function cellState(record: FeeRecord | undefined, due: string, today: string, suggested: boolean): CellState {
  if (record) return record.status;
  if (suggested) return "sugestao";
  return today > due ? "atrasado" : "vazio";
}

export type FeeSplit = { splitId: string; associateId: string; entryId: string; entryDate: string; amountCents: number; description: string; linkedPeriods: number[] };

/** Valor do ano: mensal e desconto percentual para o pagamento integral (10 meses) até a data-limite. */
export type FeePrice = { monthlyCents: number; discountPct: number; deadline: string | null };

export function annualAmounts(price: FeePrice) {
  const full = price.monthlyCents * FEE_MONTHS.length;
  const discounted = Math.round(full * (100 - price.discountPct) / 100);
  return { full, discounted };
}

/** O rateio é o pagamento integral do ano: valor cheio, ou com desconto se lançado até a data-limite. */
export function isIntegralPayment(split: Pick<FeeSplit, "amountCents" | "entryDate">, price: FeePrice) {
  const { full, discounted } = annualAmounts(price);
  if (split.amountCents === full) return true;
  return price.discountPct > 0 && price.deadline !== null && split.entryDate <= price.deadline && split.amountCents === discounted;
}

export type FeeSuggestion = {
  associateId: string; month: number; splitId: string;
  /** pago, ou atencao quando o valor não fecha uma mensalidade inteira. */
  status: FeeStatus;
  note?: string;
  /** Faz parte de um pagamento integral do ano. */
  integral?: boolean;
};

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Rateios de mensalidade ainda sem caixinha viram sugestões, a partir do mês da data do lançamento (se estiver entre
 * março e dezembro e livre; senão, o primeiro mês livre), seguindo pelos meses livres seguintes:
 * - sem valor do ano configurado: um mês por rateio;
 * - pagamento integral (cheio, ou com desconto até a data-limite): todos os meses livres;
 * - senão, um mês por mensalidade inteira paga; o que sobrar vira Atenção ("pagou R$ 30,00 de R$ 60,00").
 */
/** Valor que vale para o associado: o individual (se houver) com o desconto do ano, senão o do ano. */
export function priceForAssociate(base: FeePrice | null, individualCents: number | undefined): FeePrice | null {
  if (individualCents === undefined) return base;
  return { monthlyCents: individualCents, discountPct: base?.discountPct ?? 0, deadline: base?.deadline ?? null };
}

export function suggestFeeMonths(year: number, splits: FeeSplit[], records: FeeRecord[],
  price?: FeePrice | null | ((associateId: string) => FeePrice | null)): FeeSuggestion[] {
  const priceOf = typeof price === "function" ? price : () => price ?? null;
  const taken = new Set(records.map((r) => `${r.associateId}:${r.month}`));
  const result: FeeSuggestion[] = [];
  const pending = splits
    .filter((s) => s.linkedPeriods.length === 0 && s.amountCents > 0 && s.entryDate.startsWith(`${year}-`))
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.splitId.localeCompare(b.splitId));
  for (const split of pending) {
    const free = FEE_MONTHS.filter((month) => !taken.has(`${split.associateId}:${month}`));
    if (!free.length) continue;
    const entryMonth = Number(split.entryDate.slice(5, 7));
    const start = Math.max(0, free.findIndex((month) => month >= entryMonth));
    const ordered = free.includes(entryMonth as FeeMonth) ? [...free.slice(start), ...free.slice(0, start)] : free;
    const push = (month: number, extra: Partial<FeeSuggestion> = {}) => {
      taken.add(`${split.associateId}:${month}`);
      result.push({ associateId: split.associateId, month, splitId: split.splitId, status: "pago", ...extra });
    };
    const own = priceOf(split.associateId);
    // sem valor (ou valor zero, ex.: bolsa integral) não há como conferir: um mês por rateio
    if (!own || own.monthlyCents <= 0) { push(ordered[0]); continue; }
    if (isIntegralPayment(split, own)) { ordered.forEach((month) => push(month, { integral: true })); continue; }
    const whole = Math.floor(split.amountCents / own.monthlyCents);
    const rest = split.amountCents % own.monthlyCents;
    ordered.slice(0, whole).forEach((month) => push(month));
    if (rest > 0 && ordered[whole] !== undefined) push(ordered[whole], { status: "atencao", note: `pagou ${brl(rest)} de ${brl(own.monthlyCents)}` });
  }
  return result;
}

export type FeeBalance = { expected: number; received: number; open: number; integral: boolean };

/**
 * Previsto × recebido por associado: 10 mensalidades (ou o valor integral com desconto, se pago assim);
 * isento não tem previsto. `open` nunca é negativo.
 */
export function feeBalance(row: Pick<FeeRow, "exemption"> & { monthsInGroup?: number }, splits: FeeSplit[], year: number, price: FeePrice | null): FeeBalance {
  const inYear = splits.filter((s) => s.entryDate.startsWith(`${year}-`));
  const received = inYear.reduce((sum, s) => sum + s.amountCents, 0);
  if (!price || row.exemption) return { expected: 0, received, open: 0, integral: false };
  const months = row.monthsInGroup ?? FEE_MONTHS.length;
  const { full, discounted } = annualAmounts(price);
  // o desconto do integral só vale para quem está no grupo o ano todo
  const integral = months === FEE_MONTHS.length && inYear.some((s) => isIntegralPayment(s, price) && s.amountCents === discounted && discounted !== full);
  const expected = integral ? discounted : months === FEE_MONTHS.length ? full : price.monthlyCents * months;
  return { expected, received, open: Math.max(0, expected - received), integral };
}

/** Contagem de cada estado no mês; `late` soma os atrasados calculados e os "não pago" registrados. */
export type MonthSummary = Record<CellState, number> & { late: number };

/** Totais por mês (as linhas passadas; a grade exclui os ocultos). */
export function monthSummary(states: CellState[][]): MonthSummary[] {
  return FEE_MONTHS.map((_, column) => {
    const summary: MonthSummary = { pago: 0, atencao: 0, nao_pago: 0, atrasado: 0, sugestao: 0, vazio: 0, fora: 0, late: 0 };
    for (const row of states) {
      const state = row[column];
      if (!state) continue;
      summary[state] += 1;
      if (state === "atrasado" || state === "nao_pago") summary.late += 1;
    }
    return summary;
  });
}

// Grade do ano -------------------------------------------------------------------------

export type FeeAssociate = { id: string; name: string; branch: string; section: string | null; patrol?: string | null; active: boolean };
export type FeeExemption = { associateId: string; reason: string };

export type FeeRow = {
  associate: FeeAssociate;
  exemption: FeeExemption | null;
  /** Entradas e saídas do associado (todas, em ordem de data). */
  movements: AssociateMovement[];
  /** Meses do ano em que está no grupo (0 = oculto no ano). */
  monthsInGroup: number;
  /** Por que a linha fica oculta por padrão: isento no ano ou fora do grupo o ano todo. */
  hidden: "isento" | "fora" | null;
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
  exemptions: FeeExemption[]; suggestions: FeeSuggestion[]; movements?: AssociateMovement[];
}): FeeRow[] {
  const { year, today, settings } = input;
  const dues = FEE_MONTHS.map((month) => dueDate(year, month, settings));
  const recordKey = (associateId: string, month: number) => `${associateId}:${month}`;
  const records = new Map(input.records.map((r) => [recordKey(r.associateId, r.month), r]));
  const suggestions = new Map(input.suggestions.map((s) => [recordKey(s.associateId, s.month), s]));
  const exemptions = new Map(input.exemptions.map((e) => [e.associateId, e]));
  const withRecord = new Set(input.records.map((r) => r.associateId));
  const movementsOf = new Map<string, AssociateMovement[]>();
  for (const movement of [...(input.movements ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
    movementsOf.set(movement.associateId, [...(movementsOf.get(movement.associateId) ?? []), movement]);
  }
  return input.associates
    .filter((a) => a.active || withRecord.has(a.id) || exemptions.has(a.id) || movementsOf.has(a.id))
    .sort(byName)
    .map((associate) => {
      const exemption = exemptions.get(associate.id) ?? null;
      const movements = movementsOf.get(associate.id) ?? [];
      const inGroup = monthsInGroup(year, movements);
      const cells = FEE_MONTHS.map((month, i) => {
        const record = records.get(recordKey(associate.id, month));
        const suggestion = suggestions.get(recordKey(associate.id, month));
        // fora do grupo: sem cobrança (um registro manual continua valendo)
        const state: CellState = !record && !inGroup.has(month) ? "fora" : cellState(record, dues[i], today, Boolean(suggestion));
        // isento não fica atrasado
        return { month, state: exemption && state === "atrasado" ? "vazio" as const : state, record, suggestion };
      });
      return {
        associate, exemption, cells, movements,
        monthsInGroup: inGroup.size,
        hidden: exemption ? "isento" as const : inGroup.size === 0 ? "fora" as const : null,
        paid: cells.filter((c) => c.state === "pago").length,
        // atrasado (calculado) e não pago (registrado) contam como dívida
        overdue: cells.filter((c) => c.state === "atrasado" || c.state === "nao_pago").length,
      };
    });
}

/** Quem tem mensalidades atrasadas, do maior número para o menor (empate: nome). */
export function overdueRanking(rows: FeeRow[]) {
  return rows.filter((row) => !row.hidden && row.overdue > 0)
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
