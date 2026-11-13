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
/** Filtro de várias seções (`secao=A,B,nenhuma`); lista vazia = todas. */
export function matchesSections(associate: WithSection, filters: string[]) {
  return !filters.length || filters.some((filter) => matchesSection(associate, filter));
}

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

/** Ramos com seções (Alcateia, Tropa, Clã…). Adulto é só o ramo, sem seção. */
export const SECTION_BRANCHES: readonly ScoutBranch[] = ["lobinho", "escoteiro", "senior", "pioneiro"];
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
 * Só ativas, mais a seção e a equipe atuais (mesmo inativas ou fora das regras de hoje).
 */
export function placementOptions(sections: SectionItem[], patrols: PatrolItem[], current?: Partial<Placement>): PlacementOption[] {
  const options: PlacementOption[] = [];
  for (const branch of SCOUT_BRANCHES) {
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
