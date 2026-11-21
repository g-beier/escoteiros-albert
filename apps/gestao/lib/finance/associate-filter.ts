import { branchLabels, SCOUT_BRANCHES, type ScoutBranch } from "@/lib/associates/model";
import { decodeCategorySelection } from "./categories";

// Filtro de associado das listas de lançamentos, em dois recortes exclusivos:
// - por divisão (`divisao=`): nós Ramo › Seção › Equipe como tokens (`nenhum`, `r:<ramo>`, `s:<seção>`, `e:<equipe>`,
//   `n:<ramo>` = sem seção), na seleção compacta de `encodeCategorySelection` (`-token` exclui o nó e o que está abaixo);
//   o servidor expande para os associados ATIVOS na divisão atual;
// - por nome (`associado=`): IDs de associado (ativos ou não).

/** Nó "(Sem associado)" (rateios sem vínculo; mesmo valor de `NO_ASSOCIATE` em filters.ts). */
const NONE = "nenhum";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DIVISION_TOKEN = new RegExp(`^-?(?:${NONE}|[rn]:(?:${SCOUT_BRANCHES.join("|")})|[se]:${UUID})$`, "i");

/** Token válido de `divisao=` (nó ou exclusão `-nó`). */
export function isDivisionToken(value: string) {
  return DIVISION_TOKEN.test(value);
}

export type AssociateTreeInput = {
  associates: { id: string; name: string; active: boolean; branch: string; section_id: string | null; patrol_id: string | null }[];
  sections: { id: string; branch: string; name: string }[];
  patrols: { id: string; section_id: string; name: string }[];
};

/** Nó da árvore de divisões (sem pessoas). */
export type DivisionNode = { id: string; parent_id: string | null; label: string; depth: number };
export type AssociatePerson = { id: string; name: string; active: boolean };
export type AssociateFilterData = {
  divisions: DivisionNode[];
  /** Todos os associados (ativos e inativos), por nome, para a busca nominal. */
  people: AssociatePerson[];
  /** Nó onde o associado ativo está (ramo dos adultos, seção, equipe ou "Sem seção") → IDs. */
  members: Record<string, string[]>;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true });
const isBranch = (value: string): value is ScoutBranch => (SCOUT_BRANCHES as readonly string[]).includes(value);

/**
 * Dados do filtro: "(Sem associado)", cada ramo (ordem do POR) com suas seções e equipes (por nome) e um nó
 * "Sem seção" (adultos ficam direto no ramo, que não tem seção). Só aparecem nós com algum associado ativo dentro;
 * inativos só pela busca nominal (`people`).
 */
export function buildAssociateFilterData({ associates, sections, patrols }: AssociateTreeInput): AssociateFilterData {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const patrolById = new Map(patrols.map((p) => [p.id, p]));
  const members: Record<string, string[]> = {};
  const add = (node: string, id: string) => (members[node] ??= []).push(id);

  for (const associate of [...associates].sort(byName)) {
    if (!associate.active || !isBranch(associate.branch)) continue;
    const section = associate.section_id ? sectionById.get(associate.section_id) : undefined;
    if (!section || section.branch !== associate.branch) { add(associate.branch === "adulto" ? "r:adulto" : `n:${associate.branch}`, associate.id); continue; }
    const patrol = associate.patrol_id ? patrolById.get(associate.patrol_id) : undefined;
    add(patrol && patrol.section_id === section.id ? `e:${patrol.id}` : `s:${section.id}`, associate.id);
  }

  /** O nó e seus filhos, se houver alguém dentro. */
  const node = (id: string, parent: string | null, label: string, depth: number, children: (depth: number) => DivisionNode[]): DivisionNode[] => {
    const below = children(depth + 1);
    return below.length || members[id]?.length ? [{ id, parent_id: parent, label, depth }, ...below] : [];
  };

  const divisions: DivisionNode[] = [{ id: NONE, parent_id: null, label: "(Sem associado)", depth: 0 }];
  for (const branch of SCOUT_BRANCHES) {
    const root = `r:${branch}`;
    divisions.push(...node(root, null, branch === "adulto" ? "Adultos" : branchLabels[branch], 0, (depth) => [
      ...sections.filter((s) => s.branch === branch).sort(byName).flatMap((section) =>
        node(`s:${section.id}`, root, section.name, depth, (patrolDepth) =>
          patrols.filter((p) => p.section_id === section.id).sort(byName).flatMap((patrol) =>
            node(`e:${patrol.id}`, `s:${section.id}`, patrol.name, patrolDepth, () => [])))),
      ...(branch === "adulto" ? [] : node(`n:${branch}`, root, "Sem seção", depth, () => [])),
    ]));
  }

  const people = [...associates].sort(byName).map(({ id, name, active }) => ({ id, name, active }));
  return { divisions, people, members };
}

/** Associados ativos marcados pelos tokens de `divisao` (nós expandidos, exclusões aplicadas) e se "(Sem associado)" entrou. */
export function expandDivisionTokens(tokens: string[], data: Pick<AssociateFilterData, "divisions" | "members">) {
  const selected = decodeCategorySelection(tokens, data.divisions);
  const associateIds = [...new Set(selected.flatMap((id) => data.members[id] ?? []))];
  return { associateIds, withoutAssociate: selected.includes(NONE) };
}
