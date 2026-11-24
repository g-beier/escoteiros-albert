import type { ImportState } from "@/lib/import/state";
import type { PlannedFile } from "@/lib/import/plan";
import type { Db } from "@/lib/server/db";
import { rows, rpc, run } from "@/lib/server/pg/db";
import type { Json } from "@/lib/server/pg/schema";
import type { FunctionExport, PersonExport, RelativeExport, SectionExport } from "@/lib/import/export";

// Importação por CSV (006, docs/importacao.md): o estado atual para a pré-visualização e a gravação do envio inteiro
// por `import_batch` (uma transação; o banco confere tudo de novo).

/** O que já está no app, para identificar e comparar as linhas dos CSVs. */
export async function state(db: Db, groupId: string): Promise<ImportState> {
  return run(db, async (sql) => {
    const [sections, patrols, people, functions, relatives, links, items, statuses, periods, exclusions, events, stars, notes] = await Promise.all([
      sql`select id, branch::text as branch, name, active from public.sections where group_id = ${groupId} order by name`,
      sql`select p.id, p.section_id as "sectionId", p.name, p.active from public.patrols p
          join public.sections s on s.id = p.section_id where s.group_id = ${groupId} order by p.name`,
      sql`select id, name, nickname, birth_date as birth, branch::text as branch, section_id as "sectionId", patrol_id as "patrolId",
            registration::text as registration, joined_on as joined, promise_date as promise, active,
            case when active then null else left_on end as left, notes
          from public.associate_profile_rows where group_id = ${groupId} order by name limit 20000`,
      sql`select id, associate_id as "associateId", kind::text as kind, title, section_id as "sectionId", started_on as started,
            ended_on as ended, elected
          from public.associate_functions where group_id = ${groupId} limit 20000`,
      sql`select id, name, associate_id as "associateId", notes from public.relatives where group_id = ${groupId} limit 20000`,
      sql`select id, associate_id as "associateId", relative_id as "relativeId", kinship::text as kinship, kinship_note as "kinshipNote", legal, financial
          from public.relative_links where group_id = ${groupId} limit 40000`,
      sql`select i.id, i.name, i.kind::text as kind, i.directorate::text as directorate, i.value_kind::text as "valueKind",
            i.validity_months as "validityMonths", i.remove_on_leave as "removeOnLeave", i.active,
            coalesce((select jsonb_object_agg(a.audience::text, a.initial_status::text) from public.control_item_audiences a where a.item_id = i.id), '{}') as audiences
          from public.control_items i where i.group_id = ${groupId} order by i.directorate, i.position`,
      sql`select associate_id as "associateId", relative_id as "relativeId", item_id as "itemId", status::text as status,
            status_date as "statusDate", valid_until as "validUntil", value_year as year, note
          from public.control_statuses where group_id = ${groupId} limit 100000`,
      sql`select associate_id as "associateId", branch::text as branch, started_on as started, ended_on as ended, place
          from public.associate_life_periods where group_id = ${groupId} order by started_on limit 50000`,
      sql`select associate_id as "associateId", started_on as started, ended_on as ended, reason, note
          from public.associate_life_exclusions where group_id = ${groupId} order by started_on limit 50000`,
      sql`select associate_id as "associateId", event_date as date, title, description
          from public.associate_life_events where group_id = ${groupId} order by event_date limit 50000`,
      sql`select associate_id as "associateId", star, branch::text as branch, delivered_on as delivered
          from public.associate_stars where group_id = ${groupId} order by star limit 50000`,
      sql`select id, life_notes from public.associates where group_id = ${groupId} and life_notes is not null limit 20000`,
    ]);
    return {
      sections: [...sections], patrols: [...patrols], people: [...people], functions: [...functions], relatives: [...relatives],
      links: [...links], items: [...items], statuses: [...statuses],
      life: {
        periods: [...periods], exclusions: [...exclusions], events: [...events], stars: [...stars],
        notes: Object.fromEntries(notes.map((row) => [row.id, row.life_notes])),
      },
    } as unknown as ImportState;
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
  return rows<PersonExport>(db, (sql) => sql`
    select id, name, nickname, birth_date, branch::text as branch, section, patrol, registration::text as registration, joined_on, promise_date,
      active, left_on, notes
    from public.associate_profile_rows where group_id = ${groupId} order by name limit 20000`);
}

/** Linhas para "Baixar dados atuais" de secoes.csv. */
export async function exportSections(db: Db, groupId: string) {
  return rows<SectionExport>(db, (sql) => sql`
    select s.branch::text as branch, s.name as section, null::text as patrol, s.active from public.sections s where s.group_id = ${groupId}
    union all
    select s.branch::text, s.name, p.name, p.active from public.patrols p join public.sections s on s.id = p.section_id where s.group_id = ${groupId}
    order by 1, 2, 3 nulls first`);
}

/** Linhas para "Baixar dados atuais" de funcoes.csv. */
export async function exportFunctions(db: Db, groupId: string) {
  return rows<FunctionExport>(db, (sql) => sql`
    select a.id as person_id, a.name as person, a.birth_date, f.kind::text as kind, f.title, s.name as section, f.started_on, f.ended_on, f.elected
    from public.associate_functions f join public.associates a on a.id = f.associate_id left join public.sections s on s.id = f.section_id
    where f.group_id = ${groupId} order by a.name, f.started_on nulls first limit 20000`);
}

/** Linhas para "Baixar dados atuais" de responsaveis.csv. */
export async function exportRelatives(db: Db, groupId: string) {
  return rows<RelativeExport>(db, (sql) => sql`
    select a.id as youth_id, a.name as youth, a.birth_date as youth_birth, r.name as relative, l.kinship::text as kinship, l.kinship_note,
      l.legal, l.financial, ra.name as relative_associate, r.notes
    from public.relative_links l join public.associates a on a.id = l.associate_id join public.relatives r on r.id = l.relative_id
    left join public.associates ra on ra.id = r.associate_id
    where l.group_id = ${groupId} order by a.name, l.position limit 40000`);
}
