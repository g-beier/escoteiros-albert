// Seções na grade de mensalidades: filtro `secao` e rótulos. Ramos e divisão ficam em lib/associates/model.ts.

/** Rótulo de quem não tem seção, na visão por seção e no filtro. */
export const NO_SECTION = "(Sem seção)";
/** Valor do filtro `secao` para quem não tem seção. */
export const NO_SECTION_PARAM = "nenhuma";

type WithSection = { name: string; section: string | null };

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

/** Seções distintas, em ordem alfabética; quem não tem seção fica por último (null). */
export function sectionsOf(associates: WithSection[]): (string | null)[] {
  const named = [...new Set(associates.map((a) => a.section?.trim()).filter((s): s is string => Boolean(s)))].sort(
    byName,
  );
  return associates.some((a) => !a.section?.trim()) ? [...named, null] : named;
}

/** Filtro de várias seções (`secao=A,B,nenhuma`); lista vazia = todas. */
export function matchesSections(associate: WithSection, filters: string[]) {
  return !filters.length || filters.some((filter) => matchesSection(associate, filter));
}

/** Filtro da URL: nome da seção, `nenhuma` (sem seção) ou ausente (todas). */
export function matchesSection(associate: WithSection, filter: string | undefined) {
  if (!filter) return true;
  if (filter === NO_SECTION_PARAM) return !associate.section?.trim();
  return associate.section?.trim() === filter;
}
