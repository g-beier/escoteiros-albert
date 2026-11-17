import type { SupabaseClient } from "@supabase/supabase-js";
import type { Option } from "@geas/ui/components/option-controls";

export async function fetchFamilyOptions(supabase: SupabaseClient, groupId: string, keep?: string | null): Promise<Option[]> {
  const { data } = await supabase.from("inventory_families").select("id, name, code, active").eq("group_id", groupId);
  return (data ?? [])
    .filter((row) => row.active || row.id === keep)
    .sort((a, b) => {
      const codeA = (a.code as string | null) ?? "";
      const codeB = (b.code as string | null) ?? "";
      if (codeA && codeB) return codeA.localeCompare(codeB, "pt-BR", { numeric: true });
      if (codeA) return -1;
      if (codeB) return 1;
      return (a.name as string).localeCompare(b.name as string, "pt-BR");
    })
    .map((row) => ({
      value: row.id as string,
      // Código da categoria (3 dígitos da etiqueta), não quantidade.
      label: row.code ? `${row.code} - ${row.name}` : (row.name as string),
    }));
}
