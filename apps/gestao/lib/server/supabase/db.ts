import type { SupabaseClient } from "@supabase/supabase-js";
import { DataError, type Db } from "@/lib/server/db";
import type { Database } from "./database.types";

// Implementação Supabase do `Db`. Os módulos de lib/server/<módulo> usam `sb()` para consultar e `rpc()` para as
// funções SQL auditadas; nada daqui sai de lib/server.

export type Supabase = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export const asDb = (client: SupabaseClient) => client as unknown as Db;
export const sb = (db: Db) => db as unknown as Supabase;

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Dados de uma consulta, ou `DataError` com a mensagem do banco. */
export function unwrap<T>(result: Result<T>): T | null {
  if (result.error) throw new DataError(result.error.message, result.error.code);
  return result.data;
}

/** Linhas de uma consulta de lista (nunca nulo). */
export function rowsOf<T>(result: Result<T[]>): T[] {
  return unwrap(result) ?? [];
}

/** Chama uma função SQL (argumentos conferidos pelos tipos gerados) e devolve o resultado, ou lança `DataError`. */
export async function rpc<F extends keyof Functions & string>(db: Db, fn: F, args: Functions[F]["Args"]): Promise<Functions[F]["Returns"]> {
  const { data, error } = await sb(db).rpc(fn, args as never);
  if (error) throw new DataError(error.message, error.code);
  return data as Functions[F]["Returns"];
}
