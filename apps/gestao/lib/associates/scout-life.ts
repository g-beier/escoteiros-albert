// Vida escoteira (004): períodos de atividade, contagem a partir da promessa, estrelas de atividade, aviso de entrega,
// sugestão de períodos a partir do cadastro e a linha do tempo. Puro; dados em lib/server/associates/scout-life.ts.
//
// Datas `AAAA-MM-DD`. Períodos são [início, fim): na passagem um termina e o outro começa no mesmo dia; fim vazio =
// vigente. A contagem começa na promessa (sem promessa, não conta) e para nas lacunas: a estrela N cai na promessa
// mais N anos, empurrada pela soma das lacunas até ali.

import type { AssociateFunction } from "./controls";
import { activityPeriods, branchLabels, type AssociateMove, type AssociateMovement, type ScoutBranch } from "./model";
import { BRANCH_COLORS, ROLE_COLORS } from "./reports";

export const LIFE_SOURCES = ["manual", "automatico", "cadastro", "planilha"] as const;
export type LifeSource = (typeof LIFE_SOURCES)[number];
export const lifeSourceLabels: Record<LifeSource, string> = {
  manual: "à mão", automatico: "automático", cadastro: "sugestão do cadastro", planilha: "planilha",
};

/** Período de `associate_life_periods`. `adulto` = escotista ou dirigente; `place` vazio = este grupo. */
export type LifePeriod = {
  id: string; branch: ScoutBranch; started_on: string; ended_on: string | null; place: string | null; source: LifeSource;
};
/** Linha de `associate_stars`: ramo corrigido e entrega de uma estrela. */
export type StarRecord = { star: number; branch: ScoutBranch | null; delivered_on: string | null };
/** Evento do histórico lançado à mão (`associate_life_events`). */
export type LifeEvent = { id: string; event_date: string; title: string; description: string | null };

/** Motivos de tempo no grupo que não conta (POR, Regra 173, II b e c). */
export const EXCLUSION_REASONS = ["frequencia", "licenca", "suspensao", "outro"] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];
export const exclusionReasonLabels: Record<ExclusionReason, string> = {
  frequencia: "Frequência de até 70%", licenca: "Licença acima de 60 dias", suspensao: "Suspensão disciplinar", outro: "Outro motivo",
};
/** Período não contabilizado (`associate_life_exclusions`, 005): [início, fim), descontado da contagem. */
export type LifeExclusion = { id: string; started_on: string; ended_on: string; reason: ExclusionReason; note: string | null };

/** Dias antes da estrela em que o aviso de entrega começa (e fica até a entrega). */
export const STAR_NOTICE_DAYS = 15;
/** Funções de adulto que contam para o tempo de atividade. */
export const COUNTING_FUNCTIONS = ["escotista", "dirigente"] as const;

/** Rótulo do ramo do período: o adulto aparece como "Escotista ou dirigente". */
export const lifeBranchLabel = (branch: ScoutBranch) => (branch === "adulto" ? "Escotista ou dirigente" : branchLabels[branch]);
/** Rótulo curto (barras, estrelas). */
export const lifeBranchShort = (branch: ScoutBranch) => (branch === "adulto" ? "Adulto" : branchLabels[branch]);
/** Cor do período: a do ramo; adulto (escotista ou dirigente) em azul, como na planilha. */
export const lifeBranchColor = (branch: ScoutBranch) => (branch === "adulto" ? ROLE_COLORS.dirigente : BRANCH_COLORS[branch]);

// Datas --------------------------------------------------------------------------------------------------------------

const toTime = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);
const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY);
export const addDays = (iso: string, days: number) => fromTime(toTime(iso) + days * DAY);
/** Soma anos; 29/2 cai em 28/2 nos anos comuns. */
export function addYears(iso: string, years: number) {
  const year = Number(iso.slice(0, 4)) + years;
  const [month, day] = [Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${iso.slice(5, 7)}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
const maxDate = (a: string, b: string) => (a > b ? a : b);
const minDate = (a: string, b: string) => (a < b ? a : b);

// Contagem ------------------------------------------------------------------------------------------------------------

/** Trecho que conta: [start, end), `end` nulo = vigente. */
type Segment = { branch: ScoutBranch; start: string; end: string | null };

/**
 * Períodos em ordem, cortados na promessa (o que vem antes não conta) e sem os trechos não contabilizados
 * (`exclusions`), que viram lacunas.
 */
export function countedSegments(periods: Pick<LifePeriod, "branch" | "started_on" | "ended_on">[], promiseDate: string | null,
  exclusions: Pick<LifeExclusion, "started_on" | "ended_on">[] = []): Segment[] {
  if (!promiseDate) return [];
  const segments = [...periods]
    .sort((a, b) => a.started_on.localeCompare(b.started_on))
    .filter((p) => p.ended_on === null || p.ended_on > promiseDate)
    .map((p) => ({ branch: p.branch, start: maxDate(p.started_on, promiseDate), end: p.ended_on }));
  return subtractExclusions(segments, exclusions);
}

/** Tira de cada trecho os intervalos [início, fim) não contabilizados, partindo o trecho quando o corte cai no meio. */
export function subtractExclusions(segments: Segment[], exclusions: Pick<LifeExclusion, "started_on" | "ended_on">[]): Segment[] {
  const cuts = [...exclusions].sort((a, b) => a.started_on.localeCompare(b.started_on));
  const result: Segment[] = [];
  for (const segment of segments) {
    let pieces: Segment[] = [segment];
    for (const x of cuts) {
      pieces = pieces.flatMap((piece) => {
        const overlaps = x.started_on < (piece.end ?? "9999-12-31") && x.ended_on > piece.start;
        if (!overlaps) return [piece];
        return [
          ...(x.started_on > piece.start ? [{ ...piece, end: x.started_on }] : []),
          ...(piece.end === null || x.ended_on < piece.end ? [{ ...piece, start: x.ended_on }] : []),
        ];
      });
    }
    result.push(...pieces);
  }
  return result;
}

/** Dias que contam até `today` (exclusive). */
export function countedDays(segments: Segment[], today: string) {
  return segments.reduce((sum, s) => sum + Math.max(0, daysBetween(s.start, minDate(s.end ?? today, today))), 0);
}

/**
 * Data de cada estrela até `upTo` (inclusive) e a primeira depois dela, se o período vigente chegar lá. Cada estrela
 * cai na data do início mais N anos, somadas as lacunas entre os trechos até ali.
 */
export function starDates(segments: Segment[], upTo: string): string[] {
  if (segments.length === 0) return [];
  const base = segments[0].start;
  const dates: string[] = [];
  for (let n = 1; n <= 99; n += 1) {
    let shift = 0;
    let due: string | null = null;
    for (let i = 0; i < segments.length; i += 1) {
      if (i > 0) shift += daysBetween(segments[i - 1].end as string, segments[i].start);
      const candidate = addDays(addYears(base, n), shift);
      const end = segments[i].end;
      if (end === null || candidate <= end) { due = candidate; break; }
    }
    if (!due) break;
    dates.push(due);
    if (due > upTo) break;
  }
  return dates;
}

/** Dias de cada ramo entre `from` e `to` (exclusive), só nos trechos; `skipHolidays` tira janeiro e fevereiro. */
function branchDays(segments: Segment[], from: string, to: string, skipHolidays: boolean) {
  const days = new Map<ScoutBranch, number>();
  for (const s of segments) {
    const start = maxDate(s.start, from);
    const end = minDate(s.end ?? to, to);
    if (end <= start) continue;
    let total = daysBetween(start, end);
    if (skipHolidays) total -= holidayDays(start, end);
    if (total > 0) days.set(s.branch, (days.get(s.branch) ?? 0) + total);
  }
  return days;
}

/** Dias de janeiro e fevereiro (férias) em [start, end), por aritmética de intervalos (sem percorrer dia a dia). */
function holidayDays(start: string, end: string) {
  let total = 0;
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year += 1) {
    const y = String(year).padStart(4, "0");
    const a = maxDate(start, `${y}-01-01`);
    const b = minDate(end, `${y}-03-01`);
    if (b > a) total += daysBetween(a, b);
  }
  return total;
}

/** Ramo com mais dias na conta (empate: o mais recente na ordem dos trechos). */
function mostDays(days: Map<ScoutBranch, number>, order: ScoutBranch[]): ScoutBranch | null {
  let best: ScoutBranch | null = null;
  for (const branch of order) {
    const value = days.get(branch) ?? 0;
    if (value > 0 && (best === null || value >= (days.get(best) ?? 0))) best = branch;
  }
  return best;
}

/**
 * Ramo da estrela: o que tem mais atividade nos 12 meses de atividade que ela fecha (desde a estrela anterior, ou o
 * início), sem contar janeiro e fevereiro (férias). Se o ano só teve férias, conta tudo.
 */
export function starBranch(segments: Segment[], from: string, due: string): ScoutBranch | null {
  const order = [...new Set(segments.map((s) => s.branch))];
  return mostDays(branchDays(segments, from, due, true), order) ?? mostDays(branchDays(segments, from, due, false), order);
}

export type StarStatus = "entregue" | "pendente" | "proxima" | "futura";
export type Star = {
  n: number; dueOn: string;
  /** Ramo mostrado: o corrigido, senão o calculado. */
  branch: ScoutBranch | null; computedBranch: ScoutBranch | null; overridden: boolean;
  /** Data da entrega registrada nesta estrela (as anteriores a uma entrega ficam `entregue` sem data). */
  deliveredOn: string | null;
  status: StarStatus;
};

export type LifeSummary = {
  promiseDate: string | null;
  /** Início da contagem (promessa, ou o primeiro período depois dela). */
  countFrom: string | null;
  /** Anos completos (estrelas vencidas até hoje). */
  years: number;
  days: number;
  /** Estrelas vencidas até hoje e a próxima (se o vigente chegar lá). */
  stars: Star[];
  /**
   * Estrela a entregar depois da última entrega: a mais alta já completada; sem atraso, a que completa nos próximos 15
   * dias. Entregar quita as anteriores.
   */
  pending: Star | null;
  next: Star | null;
  /** Estrelas vencidas por ramo. */
  byBranch: Partial<Record<ScoutBranch, number>>;
  /** Mais de um trecho depois da promessa com intervalo entre eles. */
  hasGaps: boolean;
  /** Período vigente (fim vazio). */
  open: boolean;
};

/** Resumo da vida escoteira de uma pessoa em `today`. */
export function lifeSummary({ periods, promiseDate, records = [], exclusions = [], today }: {
  periods: Pick<LifePeriod, "branch" | "started_on" | "ended_on">[]; promiseDate: string | null; records?: StarRecord[];
  /** Períodos não contabilizados (005): descontados como lacunas. */
  exclusions?: Pick<LifeExclusion, "started_on" | "ended_on">[]; today: string;
}): LifeSummary {
  const segments = countedSegments(periods, promiseDate, exclusions);
  const noticeUntil = addDays(today, STAR_NOTICE_DAYS);
  const byNumber = new Map(records.map((r) => [r.star, r]));
  const lastDelivered = Math.max(0, ...records.filter((r) => r.delivered_on).map((r) => r.star));
  const dates = starDates(segments, today);
  const stars: Star[] = dates.map((dueOn, index) => {
    const n = index + 1;
    const record = byNumber.get(n);
    const computedBranch = starBranch(segments, index === 0 ? segments[0].start : dates[index - 1], dueOn);
    const status: StarStatus = n <= lastDelivered ? "entregue" : dueOn <= noticeUntil ? "pendente" : dueOn > today && index === dates.length - 1 ? "proxima" : "futura";
    return {
      n, dueOn, computedBranch, branch: record?.branch ?? computedBranch, overridden: Boolean(record?.branch),
      deliveredOn: record?.delivered_on ?? null, status,
    };
  });
  const done = stars.filter((s) => s.dueOn <= today);
  const byBranch: Partial<Record<ScoutBranch, number>> = {};
  for (const star of done) if (star.branch) byBranch[star.branch] = (byBranch[star.branch] ?? 0) + 1;
  const hasGaps = segments.some((s, i) => i > 0 && segments[i - 1].end !== null && (segments[i - 1].end as string) < s.start);
  return {
    promiseDate, countFrom: segments[0]?.start ?? null, years: done.length, days: countedDays(segments, today), stars,
    pending: stars.filter((s) => s.status === "pendente" && s.dueOn <= today).at(-1) ?? stars.find((s) => s.status === "pendente") ?? null,
    next: stars.find((s) => s.dueOn > today) ?? null,
    byBranch, hasGaps, open: periods.some((p) => p.ended_on === null),
  };
}

/** "3 estrelas", "1 estrela". */
export const starsLabel = (count: number) => `${count} ${count === 1 ? "estrela" : "estrelas"}`;
/** "12 anos", "1 ano". */
export const yearsLabel = (count: number) => `${count} ${count === 1 ? "ano" : "anos"}`;

// Acompanhamento do período vigente --------------------------------------------------------------------------------

type FunctionLike = Pick<AssociateFunction, "kind" | "started_on" | "ended_on">;
const counts = (fn: FunctionLike, on: string) =>
  (COUNTING_FUNCTIONS as readonly string[]).includes(fn.kind) && (!fn.started_on || fn.started_on <= on) && (!fn.ended_on || fn.ended_on > on);

/** Ramo que deveria estar vigente hoje (mesma regra de `life_expected_branch`, 004). */
export function expectedBranch(associate: { branch: ScoutBranch; active: boolean }, functions: FunctionLike[], today: string): ScoutBranch | null {
  if (!associate.active) return null;
  if (associate.branch !== "adulto") return associate.branch;
  return functions.some((fn) => counts(fn, today)) ? "adulto" : null;
}

/** O que falta para o vigente bater com o cadastro: abrir, encerrar ou trocar, com a data sugerida. */
export type LifeMismatch =
  | { kind: "abrir"; expected: ScoutBranch; date: string }
  | { kind: "encerrar"; open: LifePeriod; date: string }
  | { kind: "trocar"; open: LifePeriod; expected: ScoutBranch; date: string };

/**
 * Compara o período vigente com o cadastro de hoje. A data sugerida é o último evento do cadastro que explica a
 * diferença (entrada, passagem, saída, início ou fim de função), se cair depois do que já está registrado; senão, hoje.
 */
export function lifeMismatch({ associate, periods, functions, moves, movements, today }: {
  associate: { branch: ScoutBranch; active: boolean }; periods: LifePeriod[]; functions: FunctionLike[];
  moves: Pick<AssociateMove, "move_date">[]; movements: Pick<AssociateMovement, "kind" | "movement_date">[]; today: string;
}): LifeMismatch | null {
  const expected = expectedBranch(associate, functions, today);
  const open = periods.find((p) => p.ended_on === null) ?? null;
  if ((open?.branch ?? null) === expected) return null;
  const floor = open ? open.started_on : periods.reduce((last, p) => maxDate(last, p.ended_on ?? p.started_on), "0000-00-00");
  const latest = (dates: (string | null | undefined)[]) => {
    const valid = dates.filter((d): d is string => Boolean(d) && (d as string) >= floor && (d as string) <= today).sort();
    return valid.at(-1) ?? today;
  };
  const counting = functions.filter((fn) => (COUNTING_FUNCTIONS as readonly string[]).includes(fn.kind));
  if (!open && expected) {
    return { kind: "abrir", expected, date: latest([
      ...movements.filter((m) => m.kind === "entrada").map((m) => m.movement_date), ...moves.map((m) => m.move_date),
      ...counting.filter((fn) => counts(fn, today)).map((fn) => fn.started_on),
    ]) };
  }
  if (open && !expected) {
    return { kind: "encerrar", open, date: latest([
      ...movements.filter((m) => m.kind === "saida").map((m) => m.movement_date), ...moves.map((m) => m.move_date),
      ...counting.map((fn) => fn.ended_on),
    ]) };
  }
  return { kind: "trocar", open: open as LifePeriod, expected: expected as ScoutBranch, date: latest(moves.map((m) => m.move_date)) };
}

// Sugestão a partir do cadastro ------------------------------------------------------------------------------------

export type SuggestedPeriod = { branch: ScoutBranch; started_on: string; ended_on: string | null };

/**
 * Períodos que o cadastro sugere: cada entrada até a saída seguinte, dividida pelas passagens (ramo de cada trecho =
 * o de origem da passagem seguinte, ou o atual); no Adulto, só enquanto houver função de escotista ou dirigente.
 */
export function suggestPeriods({ branch, movements, moves, functions, today }: {
  branch: ScoutBranch; movements: AssociateMovement[]; moves: Pick<AssociateMove, "move_date" | "from_branch">[]; functions: FunctionLike[]; today: string;
}): SuggestedPeriod[] {
  const sortedMoves = [...moves].sort((a, b) => a.move_date.localeCompare(b.move_date));
  const branchAt = (day: string) => sortedMoves.find((m) => m.move_date > day)?.from_branch ?? branch;
  const adultRanges = functions
    .filter((fn) => (COUNTING_FUNCTIONS as readonly string[]).includes(fn.kind) && fn.started_on)
    .map((fn) => ({ start: fn.started_on as string, end: fn.ended_on }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const result: SuggestedPeriod[] = [];
  const push = (b: ScoutBranch, start: string, end: string | null) => {
    if (end !== null && end <= start) return;
    const last = result.at(-1);
    if (last && last.branch === b && last.ended_on === start) last.ended_on = end;
    else result.push({ branch: b, started_on: start, ended_on: end });
  };
  for (const presence of activityPeriods(movements)) {
    if (!presence.start) continue;
    const start = presence.start.movement_date;
    const end = presence.end?.movement_date ?? null;
    if (start > today) continue;
    const cuts = [start, ...sortedMoves.map((m) => m.move_date).filter((d) => d > start && (end === null || d < end)), end];
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const [from, to] = [cuts[i] as string, cuts[i + 1]];
      const b = branchAt(from);
      if (b !== "adulto") { push(b, from, to); continue; }
      for (const range of adultRanges) {
        const s = maxDate(range.start, from);
        const e = range.end === null ? to : to === null ? range.end : minDate(range.end, to);
        if (e === null || e > s) push("adulto", s, e);
      }
    }
  }
  return result;
}

/**
 * O que a sugestão acrescenta ao que já está registrado: sem períodos, tudo; com períodos, só o que vem antes do
 * primeiro (cortado no início dele). Sobreposições nunca entram.
 */
export function missingSuggestions(suggested: SuggestedPeriod[], existing: Pick<LifePeriod, "started_on">[]): SuggestedPeriod[] {
  if (existing.length === 0) return suggested;
  const first = existing.map((p) => p.started_on).sort()[0];
  return suggested
    .filter((s) => s.started_on < first)
    .map((s) => ({ ...s, ended_on: s.ended_on === null || s.ended_on > first ? first : s.ended_on }));
}

// Linha do tempo ------------------------------------------------------------------------------------------------------

export type TimelineKind = "promessa" | "entrada" | "saida" | "passagem" | "inicio" | "fim" | "estrela" | "evento" | "excluido";
export type TimelineItem = {
  key: string; date: string; kind: TimelineKind; title: string; detail?: string;
  /** Cor do marcador (ramo); nulo = neutro. */
  branch: ScoutBranch | null;
  /** Evento lançado à mão (editável). */
  event?: LifeEvent;
  /** Período não contabilizado (editável). */
  exclusion?: LifeExclusion;
};
export type TimelineYear = { year: number; branch: ScoutBranch | null; items: TimelineItem[] };

const KIND_ORDER: TimelineKind[] = ["saida", "fim", "passagem", "entrada", "inicio", "promessa", "excluido", "estrela", "evento"];

/**
 * Linha do tempo vertical, um bloco por ano (do mais antigo ao mais recente): promessa, entradas e saídas, passagens,
 * início e fim de períodos (quando não coincidem com entrada, saída ou passagem), estrelas vencidas e os eventos
 * lançados à mão. A cor do ano é o ramo com mais dias nele.
 */
export function timeline({ periods, promiseDate, moves, movements, stars, events, exclusions = [], today }: {
  periods: LifePeriod[]; promiseDate: string | null; moves: AssociateMove[]; movements: AssociateMovement[];
  stars: Star[]; events: LifeEvent[]; exclusions?: LifeExclusion[]; today: string;
}): TimelineYear[] {
  const items: TimelineItem[] = [];
  const sameDay = (date: string, kinds: ("entrada" | "saida")[]) => movements.some((m) => m.movement_date === date && kinds.includes(m.kind));
  const branchOn = (date: string) => periods.find((p) => p.started_on <= date && (p.ended_on === null || p.ended_on > date))?.branch ?? null;
  if (promiseDate) items.push({ key: "promessa", date: promiseDate, kind: "promessa", title: "Promessa", branch: branchOn(promiseDate), detail: "Início da contagem do tempo de atividade." });
  for (const m of movements) {
    items.push({ key: `mov-${m.id}`, date: m.movement_date, kind: m.kind, title: m.kind === "entrada" ? "Entrada no grupo" : "Desligamento",
      detail: m.reason ?? undefined, branch: m.kind === "entrada" ? branchOn(m.movement_date) : null });
  }
  for (const move of moves) {
    items.push({ key: `move-${move.id}`, date: move.move_date, kind: "passagem", title: `Passagem para ${lifeBranchShort(move.to_branch)}`,
      detail: `${branchLabels[move.from_branch]} → ${branchLabels[move.to_branch]}`, branch: move.to_branch });
  }
  for (const p of periods) {
    const where = p.place ? ` (${p.place})` : "";
    if (!moves.some((m) => m.move_date === p.started_on) && !sameDay(p.started_on, ["entrada"])) {
      items.push({ key: `ini-${p.id}`, date: p.started_on, kind: "inicio", title: `Início: ${lifeBranchLabel(p.branch)}${where}`, branch: p.branch });
    }
    if (p.ended_on && !moves.some((m) => m.move_date === p.ended_on) && !sameDay(p.ended_on, ["saida"])
      && !periods.some((q) => q.started_on === p.ended_on)) {
      items.push({ key: `fim-${p.id}`, date: p.ended_on, kind: "fim", title: `Fim: ${lifeBranchLabel(p.branch)}${where}`, branch: null });
    }
  }
  for (const star of stars.filter((s) => s.dueOn <= today)) {
    items.push({ key: `estrela-${star.n}`, date: star.dueOn, kind: "estrela", title: `${star.n}ª estrela de atividade`,
      detail: star.status === "entregue" ? (star.deliveredOn ? `Certificado entregue em ${star.deliveredOn.split("-").reverse().join("/")}` : "Entregue") : "A entregar",
      branch: star.branch });
  }
  for (const x of exclusions) {
    const range = `${x.started_on.split("-").reverse().join("/")} a ${x.ended_on.split("-").reverse().join("/")}`;
    items.push({ key: `exc-${x.id}`, date: x.started_on, kind: "excluido", title: `Não contabilizado: ${exclusionReasonLabels[x.reason].toLowerCase()}`,
      detail: [range, x.note].filter(Boolean).join(" · "), branch: branchOn(x.started_on), exclusion: x });
  }
  for (const event of events) {
    items.push({ key: `ev-${event.id}`, date: event.event_date, kind: "evento", title: event.title, detail: event.description ?? undefined,
      branch: branchOn(event.event_date), event });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const years = new Map<number, TimelineItem[]>();
  for (const item of items) {
    const year = Number(item.date.slice(0, 4));
    years.set(year, [...(years.get(year) ?? []), item]);
  }
  const segments = periods.map((p) => ({ branch: p.branch, start: p.started_on, end: p.ended_on }));
  return [...years].map(([year, yearItems]) => {
    const days = branchDays(segments, `${year}-01-01`, minDate(`${year + 1}-01-01`, addDays(today, 1)), false);
    return { year, branch: mostDays(days, [...new Set(segments.map((s) => s.branch))]), items: yearItems };
  });
}

// Barra (perfil e visão do grupo) ------------------------------------------------------------------------------------

export type BarSegment = {
  branch: ScoutBranch; from: number; to: number; beforePromise: boolean; future: boolean; place: string | null;
  /** Dentro de um período não contabilizado (listrado). */
  excluded: ExclusionReason | null;
};

/**
 * Trechos de uma barra entre `from` e `to` em frações (0–1): cada período, cortado no intervalo e nos pontos de
 * virada: a promessa (antes dela não conta, mostrado mais claro), os períodos não contabilizados (listrados) e hoje
 * (`today`; depois dele é só projeção do vigente).
 */
export function barSegments(periods: LifePeriod[], promiseDate: string | null, from: string, to: string, today?: string,
  exclusions: LifeExclusion[] = []): BarSegment[] {
  const points = [promiseDate, today, ...exclusions.flatMap((x) => [x.started_on, x.ended_on])];
  const excludedAt = (day: string) => exclusions.find((x) => x.started_on <= day && x.ended_on > day)?.reason ?? null;
  const total = Math.max(1, daysBetween(from, to));
  const frac = (day: string) => Math.min(1, Math.max(0, daysBetween(from, day) / total));
  const result: BarSegment[] = [];
  for (const p of [...periods].sort((a, b) => a.started_on.localeCompare(b.started_on))) {
    const start = maxDate(p.started_on, from);
    const end = minDate(p.ended_on ?? to, to);
    if (end <= start) continue;
    const cuts = [start, ...[...new Set(points)].filter((d): d is string => Boolean(d) && (d as string) > start && (d as string) < end).sort(), end];
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const [a, b] = [cuts[i], cuts[i + 1]];
      if (b <= a) continue;
      result.push({ branch: p.branch, from: frac(a), to: frac(b), beforePromise: !promiseDate || b <= promiseDate,
        future: Boolean(today) && a >= (today as string), place: p.place, excluded: excludedAt(a) });
    }
  }
  return result;
}
