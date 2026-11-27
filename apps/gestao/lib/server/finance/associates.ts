import type { Db } from "@/lib/server/db";
import { rows, run } from "@/lib/server/pg/db";
import { buildAssociateFilterData, type AssociateFilterData } from "@/lib/finance/associate-filter";

// O Financeiro só lê os associados: o cadastro é do módulo Associados (lib/server/associates/).

/** Associados para os seletores (Devedores): nome, seção e se está ativo. */
export async function listForPicker(db: Db, groupId: string) {
  return rows<{ id: string; name: string; section: string | null; active: boolean }>(
    db,
    (sql) => sql`
    select id, name, section, active from public.associate_rows where group_id = ${groupId} order by name limit 5000`,
  );
}

/** Dados do filtro de associado das listas de lançamentos (divisões Ramo › Seção › Equipe e pessoas, `buildAssociateFilterData`). */
export async function associateFilterData(db: Db, groupId: string): Promise<AssociateFilterData> {
  return run(db, async (sql) => {
    const [associates, sections, patrols] = await Promise.all([
      sql`select id, name, active, branch, section_id, patrol_id from public.associates where group_id = ${groupId} limit 10000`,
      sql`select id, branch, name from public.sections where group_id = ${groupId}`,
      sql`select id, section_id, name from public.patrols where group_id = ${groupId}`,
    ]);
    return buildAssociateFilterData({
      associates: [...associates],
      sections: [...sections],
      patrols: [...patrols],
    } as Parameters<typeof buildAssociateFilterData>[0]);
  });
}
