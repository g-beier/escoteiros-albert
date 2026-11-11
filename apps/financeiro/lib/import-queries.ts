import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportProfile } from "@/app/importacao/actions";

export type RecentImport = {
  id: string;
  file_name: string;
  imported_at: string;
  period_from: string;
  period_to: string;
  line_count: number;
  duplicate_count: number;
  profile_name: string | null;
};

type RecentImportRow = Omit<RecentImport, "profile_name"> & { profile: { name: string } | { name: string }[] | null };

/** Importações mais recentes de uma conta, para a lista em `/importacao`. */
export async function fetchRecentImports(supabase: SupabaseClient, groupId: string, accountId: string, limit = 10) {
  const { data, error } = await supabase.from("statement_imports")
    .select("id, file_name, imported_at, period_from, period_to, line_count, duplicate_count, profile:import_profiles(name)")
    .eq("group_id", groupId).eq("account_id", accountId)
    .order("imported_at", { ascending: false }).limit(limit);
  const rows = ((data ?? []) as unknown as RecentImportRow[]).map(({ profile, ...row }) => ({
    ...row,
    profile_name: (Array.isArray(profile) ? profile[0]?.name : profile?.name) ?? null,
  }));
  return { rows, error: error?.message };
}

/** Perfis de importação do grupo, mais recentes primeiro (mesma consulta de `listImportProfiles`). */
export async function fetchImportProfiles(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase.from("import_profiles")
    .select("id, name, format, header_signature, settings, updated_at")
    .eq("group_id", groupId).order("updated_at", { ascending: false });
  return { profiles: (data ?? []) as ImportProfile[], error: error?.message };
}
