import type { Db } from "@/lib/server/db";
import { rowsOf, untyped } from "@/lib/server/supabase/db";

// O Financeiro só lê os associados: o cadastro é do módulo Associados (lib/server/associates/).

/** Associados para os seletores (Devedores): nome, seção e se está ativo. */
export async function listForPicker(db: Db, groupId: string) {
  return rowsOf(await untyped(db).from("associate_rows").select("id, name, section, active").eq("group_id", groupId).order("name").limit(5000)) as
    { id: string; name: string; section: string | null; active: boolean }[];
}
