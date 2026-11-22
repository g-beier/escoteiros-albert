import type { Db } from "@/lib/server/db";
import { one, rows, rpc, run } from "@/lib/server/pg/db";
import { exportYears } from "@/lib/finance/export/period";
import {
  buildFeeRows, DEFAULT_FEE_SETTINGS, priceForAssociate, suggestFeeMonths, todayInSaoPaulo,
  type AssociateMovement, type DueRule, type FeeAssociate, type FeeExemption, type FeePrice, type FeeRecord, type FeeRow, type FeeSettings, type FeeSplit, type FeeSuggestion,
} from "@/lib/finance/fees";

type SettingsRow = { due_rule: DueRule; due_day: number; category_id: string | null };
type RecordRow = { associate_id: string; month: number; status: FeeRecord["status"]; note: string | null; fee_record_splits: { split_id: string }[] };
type SplitRow = { split_id: string; associate_id: string; entry_id: string; entry_date: string; amount_cents: number; description: string; linked_periods: number[] };

export async function fetchFeeSettings(db: Db, groupId: string): Promise<FeeSettings> {
  const row = await one<SettingsRow>(db, (sql) => sql`select due_rule, due_day, category_id from public.fee_settings where group_id = ${groupId}`);
  return row ? { dueRule: row.due_rule, dueDay: row.due_day, categoryId: row.category_id } : DEFAULT_FEE_SETTINGS;
}

/** Valor da mensalidade e desconto do integral, por ano. */
export async function fetchFeePrices(db: Db, groupId: string): Promise<Record<number, FeePrice>> {
  const data = await rows<{ year: number; monthly_cents: number; annual_discount_pct: number; annual_deadline: string | null }>(db, (sql) => sql`
    select year, monthly_cents, annual_discount_pct, annual_deadline from public.fee_year_settings where group_id = ${groupId}`);
  const prices: Record<number, FeePrice> = {};
  for (const row of data) {
    prices[row.year] = { monthlyCents: Number(row.monthly_cents), discountPct: Number(row.annual_discount_pct), deadline: row.annual_deadline };
  }
  return prices;
}

export type FeeYear = {
  year: number;
  settings: FeeSettings;
  /** Nulo quando o valor do ano ainda não foi configurado. */
  price: FeePrice | null;
  /** Valores individuais do ano, por associado (irmãos, combinação…). */
  individualPrices: Record<string, { monthlyCents: number; reason: string }>;
  rows: FeeRow[];
  suggestions: FeeSuggestion[];
  /** Rateios de mensalidade do ano (e os ligados a caixinhas do ano), por associado. */
  splitsByAssociate: Record<string, FeeSplit[]>;
  error?: string;
};

/** Tudo o que a grade de um ano precisa: configurações, associados, registros, isenções e rateios de mensalidade. */
export async function fetchFeeYear(db: Db, groupId: string, year: number, today = todayInSaoPaulo()): Promise<FeeYear> {
  const [settings, prices, lists] = await Promise.all([
    fetchFeeSettings(db, groupId),
    fetchFeePrices(db, groupId),
    run(db, async (sql) => {
      const [individual, movements, associates, records, exemptions, splits] = await Promise.all([
        sql`select associate_id, monthly_cents, reason from public.fee_associate_prices
            where group_id = ${groupId} and year = ${year} order by associate_id`,
        sql`select id, associate_id, movement_date, kind, reason from public.associate_movements
            where group_id = ${groupId} order by movement_date, id`,
        sql`select id, name, branch, section, patrol, active from public.associate_rows where group_id = ${groupId} order by name, id`,
        sql`select r.associate_id, r.month, r.status, r.note,
              coalesce((select json_agg(json_build_object('split_id', s.split_id)) from public.fee_record_splits s where s.fee_record_id = r.id), '[]') as fee_record_splits
            from public.fee_records r where r.group_id = ${groupId} and r.year = ${year} order by r.associate_id, r.month`,
        sql`select associate_id, reason from public.fee_exemptions where group_id = ${groupId} and year = ${year} order by associate_id`,
        sql`select split_id, associate_id, entry_id, entry_date, amount_cents, description, linked_periods from public.fee_split_candidates
            where group_id = ${groupId} and entry_date >= ${`${year - 1}-01-01`} and entry_date <= ${`${year + 1}-12-31`}
            order by entry_date, split_id`,
      ]);
      return {
        individual: { data: [...individual] as unknown as { associate_id: string; monthly_cents: number; reason: string }[] },
        movements: { data: [...movements] as unknown as { id: string; associate_id: string; movement_date: string; kind: AssociateMovement["kind"]; reason: string | null }[] },
        associates: { data: [...associates] as unknown as FeeAssociate[] },
        records: { data: [...records] as unknown as RecordRow[] },
        exemptions: { data: [...exemptions] as unknown as { associate_id: string; reason: string }[] },
        splits: { data: [...splits] as unknown as SplitRow[] },
      };
    }).then((data) => ({ ...data, error: undefined as string | undefined })).catch((error: Error) => ({
      individual: { data: [] }, movements: { data: [] }, associates: { data: [] }, records: { data: [] }, exemptions: { data: [] }, splits: { data: [] },
      error: error.message,
    })),
  ]);
  const { individual, movements, associates, records, exemptions, splits, error } = lists;
  const feeRecords: FeeRecord[] = records.data.map((r) => ({
    associateId: r.associate_id, month: r.month, status: r.status, note: r.note, splitIds: r.fee_record_splits.map((s) => s.split_id),
  }));
  const feeSplits: FeeSplit[] = splits.data.map((s) => ({
    splitId: s.split_id, associateId: s.associate_id, entryId: s.entry_id, entryDate: s.entry_date,
    amountCents: Number(s.amount_cents), description: s.description, linkedPeriods: s.linked_periods ?? [],
  }));
  // no ano: lançados no ano ou já ligados a uma caixinha do ano
  const relevant = feeSplits.filter((s) => s.entryDate.startsWith(`${year}-`) || s.linkedPeriods.some((p) => Math.floor(p / 100) === year));
  const price = prices[year] ?? null;
  const individualPrices: FeeYear["individualPrices"] = {};
  for (const row of individual.data) individualPrices[row.associate_id] = { monthlyCents: Number(row.monthly_cents), reason: row.reason };
  const suggestions = suggestFeeMonths(year, relevant, feeRecords, (associateId) => priceForAssociate(price, individualPrices[associateId]?.monthlyCents));
  const fees: FeeExemption[] = exemptions.data.map((e) => ({ associateId: e.associate_id, reason: e.reason }));
  const splitsByAssociate: Record<string, FeeSplit[]> = {};
  for (const split of relevant) (splitsByAssociate[split.associateId] ??= []).push(split);
  return {
    year, settings, price, individualPrices, suggestions, splitsByAssociate, error,
    rows: buildFeeRows({
      year, today, settings, associates: associates.data, records: feeRecords, exemptions: fees, suggestions,
      movements: movements.data.map((m) => ({ id: m.id, associateId: m.associate_id, date: m.movement_date, kind: m.kind, reason: m.reason })),
    }),
  };
}

/**
 * Anos do seletor de Mensalidades: do primeiro ao último ano com algo para mostrar (registros de mensalidade,
 * valores do ano ou lançamentos, que viram sugestões), sempre com o ano atual; mais recentes primeiro.
 */
export async function fetchFeeYears(db: Db, groupId: string) {
  const edges = await one<{ r1: number | null; r2: number | null; s1: number | null; s2: number | null; e1: string | null; e2: string | null }>(db, (sql) => sql`
    select (select min(year) from public.fee_records where group_id = ${groupId}) as r1,
      (select max(year) from public.fee_records where group_id = ${groupId}) as r2,
      (select min(year) from public.fee_year_settings where group_id = ${groupId}) as s1,
      (select max(year) from public.fee_year_settings where group_id = ${groupId}) as s2,
      (select min(entry_date) from public.ledger_entries where group_id = ${groupId}) as e1,
      (select max(entry_date) from public.ledger_entries where group_id = ${groupId}) as e2`);
  const years = [edges?.r1, edges?.r2, edges?.s1, edges?.s2, edges?.e1?.slice(0, 4), edges?.e2?.slice(0, 4)]
    .filter((value) => value !== undefined && value !== null).map(Number);
  if (!years.length) return exportYears();
  return exportYears(`${Math.min(...years)}-01-01`, `${Math.max(...years)}-01-01`);
}

// Escritas (funções auditadas de 018–022) ---------------------------------------------------------------

export type FeeStatusInput = "pago" | "atencao" | "nao_pago" | "isento";

/** Caixinha de um mês (status nulo limpa), com observação e rateios vinculados. */
export async function setRecord(db: Db, input: { associateId: string; year: number; month: number; status: FeeStatusInput | null; note: string | null; splitIds: string[] }) {
  await rpc(db, "set_fee_record", {
    p_associate_id: input.associateId, p_year: input.year, p_month: input.month, p_status: input.status, p_note: input.note, p_split_ids: input.splitIds,
  });
}

/** Confirma sugestões (pago + vínculo ao rateio) em lote; devolve quantas. */
export async function confirmSuggestions(db: Db, items: { associateId: string; year: number; month: number; splitId: string; status: "pago" | "atencao"; note?: string }[]): Promise<number> {
  return Number(await rpc(db, "confirm_fee_suggestions", { p_items: items as never }));
}

/** Isenta no ano (com motivo) ou remove a isenção (`null`). */
export async function setExemption(db: Db, associateId: string, year: number, reason: string | null) {
  await rpc(db, "set_fee_exemption", { p_associate_id: associateId, p_year: year, p_reason: reason });
}

export async function saveSettings(db: Db, groupId: string, input: { dueRule: DueRule; dueDay: number; categoryId: string | null }) {
  await rpc(db, "set_fee_settings", { p_group_id: groupId, p_due_rule: input.dueRule, p_due_day: input.dueDay, p_category_id: input.categoryId });
}

export async function saveYearSettings(db: Db, groupId: string, input: { year: number; monthlyCents: number; discountPct: number; deadline: string | null }) {
  await rpc(db, "set_fee_year_settings", {
    p_group_id: groupId, p_year: input.year, p_monthly_cents: input.monthlyCents, p_discount_pct: input.discountPct, p_deadline: input.deadline,
  });
}

/** Valor individual do associado no ano; `monthlyCents` nulo remove. */
export async function setAssociatePrice(db: Db, associateId: string, year: number, monthlyCents: number | null, reason: string | null) {
  await rpc(db, "set_fee_associate_price", { p_associate_id: associateId, p_year: year, p_monthly_cents: monthlyCents, p_reason: reason });
}

/** Entrada (ou retorno) e saída do associado: definem os meses cobrados. */
export async function addMovement(db: Db, associateId: string, date: string, kind: "entrada" | "saida", reason: string | null) {
  await rpc(db, "add_associate_movement", { p_associate_id: associateId, p_date: date, p_kind: kind, p_reason: reason });
}

export async function deleteMovement(db: Db, movementId: string) {
  await rpc(db, "delete_associate_movement", { p_movement_id: movementId });
}
