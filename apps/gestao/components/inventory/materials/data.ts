import type { SupabaseClient } from "@supabase/supabase-js";
import type { Option } from "@geas/ui/components/option-controls";

export async function fetchFamilyOptions(supabase: SupabaseClient, groupId: string, keep?: string | null): Promise<Option[]> {
  const { data } = await supabase.from("inventory_families").select("id, name, code, active").eq("group_id", groupId).order("name");
  return (data ?? [])
    .filter((row) => row.active || row.id === keep)
    .map((row) => ({ value: row.id as string, label: row.code ? `${row.name} (${row.code})` : (row.name as string) }));
}
