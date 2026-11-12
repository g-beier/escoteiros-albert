"use client";

import { useActionState, useState } from "react";
import { saveFeeSettings, type FeeSettingsState } from "@/app/mensalidades/actions";
import { CategoryPicker } from "@/components/entries/category-picker";
import { OptionSelect } from "@/components/option-controls";
import { SectionCard, SectionHeader } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryItem } from "@/lib/categories";
import { dateBR } from "@/lib/format";
import { DUE_RULE_LABELS, dueDate, FEE_MONTH_LABELS, FEE_MONTHS, type DueRule, type FeeSettings } from "@/lib/fees";
import { useActionToast } from "@/lib/use-action-toast";

const initial: FeeSettingsState = {};
const ruleOptions = (Object.keys(DUE_RULE_LABELS) as DueRule[]).map((value) => ({ value, label: DUE_RULE_LABELS[value] }));

/** Configurações › Mensalidades: regra de vencimento (com prévia das datas) e rubrica de mensalidade. */
export function FeeSettingsForm({ settings, categories, defaultCategoryId, year }: {
  settings: FeeSettings; categories: CategoryItem[]; defaultCategoryId: string | null; year: number;
}) {
  const [state, action, pending] = useActionState(saveFeeSettings, initial);
  useActionToast(state);
  const [rule, setRule] = useState<DueRule>(settings.dueRule);
  const [day, setDay] = useState(String(settings.dueDay));
  const [categoryId, setCategoryId] = useState(settings.categoryId ?? defaultCategoryId ?? "");
  const dayNumber = Number(day);
  const maxDay = rule === "dia_util" ? 20 : 28;
  const validDay = rule === "fim_do_mes" || (Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= maxDay);
  const preview = validDay ? FEE_MONTHS.map((month) => ({ month, date: dueDate(year, month, { dueRule: rule, dueDay: dayNumber || 10 }) })) : [];

  return <SectionCard aria-labelledby="fee-settings-title">
    <SectionHeader title="Mensalidades" titleId="fee-settings-title" description="Vencimento usado para marcar as mensalidades atrasadas e rubrica cujos rateios com associado viram sugestão de pagamento." />
    <form action={action} className="grid gap-4 p-4">
      <input type="hidden" name="dueRule" value={rule} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5"><Label htmlFor="fee-rule">Vencimento</Label>
          <OptionSelect id="fee-rule" value={rule} onValueChange={(value) => setRule(value as DueRule)} options={ruleOptions} /></div>
        {rule !== "fim_do_mes" && <div className="grid gap-1.5"><Label htmlFor="fee-day">{rule === "dia_util" ? "Dia útil (1 a 20)" : "Dia do mês (1 a 28)"}</Label>
          <Input id="fee-day" name="dueDay" type="number" min={1} max={maxDay} value={day} onChange={(e) => setDay(e.target.value)} className="w-28 num" required aria-invalid={!validDay || undefined} /></div>}
        {rule === "fim_do_mes" && <input type="hidden" name="dueDay" value="10" />}
      </div>
      {rule === "dia_util" && <p className="m-0 text-xs text-muted-foreground">Dias úteis: segunda a sexta, sem os feriados nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus Christi).</p>}
      {preview.length > 0 && <p className="m-0 text-xs">
        <span className="text-muted-foreground">Vencimentos de {year}: </span>
        {preview.map((p, i) => <span key={p.month} className="num">{FEE_MONTH_LABELS[p.month]} {dateBR(p.date).slice(0, 5)}{i < preview.length - 1 ? " · " : ""}</span>)}
      </p>}
      <div className="grid max-w-md gap-1.5">
        <Label htmlFor="fee-category">Rubrica de mensalidade</Label>
        <CategoryPicker id="fee-category" value={categoryId} onChange={setCategoryId} categories={categories} preferredKind="receita" usedIds={[]} placeholder="Buscar rubrica…" />
        <p className="m-0 text-xs text-muted-foreground">Rateios nesta rubrica (e nas de baixo dela) com associado aparecem como sugestão na grade.</p>
      </div>
      <Button type="submit" className="w-fit" disabled={pending || !validDay}>{pending ? "Salvando…" : "Salvar"}</Button>
    </form>
  </SectionCard>;
}
