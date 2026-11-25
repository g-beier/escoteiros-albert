import type { ImportState } from "@/lib/import/state";
import type { PlannedFile } from "@/lib/import/plan";
import type { Db } from "@/lib/server/db";
import { rows, rpc, run } from "@/lib/server/pg/db";
import type { Json } from "@/lib/server/pg/schema";
import type { EntryExport, FunctionExport, LotExport, PersonExport, RelativeExport, SectionExport, UnitExport } from "@/lib/import/export";

// Importação por CSV (006, docs/importacao.md): o estado atual para a pré-visualização e a gravação do envio inteiro
// por `import_batch` (uma transação; o banco confere tudo de novo).

/** O que já está no app, para identificar e comparar as linhas dos CSVs. */
export async function state(db: Db, groupId: string): Promise<ImportState> {
  return run(db, async (sql) => {
    const [sections, patrols, people, functions, relatives, links, items, statuses, periods, exclusions, events, stars, notes, inventory,
      categories, accounts, paymentMethods, entries, quarantined] = await Promise.all([
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
      sql`select (select count(*)::int from public.inventory_locations where group_id = ${groupId}) as locations,
            (select count(*)::int from public.inventory_materials where group_id = ${groupId}) as materials,
            (select count(*)::int from public.inventory_lots where group_id = ${groupId}) as lots,
            (select count(*)::int from public.inventory_units where group_id = ${groupId}) as units,
            (select count(*)::int from public.inventory_movements where group_id = ${groupId} and channel <> 'importacao') as "appMovements"`,
      sql`select id, code, name, kind::text as kind, active from public.categories where group_id = ${groupId} order by public.category_code_key(code)`,
      sql`select id, name, active from public.accounts where group_id = ${groupId} order by name`,
      sql`select id, name, active from public.payment_methods where group_id = ${groupId} order by name`,
      sql`select e.id, e.entry_date::text as date, a.name as account, e.name, e.total_cents::int as total
          from public.ledger_entries e join public.accounts a on a.id = e.account_id where e.group_id = ${groupId} limit 100000`,
      sql`select name from public.associates_quarantined_names(${groupId}) as name`,
    ]);
    return {
      sections: [...sections], patrols: [...patrols], people: [...people], functions: [...functions], relatives: [...relatives],
      links: [...links], items: [...items], statuses: [...statuses],
      life: {
        periods: [...periods], exclusions: [...exclusions], events: [...events], stars: [...stars],
        notes: Object.fromEntries(notes.map((row) => [row.id, row.life_notes])),
      },
      inventory: inventory[0],
      finance: { categories: [...categories], accounts: [...accounts], paymentMethods: [...paymentMethods], entries: [...entries] },
      quarantined: quarantined.map((row) => row.name),
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

/**
 * Linhas para "Baixar dados atuais" de inventario-lotes.csv: os lotes com saldo; as contagens de cada material e
 * divisão vão na primeira linha do par (ou numa linha de quantidade 0, quando o par não tem lote).
 */
export async function exportLots(db: Db, groupId: string) {
  return rows<LotExport>(db, (sql) => sql`
    with counts as (
      select material_id, location_id, jsonb_object_agg(year::text, quantity) as counts
      from public.inventory_counts where group_id = ${groupId} group by material_id, location_id
    ), lots as (
      select l.material_id, l.location_id, l.quantity, l.condition::text as condition, l.expires_on, l.unit_value_cents, l.variant, l.notes,
        row_number() over (partition by l.material_id, l.location_id order by l.created_at) as n
      from public.inventory_lots l where l.group_id = ${groupId} and l.quantity > 0
    ), pairs as (
      select material_id, location_id, quantity, condition, expires_on, unit_value_cents, variant, notes, n from lots
      union all
      select c.material_id, c.location_id, 0, null, null, null, null, null, 1 from counts c
      where not exists (select 1 from lots where lots.material_id = c.material_id and lots.location_id = c.location_id)
    )
    select p.path as location, f.code as family_code, f.name as family, m.name as material, m.description as material_description, m.consumable,
      m.minimum_quantity as minimum, x.quantity, x.condition, x.expires_on, x.unit_value_cents, x.variant, x.notes,
      case when x.n = 1 then c.counts end as counts
    from pairs x join public.inventory_materials m on m.id = x.material_id join public.inventory_location_paths p on p.id = x.location_id
    left join public.inventory_families f on f.id = m.family_id
    left join counts c on c.material_id = x.material_id and c.location_id = x.location_id
    where m.tracking = 'lot'
    order by p.sort_key, m.name, x.n limit 20000`);
}

/** Linhas para "Baixar dados atuais" de inventario-pecas.csv (peças não baixadas). */
export async function exportUnits(db: Db, groupId: string) {
  return rows<UnitExport>(db, (sql) => sql`
    select u.tag, u.legacy_code, m.name as material, f.code as family_code, f.name as family, p.path as location, u.condition::text as condition,
      u.description, u.unit_value_cents, u.notes
    from public.inventory_units u join public.inventory_materials m on m.id = u.material_id join public.inventory_location_paths p on p.id = u.location_id
    left join public.inventory_families f on f.id = m.family_id
    where u.group_id = ${groupId} and u.written_off_at is null
    order by u.tag nulls last, u.legacy_code limit 20000`);
}

/** Linhas para "Baixar dados atuais" de lancamentos.csv: um rateio por linha, do mais antigo ao mais novo. */
export async function exportEntries(db: Db, groupId: string) {
  return rows<EntryExport>(db, (sql) => sql`
    select e.id as entry_id, e.entry_date::text as entry_date, e.name, a.name as account, p.name as payment_method, e.document, e.document_filed,
      s.amount_cents::int as amount_cents, c.code as category_code, c.name as category_name, s.description, x.name as associate, e.notes,
      count(*) over (partition by e.id)::int as split_count
    from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id join public.accounts a on a.id = e.account_id
    join public.payment_methods p on p.id = e.payment_method_id join public.categories c on c.id = s.category_id
    left join public.associates x on x.id = s.associate_id
    where e.group_id = ${groupId} order by e.entry_date, e.created_at, e.id, s.created_at, s.id limit 50000`);
}
