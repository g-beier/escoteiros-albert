import { compareCodes, type CategoryKind } from "@/lib/finance/categories";

/**
 * Rascunho da árvore de rubricas editado na tela (Configurações › Rubricas): arrastar, renomear, criar,
 * inativar e excluir mexem só aqui; `draftPayload` vira uma chamada de `save_category_tree` (036).
 * Os códigos são recalculados a cada mudança, como o banco faz ao gravar.
 */

export type SavedCategory = {
  id: string; parent_id: string | null; code: string | null; name: string; kind: CategoryKind | null;
  ledger_code: string | null; active: boolean; usage: number;
  /** Marcada "venda de itens" (019). */
  sells_items?: boolean;
};

export type DraftNode = {
  /** id da rubrica, ou "new:N" para as criadas no rascunho. */
  key: string;
  id: string | null;
  parentKey: string | null;
  name: string;
  ledgerCode: string | null;
  active: boolean;
  /** Marcada "venda de itens" (Lojinha, 019): só receitas; vale também para as de baixo. */
  sellsItems: boolean;
  /** Rateios gravados nela. */
  usage: number;
  /** 1 Receitas e 2 Despesas: fixas. */
  isRoot: boolean;
  /** Tipo e código gravados (raízes guardam o código; antigas sem código ficam fora da árvore). */
  savedKind: CategoryKind | null;
  savedCode: string | null;
};

export type DeletedNode = { key: string; id: string; name: string; savedCode: string | null; usage: number;
  /** Rubricas acima dela quando foi excluída, da mais próxima para a raiz: a primeira que continuar recebe os rateios. */
  ancestors: string[] };

export type Draft = {
  nodes: Record<string, DraftNode>;
  /** Filhas em ordem; TOP = raízes e rubricas antigas sem código. */
  children: Record<string, string[]>;
  deleted: DeletedNode[];
  nextNew: number;
};

export const TOP = "";
/** Códigos vão até 5 níveis (2.1.1.1.1): profundidade 0 a 4. */
export const MAX_DEPTH = 4;

export function createDraft(items: SavedCategory[]): Draft {
  const sorted = [...items].sort((a, b) => compareCodes(a.code, b.code) || a.name.localeCompare(b.name, "pt-BR"));
  const ids = new Set(items.map((item) => item.id));
  const nodes: Record<string, DraftNode> = {};
  const children: Record<string, string[]> = { [TOP]: [] };
  for (const item of sorted) {
    const parentKey = item.parent_id && ids.has(item.parent_id) ? item.parent_id : null;
    nodes[item.id] = {
      key: item.id, id: item.id, parentKey, name: item.name, ledgerCode: item.ledger_code, active: item.active, sellsItems: item.sells_items ?? false, usage: item.usage,
      isRoot: !parentKey && item.code !== null, savedKind: item.kind, savedCode: item.code,
    };
    (children[parentKey ?? TOP] ??= []).push(item.id);
  }
  return { nodes, children, deleted: [], nextNew: 1 };
}

export type DraftRow = {
  node: DraftNode; depth: number; code: string | null; kind: CategoryKind | null;
  /** Níveis abaixo dela (0 = folha). */
  height: number;
  /** Ela e as de baixo. */
  subtree: string[];
  /** Rateios nela e nas de baixo. */
  subtreeUsage: number;
  /** Código mudou em relação ao gravado. */
  moved: boolean;
  /** Vende itens: marcada ou dentro de uma marcada (só receitas). */
  sells: boolean;
};

/** Linhas na ordem da árvore, com códigos recalculados. */
export function draftRows(draft: Draft): DraftRow[] {
  const rows: DraftRow[] = [];
  const visit = (key: string, depth: number, code: string | null, kind: CategoryKind | null, inherited = false): DraftRow => {
    const node = draft.nodes[key];
    const sells = kind === "receita" && (inherited || node.sellsItems);
    const row: DraftRow = { node, depth, code, kind, height: 0, subtree: [key], subtreeUsage: node.usage, moved: node.id !== null && code !== node.savedCode, sells };
    rows.push(row);
    const kids = draft.children[key] ?? [];
    kids.forEach((kid, index) => {
      const child = visit(kid, depth + 1, code ? `${code}.${index + 1}` : null, kind, sells);
      row.height = Math.max(row.height, child.height + 1);
      row.subtree.push(...child.subtree);
      row.subtreeUsage += child.subtreeUsage;
    });
    return row;
  };
  for (const key of draft.children[TOP] ?? []) {
    const node = draft.nodes[key];
    visit(key, 0, node.isRoot ? node.savedCode : null, node.isRoot ? node.savedKind : null);
  }
  return rows;
}

function rowOf(draft: Draft, key: string) {
  return draftRows(draft).find((row) => row.node.key === key);
}

export type DropPlace = "before" | "after" | "inside";

/** Por que não dá para soltar `key` em `target` (ou null se dá). */
export function dropError(draft: Draft, key: string, target: string, place: DropPlace): string | null {
  const rows = draftRows(draft);
  const source = rows.find((row) => row.node.key === key);
  const goal = rows.find((row) => row.node.key === target);
  if (!source || !goal || key === target) return "";
  if (source.node.isRoot) return "As rubricas raiz (1 Receitas, 2 Despesas) não mudam de lugar.";
  if (source.subtree.includes(target)) return "Uma rubrica não pode ficar dentro dela mesma.";
  const parent = place === "inside" ? goal : rows.find((row) => row.node.key === goal.node.parentKey);
  if (!parent || !parent.code) return "Solte dentro de uma rubrica da árvore (abaixo de 1 Receitas ou 2 Despesas).";
  if (parent.depth + 1 + source.height > MAX_DEPTH) return "A árvore de rubricas tem no máximo 5 níveis (ex.: 2.1.1.1.1).";
  if (source.subtreeUsage > 0 && source.kind && parent.kind !== source.kind) {
    return `Com rateios gravados, a rubrica não muda de ${source.kind === "receita" ? "Receitas para Despesas" : "Despesas para Receitas"}.`;
  }
  return null;
}

function detach(draft: Draft, key: string): Record<string, string[]> {
  const parent = draft.nodes[key].parentKey ?? TOP;
  return { ...draft.children, [parent]: (draft.children[parent] ?? []).filter((kid) => kid !== key) };
}

/** Solta `key` antes, depois ou dentro (no fim) de `target`. Chame `dropError` antes. */
export function moveNode(draft: Draft, key: string, target: string, place: DropPlace): Draft {
  if (dropError(draft, key, target, place) !== null) return draft;
  const children = detach(draft, key);
  const parentKey = place === "inside" ? target : draft.nodes[target].parentKey!;
  const list = [...(children[parentKey] ?? [])];
  const index = place === "inside" ? list.length : list.indexOf(target) + (place === "after" ? 1 : 0);
  list.splice(index, 0, key);
  return { ...draft, children: { ...children, [parentKey]: list }, nodes: { ...draft.nodes, [key]: { ...draft.nodes[key], parentKey } } };
}

export function updateNode(draft: Draft, key: string, patch: Partial<Pick<DraftNode, "name" | "ledgerCode" | "active" | "sellsItems">>): Draft {
  return { ...draft, nodes: { ...draft.nodes, [key]: { ...draft.nodes[key], ...patch } } };
}

/** Nova rubrica no fim de `parentKey`; devolve o rascunho e a chave dela. */
export function addNode(draft: Draft, parentKey: string, name = "Nova rubrica"): [Draft, string] {
  const key = `new:${draft.nextNew}`;
  const node: DraftNode = { key, id: null, parentKey, name, ledgerCode: null, active: true, sellsItems: false, usage: 0, isRoot: false, savedKind: null, savedCode: null };
  return [{
    ...draft, nextNew: draft.nextNew + 1, nodes: { ...draft.nodes, [key]: node },
    children: { ...draft.children, [parentKey]: [...(draft.children[parentKey] ?? []), key] },
  }, key];
}

/** Tira a rubrica e as de baixo da árvore; as gravadas entram na lista de exclusões. */
export function removeNode(draft: Draft, key: string): Draft {
  const row = rowOf(draft, key);
  if (!row || row.node.isRoot) return draft;
  const ancestors: string[] = [];
  for (let parent = row.node.parentKey; parent; parent = draft.nodes[parent]?.parentKey ?? null) ancestors.push(parent);
  const nodes = { ...draft.nodes };
  const children = detach(draft, key);
  const deleted = [...draft.deleted];
  for (const sub of row.subtree) {
    const node = nodes[sub];
    // as de baixo também caem na rubrica acima da que foi excluída
    if (node.id) deleted.push({ key: sub, id: node.id, name: node.name, savedCode: node.savedCode, usage: node.usage, ancestors });
    delete nodes[sub];
    delete children[sub];
  }
  return { ...draft, nodes, children, deleted };
}

/** Rubrica que recebe os rateios de uma excluída: a mais próxima acima dela que continua no rascunho. */
export function deletedTarget(draft: Draft, item: DeletedNode): DraftNode | null {
  const key = item.ancestors.find((ancestor) => draft.nodes[ancestor]);
  return key ? draft.nodes[key] : null;
}

export type DraftChanges = { created: number; renamed: number; moved: number; toggled: number; deleted: number; movedSplits: number; total: number };

export function draftChanges(draft: Draft, saved: Draft): DraftChanges {
  const rows = draftRows(draft);
  let created = 0, renamed = 0, moved = 0, toggled = 0;
  for (const row of rows) {
    const before = row.node.id ? saved.nodes[row.node.key] : null;
    if (!before) { created++; continue; }
    if (before.name !== row.node.name || (before.ledgerCode ?? "") !== (row.node.ledgerCode ?? "")) renamed++;
    if (before.active !== row.node.active || before.sellsItems !== row.node.sellsItems) toggled++;
    if (row.moved) moved++;
  }
  const deleted = draft.deleted.length;
  const movedSplits = draft.deleted.reduce((sum, item) => sum + item.usage, 0);
  return { created, renamed, moved, toggled, deleted, movedSplits, total: created + renamed + moved + toggled + deleted };
}

/** Argumentos de `save_category_tree`: todas as rubricas fora das raízes, na ordem final, e as exclusões. */
export function draftPayload(draft: Draft) {
  const nodes = draftRows(draft)
    .filter((row) => !row.node.isRoot && row.node.parentKey)
    .map((row) => ({
      key: row.node.key, id: row.node.id, parent: row.node.parentKey, name: row.node.name.trim(),
      ledgerCode: row.node.ledgerCode || null, active: row.node.active,
      // só receitas vendem: ao mudar de ramo para Despesas, a marca cai
      sellsItems: row.kind === "receita" && row.node.sellsItems,
      position: (draft.children[row.node.parentKey!] ?? []).indexOf(row.node.key),
    }));
  const deleted = draft.deleted.map((item) => ({ id: item.id, target: deletedTarget(draft, item)?.key ?? null }));
  return { nodes, deleted };
}
