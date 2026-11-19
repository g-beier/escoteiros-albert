import type { FunctionKind } from "./controls";
import { branchLabels, SCOUT_BRANCHES, type AssociateProfile, type ScoutBranch } from "./model";

// Grupos da lista de associados: só por ramo (sem seção nem equipe). Adultos se dividem em Escotistas, Dirigentes
// (um adulto com as duas funções aparece nos dois) e Sem função. Na aba Todos, um subtítulo por ramo; na aba de um
// ramo de jovens, um só grupo; na aba Adultos, só os subgrupos.

export type ListGroup = { key: string; level: "root" | "sub"; label: string; count: number; rows: AssociateProfile[] };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true });
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

/** Busca por nome, sem diferenciar acentos e maiúsculas. */
export function matchesQuery(name: string, query: string | undefined) {
  const term = fold(query?.trim() ?? "");
  return !term || fold(name).includes(term);
}

/** Subgrupos dos adultos pela função ativa (id → tipos ativos); vazios não aparecem. */
export function adultGroups(adults: AssociateProfile[], kinds: Map<string, Set<FunctionKind>>): ListGroup[] {
  const sorted = [...adults].sort(byName);
  const groups: ListGroup[] = [
    { key: "adulto-escotista", level: "sub", label: "Escotistas", count: 0, rows: sorted.filter((a) => kinds.get(a.id)?.has("escotista")) },
    { key: "adulto-dirigente", level: "sub", label: "Dirigentes", count: 0, rows: sorted.filter((a) => kinds.get(a.id)?.has("dirigente")) },
    { key: "adulto-sem-funcao", level: "sub", label: "Sem função", count: 0, rows: sorted.filter((a) => !kinds.get(a.id)?.size) },
  ];
  return groups.filter((g) => g.rows.length).map((g) => ({ ...g, count: g.rows.length }));
}

/** Subtítulos e linhas na ordem da tabela (os rótulos de grupo só aparecem quando há linhas). */
export function listGroups(rows: AssociateProfile[], branch: ScoutBranch | "", kinds: Map<string, Set<FunctionKind>> = new Map()): ListGroup[] {
  const groups: ListGroup[] = [];
  for (const current of branch ? [branch] : SCOUT_BRANCHES) {
    const inBranch = rows.filter((row) => row.branch === current).sort(byName);
    if (!inBranch.length) continue;
    if (current === "adulto") {
      if (!branch) groups.push({ key: current, level: "root", label: "Adultos", count: inBranch.length, rows: [] });
      groups.push(...adultGroups(inBranch, kinds));
    } else groups.push({ key: current, level: "root", label: branchLabels[current], count: inBranch.length, rows: inBranch });
  }
  return groups;
}
