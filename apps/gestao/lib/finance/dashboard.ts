/** Dias da janela de "Últimos lançamentos" no Início (hoje e os 7 anteriores). */
export const RECENT_DAYS = 7;

/** Primeiro dia da janela: `today` (AAAA-MM-DD) menos `days` dias. */
export function recentWindowStart(today: string, days = RECENT_DAYS): string {
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/**
 * Início efetivo da lista: o último dia com lançamentos antes da janela entra inteiro,
 * para a lista nunca começar vazia nem cortar um dia ao meio.
 */
export function recentListStart(windowStart: string, previousDay: string | null | undefined): string {
  return previousDay && previousDay < windowStart ? previousDay : windowStart;
}

/** Total de receitas ou despesas de um mês (centavos; despesa positiva). */
export type MonthTotals = { income: number; expense: number };

/** Soma do Realizado por rubrica e mês (`realized_by_month`). */
export type MonthSum = { category_id: string; month: number; amount_cents: number };

/** Receitas e despesas por mês (12 meses). Rubrica sem tipo vale pelo sinal. */
export function monthlyTotals(sums: MonthSum[], kinds: Map<string, "receita" | "despesa" | null>): MonthTotals[] {
  const months = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  for (const s of sums) {
    const amount = Number(s.amount_cents);
    const kind = kinds.get(s.category_id) ?? (amount < 0 ? "despesa" : "receita");
    if (kind === "despesa") months[s.month - 1].expense -= amount;
    else months[s.month - 1].income += amount;
  }
  return months;
}

/** Dia seguinte (AAAA-MM-DD): saldo "hoje" = tudo antes de amanhã. */
export function nextDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}
