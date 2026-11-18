import type { YouthRow } from "@/lib/activities/model";
import type { Db } from "@/lib/server/db";
import { rowsOf, sb } from "@/lib/server/supabase/db";

/** Lobinhos ativos do grupo. */
export async function list(db: Db, groupId: string): Promise<YouthRow[]> {
  return rowsOf(await sb(db).from("activity_youth")
    .select("id, name, pack, birth_date, guardian, active")
    .eq("group_id", groupId)
    .eq("active", true)
    .order("pack", { ascending: true })
    .order("name", { ascending: true })) as YouthRow[];
}
