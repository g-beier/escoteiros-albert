import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/lib/server/db";
import { asDb, type Supabase } from "./db";
import type { Database } from "./database.types";
import { requireSupabaseEnv } from "./env";

/**
 * Cliente com a chave secreta: ignora a RLS. Só para o que não é do usuário (lista de e-mails e convites em
 * Usuários, scripts). Nunca no navegador; os usos ficam em lib/server/users.ts e scripts/.
 */
export function serviceClient(): Supabase {
  return createClient<Database>(requireSupabaseEnv("NEXT_PUBLIC_SUPABASE_URL"), requireSupabaseEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export const serviceDb = (): Db => asDb(serviceClient());
