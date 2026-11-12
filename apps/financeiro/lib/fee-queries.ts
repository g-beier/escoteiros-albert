import type { SupabaseClient } from "@supabase/supabase-js";
import { exportYears } from "@/lib/export/period";
import { fetchPaged } from "@/lib/supabase/paged";
import {
  buildFeeRows, DEFAULT_FEE_SETTINGS, priceForAssociate, suggestFeeMonths, todayInSaoPaulo,
  type AssociateMovement, type DueRule, type FeeAssociate, type FeeExemption, type FeePrice, type FeeRecord, type FeeRow, type FeeSettings, type FeeSplit, type FeeSuggestion,
} from "@/lib/fees";

type SettingsRow = { due_rule: DueRule; due_day: number; category_id: string | null };
type RecordRow = { associate_id: string; month: number; status: FeeRecord["status"]; note: string | null; fee_record_splits: { split_id: string }[] };
type SplitRow = { split_id: string; associate_id: string; entry_id: string; entry_date: string; amount_cents: number; description: string; linked_periods: number[] };

export async function fetchFeeSettings(supabase: SupabaseClient, groupId: string): Promise<FeeSettings> {
  const { data } = await supabase.from("fee_settings").select("due_rule, due_day, category_id").eq("group_id", groupId).maybeSingle();
  const row = data as SettingsRow | null;
  return row ? { dueRule: row.due_rule, dueDay: row.due_day, categoryId: row.category_id } : DEFAULT_FEE_SETTINGS;
}

/** Valor da mensalidade e desconto do integral, por ano. */
export async function fetchFeePrices(supabase: SupabaseClient, groupId: string): Promise<Record<number, FeePrice>> {
  const { data } = await supabase.from("fee_year_settings").select("year, monthly_cents, annual_discount_pct, annual_deadline").eq("group_id", groupId);
  const prices: Record<number, FeePrice> = {};
  for (const row of (data ?? []) as { year: number; monthly_cents: number; annual_discount_pct: number; annual_deadline: string | null }[]) {
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
export async function fetchFeeYear(supabase: SupabaseClient, groupId: string, year: number, today = todayInSaoPaulo()): Promise<FeeYear> {
  const [settings, prices, individual, movements, associates, records, exemptions, splits] = await Promise.all([
    fetchFeeSettings(supabase, groupId),
    fetchFeePrices(supabase, groupId),
    fetchPaged<{ associate_id: string; monthly_cents: number; reason: string }>((from, to) => supabase.from("fee_associate_prices")
      .select("associate_id, monthly_cents, reason").eq("group_id", groupId).eq("year", year).order("associate_id").range(from, to), 20_000),
    fetchPaged<{ id: string; associate_id: string; movement_date: string; kind: AssociateMovement["kind"]; reason: string | null }>((from, to) =>
      supabase.from("associate_movements").select("id, associate_id, movement_date, kind, reason").eq("group_id", groupId)
        .order("movement_date").order("id").range(from, to), 50_000),
    fetchPaged<FeeAssociate>((from, to) => supabase.from("associate_rows").select("id, name, branch, section, patrol, active")
      .eq("group_id", groupId).order("name").order("id").range(from, to), 20_000),
    fetchPaged<RecordRow>((from, to) => supabase.from("fee_records").select("associate_id, month, status, note, fee_record_splits(split_id)")
      .eq("group_id", groupId).eq("year", year).order("associate_id").order("month").range(from, to), 50_000),
    fetchPaged<{ associate_id: string; reason: string }>((from, to) => supabase.from("fee_exemptions").select("associate_id, reason")
      .eq("group_id", groupId).eq("year", year).order("associate_id").range(from, to), 20_000),
    fetchPaged<SplitRow>((from, to) => supabase.from("fee_split_candidates")
      .select("split_id, associate_id, entry_id, entry_date, amount_cents, description, linked_periods")
      .eq("group_id", groupId).gte("entry_date", `${year - 1}-01-01`).lte("entry_date", `${year + 1}-12-31`)
      .order("entry_date").order("split_id").range(from, to), 50_000),
  ]);
  const error = [individual, movements, associates, records, exemptions, splits].map((r) => r.error?.message).find(Boolean);
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
export async function fetchFeeYears(supabase: SupabaseClient, groupId: string) {
  const edge = (table: "fee_records" | "fee_year_settings", ascending: boolean) =>
    supabase.from(table).select("year").eq("group_id", groupId).order("year", { ascending }).limit(1).maybeSingle();
  const entry = (ascending: boolean) =>
    supabase.from("ledger_entries").select("entry_date").eq("group_id", groupId).order("entry_date", { ascending }).limit(1).maybeSingle();
  const [r1, r2, s1, s2, e1, e2] = await Promise.all([edge("fee_records", true), edge("fee_records", false), edge("fee_year_settings", true), edge("fee_year_settings", false), entry(true), entry(false)]);
  const years = [r1.data?.year, r2.data?.year, s1.data?.year, s2.data?.year, e1.data?.entry_date?.slice(0, 4), e2.data?.entry_date?.slice(0, 4)]
    .filter((value) => value !== undefined && value !== null).map(Number);
  if (!years.length) return exportYears();
  return exportYears(`${Math.min(...years)}-01-01`, `${Math.max(...years)}-01-01`);
}
