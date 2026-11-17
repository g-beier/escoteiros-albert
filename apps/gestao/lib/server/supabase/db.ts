import type { SupabaseClient } from "@supabase/supabase-js";
import { DataError, type Db } from "@/lib/server/db";
import type { Database } from "./database.types";

// Implementação Supabase do `Db`. Os módulos de lib/server/<módulo> usam `sb()` para consultar e `rpc()` para as
// funções SQL auditadas; nada daqui sai de lib/server.

export type Supabase = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export const asDb = (client: SupabaseClient) => client as unknown as Db;
export const sb = (db: Db) => db as unknown as Supabase;

// Respostas do PostgREST são uniões (sucesso | erro): o tipo dos dados sai da resposta inteira.
type Result = { data: unknown; error: { message: string; code?: string } | null };
type DataOf<R extends Result> = Exclude<R["data"], undefined>;

/** Dados de uma consulta (`null` quando `maybeSingle` não acha), ou `DataError` com a mensagem do banco. */
export function unwrap<R extends Result>(result: R): DataOf<R> | null {
  if (result.error) throw new DataError(result.error.message, result.error.code);
  return (result.data ?? null) as DataOf<R> | null;
}

/** Linhas de uma consulta de lista (nunca nulo). */
export function rowsOf<R extends Result>(result: R): NonNullable<DataOf<R>> {
  return (unwrap(result) ?? []) as NonNullable<DataOf<R>>;
}

/** O gerador não marca parâmetros anuláveis; as funções SQL aceitam `null` (= não informado). */
type Nullable<T> = { [K in keyof T]: T[K] | null };

/** Chama uma função SQL (nomes e tipos dos argumentos conferidos pelos tipos gerados) e devolve o resultado, ou lança `DataError`. */
export async function rpc<F extends keyof Functions & string>(db: Db, fn: F, args: Nullable<Functions[F]["Args"]>): Promise<Functions[F]["Returns"]> {
  const { data, error } = await sb(db).rpc(fn, args as never);
  if (error) throw new DataError(error.message, error.code);
  return data as Functions[F]["Returns"];
}
