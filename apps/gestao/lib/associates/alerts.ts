import { ageInYears, type AssociateProfile, type ScoutBranch } from "./model";

// Alertas do Associados para o Início geral: datas comemorativas por perto e jovens em período de transição de ramo.

/** Janela das datas comemorativas: dias antes de hoje e depois de hoje. */
export const DATES_BEFORE_DAYS = 5;
export const DATES_AFTER_DAYS = 15;
/** Registros (itens de controle com validade) que vencem nestes dias aparecem como alerta. */
export const VALIDITY_WARNING_DAYS = 30;

/**
 * Períodos de transição de ramo (docs/associados/modelo.md, Faixa do ramo / Transição): o jovem aparece no alerta
 * a partir de `fromAge` (anos completos) enquanto continuar no ramo. Provisório: o grupo ainda vai confirmar as idades.
 */
export const TRANSITIONS: { branch: ScoutBranch; fromAge: number; label: string }[] = [
  { branch: "lobinho", fromAge: 10, label: "Lobinho → Escoteiro" },
  { branch: "escoteiro", fromAge: 14, label: "Escoteiro → Sênior" },
  { branch: "senior", fromAge: 17, label: "Sênior → Pioneiro" },
  { branch: "pioneiro", fromAge: 21, label: "Pioneiro → Adulto" },
];

export type DateKind = "aniversario" | "promessa";
export type UpcomingDate = {
  associateId: string; name: string; kind: DateKind;
  /** Data da comemoração neste ciclo (`AAAA-MM-DD`). */
  on: string;
  /** Dias de hoje até a data (negativo = já passou). */
  days: number;
  /** Anos completados na data. */
  years: number;
};
export type Transition = { associateId: string; name: string; age: number; label: string };

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
export function upcomingDates(people: Pick<AssociateProfile, "id" | "name" | "active" | "birth_date" | "promise_date">[], today: string,
  before = DATES_BEFORE_DAYS, after = DATES_AFTER_DAYS): UpcomingDate[] {
  const result: UpcomingDate[] = [];
  for (const person of people) {
    if (!person.active) continue;
    for (const [kind, date] of [["aniversario", person.birth_date], ["promessa", person.promise_date]] as const) {
      if (!date) continue;
      const hit = occurrence(date, today, before, after);
      if (hit) result.push({ associateId: person.id, name: person.name, kind, ...hit, years: Number(hit.on.slice(0, 4)) - Number(date.slice(0, 4)) });
    }
  }
  return result.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "pt-BR"));
}

/** Jovens ativos que já chegaram à idade de transição do próprio ramo (mais velhos primeiro). */
export function transitions(people: Pick<AssociateProfile, "id" | "name" | "active" | "branch" | "birth_date">[], today: string): Transition[] {
  return people.flatMap((person) => {
    const rule = TRANSITIONS.find((t) => t.branch === person.branch);
    const age = ageInYears(person.birth_date, today);
    return person.active && rule && age !== null && age >= rule.fromAge
      ? [{ associateId: person.id, name: person.name, age, label: rule.label }] : [];
  }).sort((a, b) => b.age - a.age || a.name.localeCompare(b.name, "pt-BR"));
}

/** Validades (`valid_until`) entre hoje e `days` dias à frente. */
export function expiringSoon<T extends { valid_until: string | null }>(rows: T[], today: string, days = VALIDITY_WARNING_DAYS): T[] {
  const until = toISO(toTime(today) + days * DAY);
  return rows.filter((row) => row.valid_until !== null && row.valid_until >= today && row.valid_until <= until);
}

/** "hoje", "amanhã", "ontem", "em 3 dias", "há 2 dias". */
export function relativeDay(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  return days > 0 ? `em ${days} dias` : `há ${-days} dias`;
}
