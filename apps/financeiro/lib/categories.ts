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
