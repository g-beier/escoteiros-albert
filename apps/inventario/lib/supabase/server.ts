import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseEnv } from "@/lib/supabase/env";

export async function createClient() {
  const store = await cookies();
  return createServerClient(
    requireSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireSupabaseEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { cookies: { getAll: () => store.getAll(), setAll(values) {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
    } } },
  );
}
