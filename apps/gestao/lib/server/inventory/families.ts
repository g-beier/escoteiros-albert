import type { Option } from "@geas/ui/components/option-controls";
import type { FamilyItem } from "@/lib/inventory/model";
import { DataError, type Db } from "@/lib/server/db";
import { one, rows, rpc, run } from "@/lib/server/pg/db";

// Famílias de material (inventory_families): código de 3 dígitos usado nas etiquetas GEAS-000-0000.

/** Opções para o formulário de material: só ativas (a inativa atual entra se `keep`). */
export async function listOptions(db: Db, groupId: string, keep?: string | null): Promise<Option[]> {
  const list = await rows<{ id: string; name: string; code: string | null; active: boolean }>(db, (sql) => sql`
    select id, name, code, active from public.inventory_families where group_id = ${groupId} order by name`);
  return list
    .filter((row) => row.active || row.id === keep)
    .map((row) => ({ value: row.id, label: row.name, detail: row.code ?? undefined }));
}

/** Configurações › Famílias: com quantos materiais e peças etiquetadas. */
export async function listForSettings(db: Db, groupId: string): Promise<FamilyItem[]> {
  const { families, materials, units } = await run(db, async (sql) => {
    const [families, materials, units] = await Promise.all([
      sql`select id, name, code, active from public.inventory_families where group_id = ${groupId} order by name`,
      sql`select id, family_id from public.inventory_materials where group_id = ${groupId} and family_id is not null`,
      sql`select material_id from public.inventory_units where group_id = ${groupId} and tag is not null and written_off_at is null`,
    ]);
    return {
      families: [...families] as unknown as { id: string; name: string; code: string | null; active: boolean }[],
      materials: [...materials] as unknown as { id: string; family_id: string }[],
      units: [...units] as unknown as { material_id: string }[],
    };
  });
  const familyOf = new Map(materials.map((m) => [m.id, m.family_id]));
  const count = (ids: (string | null | undefined)[]) => ids.reduce((map, id) => (id ? map.set(id, (map.get(id) ?? 0) + 1) : map), new Map<string, number>());
  const materialCount = count(materials.map((m) => m.family_id));
  const taggedCount = count(units.map((u) => familyOf.get(u.material_id)));
  return families.map((f) => ({ id: f.id, name: f.name, code: f.code, active: f.active, materials: materialCount.get(f.id) ?? 0, tagged: taggedCount.get(f.id) ?? 0 }));
}

/** Cria (sem `id`) ou edita uma família. */
export async function save(db: Db, groupId: string, input: { id: string | null; name: string; code: string | null }): Promise<void> {
  await rpc(db, "inventory_save_family", { p_group_id: groupId, p_id: input.id, p_name: input.name, p_code: input.code, p_active: true });
}

/** Inativa ou reativa, mantendo nome e código; devolve o nome. */
export async function setActive(db: Db, groupId: string, id: string, active: boolean): Promise<string> {
  const family = await one<{ name: string; code: string | null }>(db, (sql) => sql`
    select name, code from public.inventory_families where id = ${id} and group_id = ${groupId}`);
  if (!family) throw new DataError("Família não encontrada.");
  await rpc(db, "inventory_save_family", { p_group_id: groupId, p_id: id, p_name: family.name, p_code: family.code, p_active: active });
  return family.name;
}
