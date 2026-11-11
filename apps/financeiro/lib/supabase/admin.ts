import { createClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/supabase/env";

export function createAdminClient() {
  return createClient(
    requireSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireSupabaseEnv("SUPABASE_SECRET_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    },
  );
}
