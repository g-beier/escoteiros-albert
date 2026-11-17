import type { DropPlace } from "@/lib/inventory/locations";
import { treeOrder, type LocationPath } from "@/lib/inventory/locations";
import type { LocationItem } from "@/lib/inventory/model";
import { DataError, type Db } from "@/lib/server/db";
import { rowsOf, rpc, sb, unwrap } from "@/lib/server/supabase/db";

// Divisões do inventário (inventory_locations, caminhos em inventory_location_paths), na ordem do gestor.

/** Divisões com o caminho completo ("Cozinha › Estante de canecas › 2º nível"), na ordem da árvore. */
export async function listPaths(db: Db, groupId: string): Promise<LocationPath[]> {
  const rows = rowsOf(await sb(db).from("inventory_location_paths").select("id, parent_id, name, path, depth, active, ancestors, sort_key").eq("group_id", groupId));
  return (rows as LocationPath[]).sort(treeOrder);
}

/** Configurações › Divisões: árvore com descrição e quanto material há em cada divisão (e com as de baixo). */
export async function listForSettings(db: Db, groupId: string): Promise<LocationItem[]> {
  const [paths, details, lots, units] = await Promise.all([
    listPaths(db, groupId),
    sb(db).from("inventory_locations").select("id, description").eq("group_id", groupId).then(rowsOf),
    sb(db).from("inventory_lots").select("location_id").eq("group_id", groupId).gt("quantity", 0).then(rowsOf),
    sb(db).from("inventory_units").select("location_id").eq("group_id", groupId).is("written_off_at", null).then(rowsOf),
  ]);
  const descriptions = new Map(details.map((d) => [d.id, d.description]));
  const own = new Map<string, number>();
  for (const item of [...lots, ...units]) own.set(item.location_id, (own.get(item.location_id) ?? 0) + 1);
  const total = new Map<string, number>();
  for (const row of paths) {
    const count = own.get(row.id) ?? 0;
    for (const ancestor of row.ancestors) total.set(ancestor, (total.get(ancestor) ?? 0) + count);
  }
  return paths.map((row) => ({
    id: row.id, parentId: row.parent_id, name: row.name, description: descriptions.get(row.id) ?? null, path: row.path,
    depth: row.depth, ancestors: row.ancestors, active: row.active, own: own.get(row.id) ?? 0, total: total.get(row.id) ?? 0,
  }));
}

export type LocationInput = { id: string | null; parentId: string | null; name: string; description: string | null };

/** Cria (sem `id`) ou edita uma divisão. */
export async function save(db: Db, groupId: string, input: LocationInput): Promise<void> {
  await rpc(db, "inventory_save_location", {
    p_group_id: groupId, p_id: input.id, p_parent_id: input.parentId, p_name: input.name, p_description: input.description, p_active: true,
  });
}

/** Inativa ou reativa, mantendo nome, descrição e lugar na árvore; devolve o nome. */
export async function setActive(db: Db, groupId: string, id: string, active: boolean): Promise<string> {
  const location = unwrap(await sb(db).from("inventory_locations").select("parent_id, name, description").eq("id", id).eq("group_id", groupId).maybeSingle());
  if (!location) throw new DataError("Divisão não encontrada.");
  await rpc(db, "inventory_save_location", {
    p_group_id: groupId, p_id: id, p_parent_id: location.parent_id, p_name: location.name, p_description: location.description, p_active: active,
  });
  return location.name;
}

/** Solta a divisão antes, depois ou dentro (no fim) de outra. */
export async function place(db: Db, id: string, target: string, where: DropPlace): Promise<void> {
  await rpc(db, "inventory_place_location", { p_id: id, p_target: target, p_place: where });
}
