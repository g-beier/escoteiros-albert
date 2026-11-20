import type { Db } from "@/lib/server/db";
import { rowsOf, sb, untyped } from "@/lib/server/supabase/db";
import { buildAssociateFilterData, type AssociateFilterData } from "@/lib/finance/associate-filter";

// O Financeiro só lê os associados: o cadastro é do módulo Associados (lib/server/associates/).

/** Associados para os seletores (Devedores): nome, seção e se está ativo. */
export async function listForPicker(db: Db, groupId: string) {
  return rowsOf(await untyped(db).from("associate_rows").select("id, name, section, active").eq("group_id", groupId).order("name").limit(5000)) as
    { id: string; name: string; section: string | null; active: boolean }[];
}

/** Dados do filtro de associado das listas de lançamentos (divisões Ramo › Seção › Equipe e pessoas, `buildAssociateFilterData`). */
export async function associateFilterData(db: Db, groupId: string): Promise<AssociateFilterData> {
  const [associates, sections, patrols] = await Promise.all([
    sb(db).from("associates").select("id, name, active, branch, section_id, patrol_id").eq("group_id", groupId).limit(10000).then(rowsOf),
    sb(db).from("sections").select("id, branch, name").eq("group_id", groupId).then(rowsOf),
    sb(db).from("patrols").select("id, section_id, name").eq("group_id", groupId).then(rowsOf),
  ]);
  return buildAssociateFilterData({ associates, sections, patrols });
}
