import type { ImportState } from "@/lib/import/state";
import type { PlannedFile } from "@/lib/import/plan";
import type { Db } from "@/lib/server/db";
import { rows, rpc, run } from "@/lib/server/pg/db";
import type { Json } from "@/lib/server/pg/schema";

// Importação por CSV (006, docs/importacao.md): o estado atual para a pré-visualização e a gravação do envio inteiro
// por `import_batch` (uma transação; o banco confere tudo de novo).

/** O que já está no app, para identificar e comparar as linhas dos CSVs. */
export async function state(db: Db, groupId: string): Promise<ImportState> {
  return run(db, async (sql) => {
    const [sections, patrols, people] = await Promise.all([
      sql`select id, branch::text as branch, name, active from public.sections where group_id = ${groupId} order by name`,
      sql`select p.id, p.section_id as "sectionId", p.name, p.active from public.patrols p
          join public.sections s on s.id = p.section_id where s.group_id = ${groupId} order by p.name`,
      sql`select id, name, nickname, birth_date as birth, branch::text as branch, section_id as "sectionId", patrol_id as "patrolId",
            registration::text as registration, joined_on as joined, promise_date as promise, active,
            case when active then null else left_on end as left, notes
          from public.associate_profile_rows where group_id = ${groupId} order by name limit 20000`,
    ]);
    return { sections: [...sections], patrols: [...patrols], people: [...people] } as unknown as ImportState;
  });
}

export type BatchResult = Record<string, Record<string, number>>;

/** Grava os arquivos planejados (só as linhas novas e alteradas), na ordem do plano. */
export async function save(db: Db, groupId: string, files: PlannedFile[]): Promise<BatchResult> {
  const payload = files.filter((file) => file.payload.length).map((file) => ({ kind: file.kind, rows: file.payload }));
  if (!payload.length) return {};
  const data = await rpc(db, "import_batch", { p_group_id: groupId, p_files: payload as Json });
  return (data ?? {}) as BatchResult;
}

/** Linhas para "Baixar dados atuais" de pessoas.csv. */
export async function exportPeople(db: Db, groupId: string) {
  return rows<{ id: string; name: string; nickname: string | null; birth_date: string | null; branch: string; section: string | null; patrol: string | null;
    registration: string; joined_on: string | null; promise_date: string | null; active: boolean; left_on: string | null; notes: string | null }>(db, (sql) => sql`
    select id, name, nickname, birth_date, branch::text as branch, section, patrol, registration::text as registration, joined_on, promise_date,
      active, left_on, notes
    from public.associate_profile_rows where group_id = ${groupId} order by name limit 20000`);
}

/** Linhas para "Baixar dados atuais" de secoes.csv. */
export async function exportSections(db: Db, groupId: string) {
  return rows<{ branch: string; section: string; patrol: string | null; active: boolean }>(db, (sql) => sql`
    select s.branch::text as branch, s.name as section, null::text as patrol, s.active from public.sections s where s.group_id = ${groupId}
    union all
    select s.branch::text, s.name, p.name, p.active from public.patrols p join public.sections s on s.id = p.section_id where s.group_id = ${groupId}
    order by 1, 2, 3 nulls first`);
}
