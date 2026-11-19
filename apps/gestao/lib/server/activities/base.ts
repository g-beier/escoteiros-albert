import type { BaseRow } from "@/lib/activities/model";
import type { Db } from "@/lib/server/db";
import { rowsOf, sb } from "@/lib/server/supabase/db";

/** Itens da base de jogos/atividades (ativos). */
export async function list(db: Db, groupId: string): Promise<BaseRow[]> {
  return rowsOf(await sb(db).from("activity_base")
    .select("id, name, description, duration_minutes, category, active")
    .eq("group_id", groupId)
    .eq("active", true)
    .order("name", { ascending: true })) as BaseRow[];
}
