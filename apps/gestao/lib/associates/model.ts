// Associados: ramos, seções e equipes (028–030) e a divisão Ramo › Seção › Equipe. Puro, usado pelo Associados e pelo Financeiro.

import { FILHOTES_ENABLED } from "@/lib/features";

/** Todos os ramos do banco, em ordem de idade (051: Filhote antes do Lobinho). */
export const ALL_SCOUT_BRANCHES = ["filhote", "lobinho", "escoteiro", "senior", "pioneiro", "adulto"] as const;
export type ScoutBranch = (typeof ALL_SCOUT_BRANCHES)[number];
/** Ramos em uso: o Filhote só com o interruptor ligado (lib/features.ts). Desligado, não aparece nem é aceito. */
export const SCOUT_BRANCHES = (FILHOTES_ENABLED ? ALL_SCOUT_BRANCHES : ALL_SCOUT_BRANCHES.filter((b) => b !== "filhote")) as [ScoutBranch, ...ScoutBranch[]];

export const branchLabels: Record<ScoutBranch, string> = {
  filhote: "Filhote",
  lobinho: "Lobinho",
  escoteiro: "Escoteiro",
  senior: "Sênior",
  pioneiro: "Pioneiro",
  adulto: "Adulto",
};

export function isScoutBranch(value: string): value is ScoutBranch {
  return (SCOUT_BRANCHES as readonly string[]).includes(value);
}

/** Ramo da passagem: o seguinte na ordem (Pioneiro → Adulto); `null` para o Adulto. Mesma regra de `associates_move` (055). */
export function nextBranch(branch: ScoutBranch): ScoutBranch | null {
  return ALL_SCOUT_BRANCHES[ALL_SCOUT_BRANCHES.indexOf(branch) + 1] ?? null;
}

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

// Seções e patrulhas cadastradas (db/migrations/001_schema.sql): Ramo › Seção › Patrulha ------------------

export type SectionItem = { id: string; branch: ScoutBranch; name: string; active: boolean };
export type PatrolItem = { id: string; sectionId: string; name: string; active: boolean };

/** Seções que podem ser escolhidas para o ramo: as ativas, mais a atual (mesmo inativa). */
export function sectionChoices(sections: SectionItem[], branch: string, currentId?: string | null): SectionItem[] {
  return sections.filter((s) => s.branch === branch && (s.active || s.id === currentId)).sort((a, b) => byName(a.name, b.name));
}

/** Patrulhas que podem ser escolhidas na seção: as ativas, mais a atual (mesmo inativa). */
export function patrolChoices(patrols: PatrolItem[], sectionId: string, currentId?: string | null): PatrolItem[] {
  if (!sectionId) return [];
  return patrols.filter((p) => p.sectionId === sectionId && (p.active || p.id === currentId)).sort((a, b) => byName(a.name, b.name));
}

/** Ramos com seções (Alcateia, Tropa, Clã…). Adulto é só o ramo, sem seção. */
export const SECTION_BRANCHES: readonly ScoutBranch[] = SCOUT_BRANCHES.filter((b) => b !== "adulto");
/** Ramos cujas seções se dividem em equipes (matilhas, patrulhas). O Clã Pioneiro não se divide. */
export const PATROL_BRANCHES: readonly ScoutBranch[] = ["lobinho", "escoteiro", "senior"];
export const hasSections = (branch: string) => SECTION_BRANCHES.includes(branch as ScoutBranch);
export const hasPatrols = (branch: string) => PATROL_BRANCHES.includes(branch as ScoutBranch);

/** Divisão do associado: ramo, seção do ramo e equipe da seção (vazios = sem). */
export type Placement = { branch: string; sectionId: string; patrolId: string };
/** Opção da seleção única de divisão: `b:<ramo>`, `s:<seção>` ou `p:<equipe>`; `label` é o caminho mostrado quando escolhida. */
export type PlacementOption = { value: string; name: string; label: string; depth: 0 | 1 | 2 };

export function placementValue({ branch, sectionId, patrolId }: Placement): string {
  return patrolId ? `p:${patrolId}` : sectionId ? `s:${sectionId}` : branch ? `b:${branch}` : "";
}

/**
 * Hierarquia para a seleção única: cada ramo, suas seções e as equipes de cada seção.
 * Só ativas, mais a seção e a equipe atuais (mesmo inativas ou fora das regras de hoje). `only`: um ramo só (passagem).
 */
export function placementOptions(sections: SectionItem[], patrols: PatrolItem[], current?: Partial<Placement>, only?: ScoutBranch): PlacementOption[] {
  const options: PlacementOption[] = [];
  for (const branch of only ? [only] : SCOUT_BRANCHES) {
    options.push({ value: `b:${branch}`, name: branchLabels[branch], label: branchLabels[branch], depth: 0 });
    const branchSections = sectionChoices(sections, branch, current?.sectionId).filter((s) => hasSections(branch) || s.id === current?.sectionId);
    for (const section of branchSections) {
      options.push({ value: `s:${section.id}`, name: section.active ? section.name : `${section.name} (inativa)`, label: section.name, depth: 1 });
      for (const patrol of patrolChoices(patrols, section.id, current?.patrolId).filter((p) => hasPatrols(branch) || p.id === current?.patrolId)) {
        options.push({ value: `p:${patrol.id}`, name: patrol.active ? patrol.name : `${patrol.name} (inativa)`, label: `${section.name} › ${patrol.name}`, depth: 2 });
      }
    }
  }
  return options;
}

/** Divisão em texto: "Escoteiro › Tropa Tupã › Patrulha Lobo" (só o que houver). */
export function placementLabel(associate: { branch: string; section: string | null; patrol: string | null }) {
  const branch = isScoutBranch(associate.branch) ? branchLabels[associate.branch] : associate.branch;
  return [branch, associate.section, associate.patrol].filter(Boolean).join(" › ");
}

/** Ramo, seção e equipe de uma opção: a equipe leva à sua seção, e a seção, ao seu ramo. */
export function resolvePlacement(value: string, sections: SectionItem[], patrols: PatrolItem[]): Placement {
  const [kind, id] = [value.slice(0, 2), value.slice(2)];
  if (kind === "b:") return { branch: id, sectionId: "", patrolId: "" };
  const patrol = kind === "p:" ? patrols.find((p) => p.id === id) : undefined;
  const sectionId = patrol?.sectionId ?? (kind === "s:" ? id : "");
  const section = sections.find((s) => s.id === sectionId);
  return section ? { branch: section.branch, sectionId: section.id, patrolId: patrol?.id ?? "" } : { branch: "", sectionId: "", patrolId: "" };
}

// Cadastro do módulo Associados (040) ----------------------------------------------------------

/** Linha de `associate_profile_rows`: o associado com seção, equipe, datas e o último desligamento (se inativo). */
export type AssociateProfile = {
  id: string; name: string; branch: ScoutBranch; active: boolean;
  section_id: string | null; section: string | null; patrol_id: string | null; patrol: string | null;
  birth_date: string | null; promise_date: string | null; joined_on: string | null; notes: string | null; left_on: string | null;
  /** `para_revisar`: cadastrado pelo registro rápido e ainda não conferido pela Diretoria (049). */
  review_status?: string;
  /** Transição de ramo iniciada (ou partida programada) neste ramo, em `AAAA-MM-DD` (050). */
  transition_started_on?: string | null;
  /** Registro na UEB (054): novos cadastros começam provisórios. */
  registration?: Registration;
  /** Apelido curto (até 8 caracteres), para referências como "Ver Manu" nos relatórios (054). */
  nickname?: string | null;
};

export const REGISTRATIONS = ["provisorio", "definitivo"] as const;
export type Registration = (typeof REGISTRATIONS)[number];
export const registrationLabels: Record<Registration, string> = { provisorio: "Provisório", definitivo: "Definitivo" };
export const isRegistration = (value: string): value is Registration => (REGISTRATIONS as readonly string[]).includes(value);
export const NICKNAME_MAX = 8;

/** Passagem (`associate_moves`): de onde para onde, com data. A equipe de origem não é guardada. */
export type AssociateMove = {
  id: string; move_date: string; from_branch: ScoutBranch; to_branch: ScoutBranch;
  from_section_id: string | null; to_section_id: string | null; to_patrol_id: string | null; created_at: string;
};

/** Entrada ou saída (`associate_movements`, 022). */
export type AssociateMovement = { id: string; kind: "entrada" | "saida"; movement_date: string; reason: string | null; created_at: string };

/** Período de atividade: uma entrada e, se houve, a saída seguinte. */
export type ActivityPeriod = { start: AssociateMovement | null; end: AssociateMovement | null };

/** Ramos de jovens (com seção), na ordem das abas; adulto vem à parte. */
export const YOUTH_BRANCHES = SECTION_BRANCHES;

/** Abas da lista: Todos, um por ramo de jovens e Adultos (`ramo` na URL). */
export const BRANCH_TABS: { value: ScoutBranch | ""; label: string }[] = [
  { value: "", label: "Todos" },
  ...SECTION_BRANCHES.map((value) => ({ value, label: branchLabels[value] })),
  { value: "adulto", label: "Adultos" },
];

/** Situação na lista (`situacao` na URL): ativos (padrão), desligados ou todos. */
export const STATUS_FILTERS = ["ativos", "desligados", "todos"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const STATUS_LABELS: Record<StatusFilter, string> = { ativos: "Ativos", desligados: "Desligados", todos: "Todos" };
export const statusFilter = (value: string | undefined): StatusFilter => (STATUS_FILTERS as readonly string[]).includes(value ?? "") ? value as StatusFilter : "ativos";

/** Dias de quarentena entre o pedido de exclusão e a exclusão definitiva (018, `associates_deletion_days`). */
export const DELETION_DAYS = 60;

/** Associado em quarentena (Configurações › Excluídos). */
export type QuarantinedAssociate = {
  id: string; name: string; branch: ScoutBranch; active: boolean; deletion_due_on: string; deletion_requested_at: string;
  requested_by: string | null; deletion_reason: string | null;
};

/** Hoje em São Paulo, `AAAA-MM-DD`. */
export function todayISO(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Idade em anos completos na data `on` (`AAAA-MM-DD`); nulo sem nascimento ou com nascimento depois de `on`. */
export function ageInYears(birthDate: string | null | undefined, on: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  return age < 0 ? null : age;
}

export const ageLabel = (age: number | null) => (age === null ? "—" : `${age} ${age === 1 ? "ano" : "anos"}`);

/** Idade em anos e meses completos na data `on`; nula como `ageInYears`. */
export function ageInYearsMonths(birthDate: string | null | undefined, on: string): { years: number; months: number } | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  const total = (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0);
  return total < 0 ? null : { years: Math.floor(total / 12), months: total % 12 };
}

/** "10 anos e 4 meses", "1 ano e 1 mês", "10 anos" (sem meses). */
export function ageYearsMonthsLabel(age: { years: number; months: number } | null): string {
  if (!age) return "—";
  const years = ageLabel(age.years);
  return age.months ? `${years} e ${age.months} ${age.months === 1 ? "mês" : "meses"}` : years;
}

/**
 * Períodos de atividade a partir das entradas e saídas (em ordem de data): cada entrada abre um período e a saída
 * seguinte o fecha. Uma saída sem entrada antes vira um período sem início (cadastros antigos, sem a entrada).
 */
export function activityPeriods(movements: AssociateMovement[]): ActivityPeriod[] {
  const sorted = [...movements].sort((a, b) => a.movement_date.localeCompare(b.movement_date) || a.created_at.localeCompare(b.created_at));
  const periods: ActivityPeriod[] = [];
  for (const movement of sorted) {
    const open = periods.at(-1);
    if (movement.kind === "entrada") {
      if (open && !open.end) continue; // entrada repetida dentro do mesmo período
      periods.push({ start: movement, end: null });
    } else if (open && !open.end) open.end = movement;
    else periods.push({ start: null, end: movement });
  }
  return periods;
}
