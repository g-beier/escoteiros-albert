export const SCOUT_BRANCHES = ["lobinho", "escoteiro", "senior", "pioneiro", "adulto"] as const;
export type ScoutBranch = (typeof SCOUT_BRANCHES)[number];

export const branchLabels: Record<ScoutBranch, string> = {
  lobinho: "Lobinho",
  escoteiro: "Escoteiro",
  senior: "Sênior",
  pioneiro: "Pioneiro",
  adulto: "Adulto",
};

export function isScoutBranch(value: string): value is ScoutBranch {
  return (SCOUT_BRANCHES as readonly string[]).includes(value);
}

/** Rótulo de quem não tem seção, na visão por seção e no filtro. */
export const NO_SECTION = "(Sem seção)";
/** Valor do filtro `secao` para quem não tem seção. */
export const NO_SECTION_PARAM = "nenhuma";

type WithSection = { name: string; section: string | null };

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

/** Seções distintas, em ordem alfabética; quem não tem seção fica por último (null). */
export function sectionsOf(associates: WithSection[]): (string | null)[] {
  const named = [...new Set(associates.map((a) => a.section?.trim()).filter((s): s is string => Boolean(s)))].sort(byName);
  return associates.some((a) => !a.section?.trim()) ? [...named, null] : named;
}

/** Associados agrupados por seção (ordem de `sectionsOf`), cada grupo ordenado por nome. */
export function groupBySection<T extends WithSection>(associates: T[]): { section: string | null; members: T[] }[] {
  return sectionsOf(associates).map((section) => ({
    section,
    members: associates.filter((a) => (a.section?.trim() || null) === section).sort((a, b) => byName(a.name, b.name)),
  }));
}

/** Filtro da URL: nome da seção, `nenhuma` (sem seção) ou ausente (todas). */
export function matchesSection(associate: WithSection, filter: string | undefined) {
  if (!filter) return true;
  if (filter === NO_SECTION_PARAM) return !associate.section?.trim();
  return associate.section?.trim() === filter;
}

// Seções e patrulhas cadastradas (028_sections.sql): Ramo › Seção › Patrulha ------------------

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

/** Seção sugerida ao escolher o ramo: a única seção ativa do ramo, se houver só uma. */
export function defaultSectionFor(sections: SectionItem[], branch: string): string {
  const choices = sectionChoices(sections, branch);
  return choices.length === 1 ? choices[0].id : "";
}
