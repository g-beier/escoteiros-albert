import type { DropPlace } from "@/lib/inventory/locations";
import { treeOrder, type LocationPath } from "@/lib/inventory/locations";
import type { LocationItem } from "@/lib/inventory/model";
import { DataError, type Db } from "@/lib/server/db";
import { one, rows, rpc, run } from "@/lib/server/pg/db";

// Divisões do inventário (inventory_locations, caminhos em inventory_location_paths), na ordem do gestor.

/** Divisões com o caminho completo ("Cozinha › Estante de canecas › 2º nível"), na ordem da árvore. */
export async function listPaths(db: Db, groupId: string): Promise<LocationPath[]> {
  const list = await rows<LocationPath>(db, (sql) => sql`
    select id, parent_id, name, path, depth, active, ancestors, sort_key from public.inventory_location_paths where group_id = ${groupId}`);
  return list.sort(treeOrder);
}

/** Configurações › Divisões: árvore com descrição e quanto material há em cada divisão (e com as de baixo). */
export async function listForSettings(db: Db, groupId: string): Promise<LocationItem[]> {
  const [paths, { details, lots, units }] = await Promise.all([
    listPaths(db, groupId),
    run(db, async (sql) => {
      const [details, lots, units] = await Promise.all([
        sql`select id, description from public.inventory_locations where group_id = ${groupId}`,
        sql`select location_id from public.inventory_lots where group_id = ${groupId} and quantity > 0`,
        sql`select location_id from public.inventory_units where group_id = ${groupId} and written_off_at is null`,
      ]);
      return {
        details: [...details] as unknown as { id: string; description: string | null }[],
        lots: [...lots] as unknown as { location_id: string }[],
        units: [...units] as unknown as { location_id: string }[],
      };
    }),
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
  const location = await one<{ parent_id: string | null; name: string; description: string | null }>(db, (sql) => sql`
    select parent_id, name, description from public.inventory_locations where id = ${id} and group_id = ${groupId}`);
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
