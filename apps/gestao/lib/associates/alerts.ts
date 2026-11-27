import { FILHOTES_ENABLED } from "@/lib/features";
import { ageInYearsMonths, type AssociateProfile, type ScoutBranch } from "./model";

// Alertas do Associados para o Início geral: datas comemorativas por perto e jovens em período de transição de ramo.

/** Janela das datas comemorativas: dias antes de hoje e depois de hoje. */
export const DATES_BEFORE_DAYS = 5;
export const DATES_AFTER_DAYS = 15;
/** Registros (itens de controle com validade) que vencem nestes dias aparecem no Início, com os já vencidos. */
export const VALIDITY_WARNING_DAYS = 30;

/**
 * Faixas dos ramos (POR): Filhote dos 5 aos 7 (se o grupo tiver o ramo; aí o Lobinho começa aos 7, com transição a
 * partir dos 6½), senão Lobinho a partir de 6½ anos; Escoteiro aos 10–11, Sênior aos 14–15, Pioneiro no aniversário
 * de 18, partida do Pioneiro entre 18 e 22. Para cada ramo, a transição tem dois alertas, contados da data de nascimento:
 * - aviso (`warnMonths`): hora de pensar na transição (ou, no Pioneiro, de programar a partida);
 * - crítico (`criticalMonths`): já devia estar no ramo seguinte (ou ter saído). `afterBirthday`: o crítico começa no dia
 *   seguinte ao aniversário (Sênior → Pioneiro é exatamente no aniversário de 18 anos, não antes).
 * Marcar "começamos a transição" (`transition_started_on`, 050) troca o aviso por "em transição"; o crítico continua
 * valendo até a passagem (troca de ramo) ou o desligamento, que apagam a marca.
 */
export type TransitionRule = {
  branch: ScoutBranch;
  label: string;
  warnMonths: number;
  criticalMonths: number;
  afterBirthday?: boolean;
  warn: string;
  critical: string;
  started: string;
  startAction: string;
};
const FILHOTE_RULE: TransitionRule = {
  branch: "filhote",
  label: "Filhote → Lobinho",
  warnMonths: 6 * 12 + 6,
  criticalMonths: 7 * 12,
  warn: "Pensar na transição",
  critical: "Já devia estar no Lobinho",
  started: "Em transição",
  startAction: "Começamos a transição",
};

const BASE_RULES: TransitionRule[] = [
  {
    branch: "lobinho",
    label: "Lobinho → Escoteiro",
    warnMonths: 10 * 12,
    criticalMonths: 11 * 12,
    warn: "Pensar na transição",
    critical: "Já devia estar no Escoteiro",
    started: "Em transição",
    startAction: "Começamos a transição",
  },
  {
    branch: "escoteiro",
    label: "Escoteiro → Sênior",
    warnMonths: 14 * 12,
    criticalMonths: 15 * 12,
    warn: "Pensar na transição",
    critical: "Já devia estar no Sênior",
    started: "Em transição",
    startAction: "Começamos a transição",
  },
  {
    branch: "senior",
    label: "Sênior → Pioneiro",
    warnMonths: 17 * 12 + 6,
    criticalMonths: 18 * 12,
    afterBirthday: true,
    warn: "Preparar a passagem no aniversário de 18 anos",
    critical: "Passou do aniversário de 18 anos",
    started: "Em transição",
    startAction: "Começamos a transição",
  },
  {
    branch: "pioneiro",
    label: "Partida do Pioneiro",
    warnMonths: 21 * 12 + 6,
    criticalMonths: 22 * 12,
    warn: "Programar a partida (desligar ou passar a adulto)",
    critical: "Passou dos 22 anos: falta a partida",
    started: "Partida programada",
    startAction: "Partida programada",
  },
];

/** Regras de transição em uso; a do Filhote só com o ramo ligado (`FILHOTES_ENABLED`). */
export const transitionRules = (filhotes: boolean) => (filhotes ? [FILHOTE_RULE, ...BASE_RULES] : BASE_RULES);
export const TRANSITIONS = transitionRules(FILHOTES_ENABLED);

export type DateKind = "aniversario" | "promessa";
export type UpcomingDate = {
  associateId: string;
  name: string;
  kind: DateKind;
  /** Data da comemoração neste ciclo (`AAAA-MM-DD`). */
  on: string;
  /** Dias de hoje até a data (negativo = já passou). */
  days: number;
  /** Anos completados na data. */
  years: number;
};
export type TransitionLevel = "aviso" | "iniciada" | "critico";
export type Transition = {
  associateId: string;
  name: string;
  label: string;
  level: TransitionLevel;
  /** Idade hoje, em anos e meses completos. */
  age: { years: number; months: number };
  /** Texto do alerta ("Pensar na transição", "Já devia estar no Escoteiro"…). */
  text: string;
  /** Desde quando vale o aviso e quando começa o crítico (`AAAA-MM-DD`). */
  warnOn: string;
  criticalOn: string;
  /** Idade-limite do ramo (fim do período de transição), `AAAA-MM-DD`. */
  dueOn: string;
  /** Data em que a transição foi marcada como iniciada, se foi. */
  startedOn: string | null;
};

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toISO = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Aniversário de `date` no ano `year`; 29/02 vira 01/03 em ano não bissexto. */
function inYear(date: string, year: number): string {
  const [, m, d] = date.split("-").map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (m === 2 && d === 29 && !leap) return `${year}-03-01`;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Ocorrência de `date` mais perto de `today` dentro da janela, ou nula. */
function occurrence(date: string, today: string, before: number, after: number): { on: string; days: number } | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const on = inYear(date, y);
    if (on <= date) continue; // a própria data (ano zero) não conta
    const days = Math.round((toTime(on) - toTime(today)) / DAY);
    if (days >= -before && days <= after) return { on, days };
  }
  return null;
}

/** Aniversários e aniversários de promessa dos ativos na janela, do mais antigo para o mais distante. */
export function upcomingDates(
  people: Pick<AssociateProfile, "id" | "name" | "active" | "birth_date" | "promise_date">[],
  today: string,
  before = DATES_BEFORE_DAYS,
  after = DATES_AFTER_DAYS,
): UpcomingDate[] {
  const result: UpcomingDate[] = [];
  for (const person of people) {
    if (!person.active) continue;
    for (const [kind, date] of [
      ["aniversario", person.birth_date],
      ["promessa", person.promise_date],
    ] as const) {
      if (!date) continue;
      const hit = occurrence(date, today, before, after);
      if (hit)
        result.push({
          associateId: person.id,
          name: person.name,
          kind,
          ...hit,
          years: Number(hit.on.slice(0, 4)) - Number(date.slice(0, 4)),
        });
    }
  }
  return result.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "pt-BR"));
}

/** `date` mais `months` meses; dia que não existe no mês de destino vira o último dia (31/08 + 6 meses = 28/02). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

type TransitionPerson = Pick<AssociateProfile, "id" | "name" | "active" | "branch" | "birth_date"> & {
  transition_started_on?: string | null;
};

/** Período de transição do ramo: do aviso (`warnOn`) à idade-limite (`dueOn`); o crítico começa em `criticalOn`. */
export type TransitionWindow = { rule: TransitionRule; warnOn: string; dueOn: string; criticalOn: string };

/** Período de transição do jovem no ramo atual, qualquer que seja hoje; nulo para adulto ou sem nascimento. */
export function transitionWindow(
  person: Pick<TransitionPerson, "branch" | "birth_date">,
  rules = TRANSITIONS,
): TransitionWindow | null {
  const rule = rules.find((t) => t.branch === person.branch);
  if (!rule || !person.birth_date) return null;
  const dueOn = addMonths(person.birth_date, rule.criticalMonths);
  return {
    rule,
    warnOn: addMonths(person.birth_date, rule.warnMonths),
    dueOn,
    criticalOn: rule.afterBirthday ? toISO(toTime(dueOn) + DAY) : dueOn,
  };
}

/** Situação da transição de um jovem ativo hoje, ou nula (fora da janela, adulto, desligado ou sem nascimento). */
export function transitionOf(person: TransitionPerson, today: string, rules = TRANSITIONS): Transition | null {
  const span = person.active ? transitionWindow(person, rules) : null;
  if (!span || today < span.warnOn) return null;
  const { rule, warnOn, dueOn, criticalOn } = span;
  const startedOn = person.transition_started_on ?? null;
  const level: TransitionLevel = today >= criticalOn ? "critico" : startedOn ? "iniciada" : "aviso";
  const text = level === "critico" ? rule.critical : level === "iniciada" ? rule.started : rule.warn;
  return {
    associateId: person.id,
    name: person.name,
    age: ageInYearsMonths(person.birth_date, today) ?? { years: 0, months: 0 },
    label: rule.label,
    level,
    text,
    warnOn,
    criticalOn,
    dueOn,
    startedOn,
  };
}

const LEVEL_ORDER: Record<TransitionLevel, number> = { critico: 0, aviso: 1, iniciada: 2 };

/** Jovens ativos na janela de transição do próprio ramo: críticos primeiro, depois avisos e em transição; mais velhos primeiro. */
export function transitions(people: TransitionPerson[], today: string): Transition[] {
  return people
    .flatMap((person) => transitionOf(person, today) ?? [])
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
        a.criticalOn.localeCompare(b.criticalOn) ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
}

/** Validade de registro (item de controle com data de validade) vencida ou vencendo, de um associado ativo. */
export type Expiry = { associateId: string; name: string; item: string; validUntil: string; days: number };

/**
 * Vencimentos para o Início: situações "ok" de associados ativos com `valid_until` já passado ou até `days` dias à
 * frente. Vencidos primeiro (o mais antigo antes), depois os que vencem antes; empate pelo nome.
 */
export function registrationExpiries(
  rows: { associate_id: string | null; item_id: string; status: string; valid_until: string | null }[],
  people: { id: string; name: string; active: boolean }[],
  items: { id: string; name: string }[],
  today: string,
  days = VALIDITY_WARNING_DAYS,
): Expiry[] {
  const until = toISO(toTime(today) + days * DAY);
  const person = new Map(people.filter((p) => p.active).map((p) => [p.id, p.name]));
  const itemName = new Map(items.map((i) => [i.id, i.name]));
  return rows
    .flatMap((row) => {
      const name = row.associate_id && person.get(row.associate_id);
      const item = itemName.get(row.item_id);
      if (row.status !== "ok" || !row.valid_until || row.valid_until > until || !name || !item) return [];
      return [
        {
          associateId: row.associate_id!,
          name,
          item,
          validUntil: row.valid_until,
          days: Math.round((toTime(row.valid_until) - toTime(today)) / DAY),
        },
      ];
    })
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil) || a.name.localeCompare(b.name, "pt-BR"));
}

/** "hoje", "amanhã", "ontem", "em 3 dias", "há 2 dias". */
export function relativeDay(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}

export type ScouterSection = { id: string; name: string };

/**
 * Seções em que a pessoa é escotista hoje (funções `escotista` em curso, com seção), na ordem do nome. Mesma regra de
 * `associates_section_alert_rows` (002), usada no Início para mostrar primeiro os avisos da própria seção.
 */
export function scouterSections(
  functions: {
    kind: string;
    section_id: string | null;
    section: string | null;
    started_on: string | null;
    ended_on: string | null;
  }[],
  today: string,
): ScouterSection[] {
  const sections = new Map<string, string>();
  for (const f of functions) {
    if (f.kind !== "escotista" || !f.section_id) continue;
    if ((f.started_on && f.started_on > today) || (f.ended_on && f.ended_on < today)) continue;
    sections.set(f.section_id, f.section ?? "Seção");
  }
  return [...sections].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
