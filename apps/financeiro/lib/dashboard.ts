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
