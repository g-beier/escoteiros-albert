import type { VenueRow } from "@/lib/activities/model";
import type { Db } from "@/lib/server/db";
import { rowsOf, sb } from "@/lib/server/supabase/db";

/** Locais ativos do grupo (autorização / segurança). */
export async function list(db: Db, groupId: string): Promise<VenueRow[]> {
  return rowsOf(await sb(db).from("activity_venues")
    .select("id, name, owner_name, phone, address, active")
    .eq("group_id", groupId)
    .eq("active", true)
    .order("name", { ascending: true })) as VenueRow[];
}
