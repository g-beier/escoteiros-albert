export type CategoryKind = "receita" | "despesa";
export type CategoryItem = { id: string; name: string; active: boolean; code: string | null; kind: CategoryKind | null; parent_id: string | null };

/** Ordem natural de códigos: 2.2.9 antes de 2.2.10; rubricas sem código por último. */
export function compareCodes(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function sortCategories<T extends Pick<CategoryItem, "code" | "name">>(items: T[]) {
  return [...items].sort((a, b) => compareCodes(a.code, b.code) || a.name.localeCompare(b.name, "pt-BR"));
}

export function depthOf(code: string | null) {
  return code ? code.split(".").length - 1 : 0;
}

/** "2.5.2 Pastelada › Ingredientes": código e caminho sem a raiz (Receitas/Despesas). */
export function categoryLabel(item: CategoryItem, byId: Map<string, CategoryItem>) {
  const path: string[] = [];
  let current: CategoryItem | undefined = item;
  while (current) {
    path.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  const visible = item.code && path.length > 1 ? path.slice(1) : path;
  return [item.code, visible.join(" › ")].filter(Boolean).join(" ");
}

/** IDs de todas as rubricas abaixo de cada rubrica. */
export function descendantsMap(items: Pick<CategoryItem, "id" | "parent_id">[]) {
  const children = new Map<string, string[]>();
  for (const item of items) if (item.parent_id) children.set(item.parent_id, [...(children.get(item.parent_id) ?? []), item.id]);
  const result: Record<string, string[]> = {};
  const collect = (id: string): string[] => (children.get(id) ?? []).flatMap((child) => [child, ...collect(child)]);
  for (const item of items) result[item.id] = collect(item.id);
  return result;
}

type TreeItem = Pick<CategoryItem, "id" | "parent_id">;

/**
 * Seleção de rubricas compacta para a URL: `id` marca a rubrica e tudo abaixo dela; `-id` desmarca a rubrica e
 * tudo abaixo dela. Vale o item mais próximo: o estado de uma rubrica é o do seu token, ou do ancestral mais
 * próximo que tem token (sem nenhum, fica desmarcada). Assim "2. Despesas" inteira vira um só ID.
 */
export function encodeCategorySelection(selected: Iterable<string>, items: TreeItem[]): string[] {
  const chosen = new Set(selected);
  const children = childrenMap(items);
  const ids = new Set(items.map((item) => item.id));
  const tokens: string[] = [];
  const walk = (id: string, inherited: boolean) => {
    const state = chosen.has(id);
    if (state !== inherited) tokens.push(state ? id : `-${id}`);
    for (const child of children.get(id) ?? []) walk(child, state);
  };
  for (const item of items) if (!item.parent_id || !ids.has(item.parent_id)) walk(item.id, false);
  return tokens;
}

/** Inverso de `encodeCategorySelection`: IDs marcados. Tokens de rubricas desconhecidas são ignorados. */
export function decodeCategorySelection(tokens: string[], items: TreeItem[]): string[] {
  const marks = new Map<string, boolean>();
  for (const token of tokens) marks.set(token.replace(/^-/, ""), !token.startsWith("-"));
  const byId = new Map(items.map((item) => [item.id, item]));
  const stateOf = (id: string): boolean => {
    const seen = new Set<string>();
    for (let current = byId.get(id); current && !seen.has(current.id); current = current.parent_id ? byId.get(current.parent_id) : undefined) {
      seen.add(current.id);
      const mark = marks.get(current.id);
      if (mark !== undefined) return mark;
    }
    return false;
  };
  return items.filter((item) => stateOf(item.id)).map((item) => item.id);
}

function childrenMap(items: TreeItem[]) {
  const children = new Map<string, string[]>();
  for (const item of items) if (item.parent_id) children.set(item.parent_id, [...(children.get(item.parent_id) ?? []), item.id]);
  return children;
}
