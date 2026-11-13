import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Divisões com o caminho completo ("Cozinha e despensa › Estante de canecas › 2º nível"), na ordem da árvore. */
export async function fetchLocationPaths(supabase: SupabaseClient, groupId: string): Promise<LocationPath[]> {
  const { data } = await supabase.from("inventory_location_paths").select("id, parent_id, name, path, depth, active, ancestors, sort_key").eq("group_id", groupId);
  return ((data ?? []) as LocationPath[]).sort(treeOrder);
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
