import type { AssociateFunction, FunctionKind } from "@/lib/associates/controls";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb } from "@/lib/server/supabase/db";

// Funções dos adultos (041): leitura de `associate_function_rows`; escritas pelas funções auditadas associates_*_function.

const COLUMNS = "id, associate_id, kind, title, started_on, ended_on";

/** Funções do grupo (atuais e encerradas): base dos subgrupos Escotistas/Dirigentes e do público. */
export async function list(db: Db, groupId: string): Promise<AssociateFunction[]> {
  return rowsOf(await sb(db).from("associate_function_rows").select(COLUMNS).eq("group_id", groupId).limit(10000)) as AssociateFunction[];
}

/** Funções de um associado, da mais recente para a mais antiga. */
export async function listOf(db: Db, associateId: string): Promise<AssociateFunction[]> {
  return rowsOf(await sb(db).from("associate_function_rows").select(COLUMNS).eq("associate_id", associateId)
    .order("started_on", { ascending: false, nullsFirst: true })) as AssociateFunction[];
}

export async function add(db: Db, associateId: string, kind: FunctionKind, title: string | null, startedOn: string): Promise<string> {
  return rpc(db, "associates_add_function", { p_associate_id: associateId, p_kind: kind, p_title: title, p_started_on: startedOn });
}

export async function end(db: Db, functionId: string, endedOn: string): Promise<void> {
  await rpc(db, "associates_end_function", { p_function_id: functionId, p_ended_on: endedOn });
}

export async function remove(db: Db, functionId: string): Promise<void> {
  await rpc(db, "associates_delete_function", { p_function_id: functionId });
}
