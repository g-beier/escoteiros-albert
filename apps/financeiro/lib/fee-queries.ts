import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPaged } from "@/lib/supabase/paged";
import {
  buildFeeRows, DEFAULT_FEE_SETTINGS, priceForAssociate, suggestFeeMonths, todayInSaoPaulo,
  type DueRule, type FeeAssociate, type FeeExemption, type FeePrice, type FeeRecord, type FeeRow, type FeeSettings, type FeeSplit, type FeeSuggestion,
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
  const [settings, prices, individual, associates, records, exemptions, splits] = await Promise.all([
    fetchFeeSettings(supabase, groupId),
    fetchFeePrices(supabase, groupId),
    fetchPaged<{ associate_id: string; monthly_cents: number; reason: string }>((from, to) => supabase.from("fee_associate_prices")
      .select("associate_id, monthly_cents, reason").eq("group_id", groupId).eq("year", year).order("associate_id").range(from, to), 20_000),
    fetchPaged<FeeAssociate>((from, to) => supabase.from("associates").select("id, name, branch, section, active")
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
  const error = [individual, associates, records, exemptions, splits].map((r) => r.error?.message).find(Boolean);
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
    rows: buildFeeRows({ year, today, settings, associates: associates.data, records: feeRecords, exemptions: fees, suggestions }),
  };
}
