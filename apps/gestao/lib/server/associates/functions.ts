import type { AssociateFunction, FunctionKind } from "@/lib/associates/controls";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb } from "@/lib/server/supabase/db";

// Funções dos adultos (041): leitura de `associate_function_rows`; escritas pelas funções auditadas associates_*_function.

const COLUMNS = "id, associate_id, kind, title, started_on, ended_on, section_id, section, elected";

/** Funções do grupo (atuais e encerradas): base dos subgrupos Escotistas/Dirigentes e do público. */
export async function list(db: Db, groupId: string): Promise<AssociateFunction[]> {
  return rowsOf(await sb(db).from("associate_function_rows").select(COLUMNS).eq("group_id", groupId).limit(10000)) as AssociateFunction[];
}

/** Funções de um associado, da mais recente para a mais antiga. */
export async function listOf(db: Db, associateId: string): Promise<AssociateFunction[]> {
  return rowsOf(await sb(db).from("associate_function_rows").select(COLUMNS).eq("associate_id", associateId)
    .order("started_on", { ascending: false, nullsFirst: true })) as AssociateFunction[];
}

/** Tipo, seção (só escotista, obrigatória: 052), cargo e datas da função. */
export type FunctionInput = { kind: FunctionKind; sectionId: string | null; title: string | null; startedOn: string; elected: boolean };

export async function add(db: Db, associateId: string, input: FunctionInput): Promise<string> {
  return rpc(db, "associates_add_function", {
    p_associate_id: associateId, p_kind: input.kind, p_section_id: input.sectionId as string, p_title: input.title as string, p_started_on: input.startedOn,
    p_elected: input.elected,
  });
}

/** Corrige a função; `endedOn` nulo = em exercício. */
export async function update(db: Db, functionId: string, input: FunctionInput & { endedOn: string | null }): Promise<void> {
  await rpc(db, "associates_update_function", {
    p_function_id: functionId, p_kind: input.kind, p_section_id: input.sectionId as string, p_title: input.title as string,
    p_started_on: input.startedOn, p_ended_on: input.endedOn as string, p_elected: input.elected,
  });
}

export async function end(db: Db, functionId: string, endedOn: string): Promise<void> {
  await rpc(db, "associates_end_function", { p_function_id: functionId, p_ended_on: endedOn });
}

export async function remove(db: Db, functionId: string): Promise<void> {
  await rpc(db, "associates_delete_function", { p_function_id: functionId });
}
