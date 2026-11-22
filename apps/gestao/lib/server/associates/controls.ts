import { sortAudiences, type ControlItem, type ControlItemKind, type ControlStatus, type ControlStatusRow, type ControlValueKind, type Directorate, type ItemAudience } from "@/lib/associates/controls";
import type { Db } from "@/lib/server/db";
import { rows, rpc, run } from "@/lib/server/pg/db";

// Controle de dados pessoais (041): leituras de `control_items`, `control_item_audiences` e `control_status_rows`;
// escritas só pelas funções auditadas control_item_* e control_status_* (conferem `can_manage_associates`).

const ITEM_COLUMNS = "id, name, kind, value_kind, directorate, validity_months, remove_on_leave, active, position";
const STATUS_COLUMNS = "associate_id, relative_id, item_id, status, effective_status, status_date, valid_until, value_year, note, updated_at";

/** Itens de controle do grupo (ativos e inativos), na ordem escolhida, com os públicos e o valor inicial de cada um. */
export async function items(db: Db, groupId: string): Promise<ControlItem[]> {
  const { list, audiences } = await run(db, async (sql) => {
    const [list, audiences] = await Promise.all([
      sql`select ${sql.unsafe(ITEM_COLUMNS)} from public.control_items where group_id = ${groupId} order by position, name`,
      sql`select item_id, audience, initial_status from public.control_item_audiences where group_id = ${groupId} limit 10000`,
    ]);
    return {
      list: [...list] as unknown as Omit<ControlItem, "audiences">[],
      audiences: [...audiences] as unknown as ({ item_id: string } & ItemAudience)[],
    };
  });
  const byItem = new Map<string, ItemAudience[]>();
  for (const a of audiences) byItem.set(a.item_id, [...(byItem.get(a.item_id) ?? []), { audience: a.audience, initial_status: a.initial_status }]);
  return list.map((row) => ({ ...row, audiences: sortAudiences(byItem.get(row.id) ?? []) }));
}

/** Situações registradas no grupo (com a efetiva, que considera a validade). */
export async function statuses(db: Db, groupId: string): Promise<ControlStatusRow[]> {
  return rows<ControlStatusRow>(db, (sql) => sql`select ${sql.unsafe(STATUS_COLUMNS)} from public.control_status_rows where group_id = ${groupId} limit 100000`);
}

/** Situações de um associado. */
export async function statusesOf(db: Db, associateId: string): Promise<ControlStatusRow[]> {
  return rows<ControlStatusRow>(db, (sql) => sql`select ${sql.unsafe(STATUS_COLUMNS)} from public.control_status_rows where associate_id = ${associateId}`);
}

export type ItemInput = {
  name: string; kind: ControlItemKind; valueKind: ControlValueKind; directorate: Directorate; audiences: ItemAudience[];
  validityMonths: number | null; removeOnLeave: boolean;
};

export async function createItem(db: Db, groupId: string, input: ItemInput): Promise<string> {
  return rpc(db, "control_item_create", {
    p_group_id: groupId, p_name: input.name, p_kind: input.kind, p_directorate: input.directorate, p_audiences: input.audiences,
    p_validity_months: input.validityMonths, p_remove_on_leave: input.removeOnLeave, p_value_kind: input.valueKind,
  });
}

export async function updateItem(db: Db, id: string, input: ItemInput & { active: boolean }): Promise<void> {
  await rpc(db, "control_item_update", {
    p_item_id: id, p_name: input.name, p_kind: input.kind, p_directorate: input.directorate, p_audiences: input.audiences,
    p_validity_months: input.validityMonths, p_remove_on_leave: input.removeOnLeave, p_active: input.active, p_value_kind: input.valueKind,
  });
}

/** Põe o item na posição (os outros se ajustam na função SQL). */
export async function placeItem(db: Db, id: string, position: number): Promise<void> {
  await rpc(db, "control_item_place", { p_item_id: id, p_position: position });
}

export type StatusInput = {
  /** Associado ou responsável (`relative`). */
  person: { id: string; relative: boolean }; itemId: string; status: ControlStatus | null; statusDate: string | null; validUntil: string | null;
  /** Ano do item que mostra ano. */
  valueYear: number | null; note: string | null;
};

/**
 * Grava a situação (upsert); ok sem validade num item que vence recebe a validade calculada no banco. Situação nula:
 * vira ok se o item mostra um valor e ele foi informado (senão o banco recusa).
 */
export async function setStatus(db: Db, input: StatusInput): Promise<void> {
  const values = {
    p_item_id: input.itemId, p_status: input.status, p_status_date: input.statusDate, p_valid_until: input.validUntil, p_note: input.note,
    p_value_year: input.valueYear,
  };
  if (input.person.relative) await rpc(db, "control_status_set_relative", { p_relative_id: input.person.id, ...values });
  else await rpc(db, "control_status_set", { p_associate_id: input.person.id, ...values });
}

/** Apaga a situação: a célula volta a "sem registro". */
export async function clearStatus(db: Db, person: { id: string; relative: boolean }, itemId: string): Promise<void> {
  if (person.relative) await rpc(db, "control_status_clear_relative", { p_relative_id: person.id, p_item_id: itemId });
  else await rpc(db, "control_status_clear", { p_associate_id: person.id, p_item_id: itemId });
}
