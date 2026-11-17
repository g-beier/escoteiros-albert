import type { Option } from "@geas/ui/components/option-controls";

// Divisões em árvore (inventory_location_paths), na ordem escolhida pelo gestor (034).

export type LocationPath = {
  id: string; parent_id: string | null; name: string; path: string; depth: number; active: boolean; ancestors: string[];
  /** Posições do caminho, da raiz até a divisão (ordem escolhida pelo gestor). */
  sort_key: number[];
};

/** Ordem da árvore escolhida pelo gestor: compara as posições do caminho; pai sempre antes dos filhos. */
export function treeOrder(a: Pick<LocationPath, "sort_key" | "path">, b: Pick<LocationPath, "sort_key" | "path">) {
  for (let i = 0; i < Math.min(a.sort_key.length, b.sort_key.length); i++) {
    if (a.sort_key[i] !== b.sort_key[i]) return a.sort_key[i] - b.sort_key[i];
  }
  return a.sort_key.length - b.sort_key.length || a.path.localeCompare(b.path, "pt-BR");
}

/** Divisão raiz (local macro: Diretoria, Alcateia, Cozinha…) de uma divisão. */
export function rootOf(paths: LocationPath[], id: string): LocationPath | undefined {
  const location = paths.find((row) => row.id === id);
  return location && paths.find((row) => row.id === location.ancestors[0]);
}

/** A divisão e todas as que estão dentro dela, na ordem da árvore. */
export function subtree(paths: LocationPath[], id: string): LocationPath[] {
  return paths.filter((row) => row.ancestors.includes(id));
}


/** Opções de divisão para formulários (só ativas; a inativa atual entra se `keep`). */
export function locationOptions(paths: LocationPath[], keep?: string): Option[] {
  return paths.filter((row) => row.active || row.id === keep).map((row) => ({ value: row.id, label: row.path }));
}

// Arrastar divisões (Configurações › Divisões): mesmas regras de inventory_place_location (037).

export type DropPlace = "before" | "after" | "inside";
type TreeItem = { id: string; parentId: string | null; name: string; active: boolean; ancestors: string[]; depth: number };

/** Por que não dá para soltar `id` em `target` ("" = sem mensagem), ou null se dá. */
export function placeError(items: TreeItem[], id: string, target: string, place: DropPlace): string | null {
  const source = items.find((item) => item.id === id);
  const goal = items.find((item) => item.id === target);
  if (!source || !goal || id === target) return "";
  if (goal.ancestors.includes(id)) return "Uma divisão não pode ficar dentro dela mesma.";
  const parentId = place === "inside" ? goal.id : goal.parentId;
  if (parentId === source.parentId) return null;
  const parent = items.find((item) => item.id === parentId);
  if (parent && !parent.active) return "Reative a divisão de destino antes de pôr outra dentro dela.";
  const name = source.name.toLocaleLowerCase("pt-BR");
  if (items.some((item) => item.parentId === parentId && item.id !== id && item.name.toLocaleLowerCase("pt-BR") === name)) {
    return `Já existe a divisão ${source.name} neste nível.`;
  }
  return null;
}

/** A lista (na ordem da árvore) com `id` e as de baixo já no novo lugar: mostra o resultado enquanto grava. */
export function placeLocal<T extends TreeItem>(items: T[], id: string, target: string, place: DropPlace): T[] {
  const goal = items.find((item) => item.id === target);
  if (!goal) return items;
  const parentId = place === "inside" ? goal.id : goal.parentId;
  const children = new Map<string, string[]>();
  for (const item of items) if (item.id !== id) children.set(item.parentId ?? "", [...(children.get(item.parentId ?? "") ?? []), item.id]);
  const list = children.get(parentId ?? "") ?? [];
  list.splice(place === "inside" ? list.length : list.indexOf(target) + (place === "after" ? 1 : 0), 0, id);
  children.set(parentId ?? "", list);
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  const visit = (key: string, parent: T | null) => {
    const item = byId.get(key)!;
    const next = { ...item, parentId: parent?.id ?? null, depth: parent ? parent.depth + 1 : 0, ancestors: [...(parent?.ancestors ?? []), key] };
    result.push(next);
    for (const kid of children.get(key) ?? []) visit(kid, next);
  };
  for (const key of children.get("") ?? []) visit(key, null);
  return result;
}
