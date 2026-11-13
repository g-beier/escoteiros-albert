"use client";

import { useActionState, useState } from "react";
import { saveFeeSettings, saveFeeYearSettings, type FeeSettingsState } from "@/app/mensalidades/actions";
import { CategoryPicker } from "@/components/entries/category-picker";
import { OptionSelect } from "@/components/option-controls";
import { SectionBody, SectionCard, SectionHeader } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryItem } from "@/lib/categories";
import { centsToInput, dateBR, money } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { annualAmounts, DUE_RULE_LABELS, dueDate, FEE_MONTH_LABELS, FEE_MONTHS, type DueRule, type FeePrice, type FeeSettings } from "@/lib/fees";
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
    <form action={action} className="grid gap-3 p-3">
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

/** Valor da mensalidade por ano e desconto do pagamento integral (10 meses de uma vez) até a data-limite. */
export function FeeYearForm({ prices, currentYear }: { prices: Record<number, FeePrice>; currentYear: number }) {
  const years = [...new Set([currentYear - 1, currentYear, currentYear + 1, ...Object.keys(prices).map(Number)])].sort((a, b) => b - a);
  const [year, setYear] = useState(currentYear);
  return <SectionCard aria-labelledby="fee-year-title">
    <SectionHeader title="Valores por ano" titleId="fee-year-title" description="Mensalidade de março a dezembro e desconto para quem paga os 10 meses de uma vez até a data-limite. Usados no previsto × recebido e para reconhecer pagamentos nas sugestões." />
    <SectionBody>
      <div className="grid w-fit gap-1.5"><Label htmlFor="fee-year">Ano</Label>
        <OptionSelect id="fee-year" value={String(year)} onValueChange={(value) => setYear(Number(value))}
          options={years.map((y) => ({ value: String(y), label: prices[y] ? String(y) : `${y} (sem valor)` }))} /></div>
      <FeeYearFields key={year} year={year} price={prices[year]} />
    </SectionBody>
  </SectionCard>;
}

function FeeYearFields({ year, price }: { year: number; price?: FeePrice }) {
  const [state, action, pending] = useActionState(saveFeeYearSettings, initial);
  useActionToast(state);
  const [monthly, setMonthly] = useState(price ? centsToInput(price.monthlyCents) : "");
  const [discount, setDiscount] = useState(price ? String(price.discountPct).replace(".", ",") : "0");
  const [deadline, setDeadline] = useState(price?.deadline ?? `${year}-03-31`);
  const monthlyCents = parseMoneyToCents(monthly);
  const discountPct = Number(discount.replace(",", ".")) || 0;
  const preview = monthlyCents && monthlyCents > 0 ? annualAmounts({ monthlyCents, discountPct, deadline: deadline || null }) : null;
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="year" value={year} />
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5"><Label htmlFor="fee-monthly">Mensalidade (R$)</Label>
        <Input id="fee-monthly" name="monthly" inputMode="decimal" placeholder="Ex.: 60,00" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="w-32 text-right num" required /></div>
      <div className="grid gap-1.5"><Label htmlFor="fee-discount">Desconto do integral (%)</Label>
        <Input id="fee-discount" name="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-28 text-right num" /></div>
      <div className="grid gap-1.5"><Label htmlFor="fee-deadline">Pagando até</Label>
        <Input id="fee-deadline" name="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required={discountPct > 0} className="num" /></div>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : `Salvar ${year}`}</Button>
    </div>
    {preview && <p className="m-0 text-xs text-muted-foreground">
      Ano completo: <strong className="num text-foreground">{money(preview.full / 100)}</strong>
      {discountPct > 0 && deadline && <> · integral até <span className="num">{dateBR(deadline)}</span>: <strong className="num text-success">{money(preview.discounted / 100)}</strong></>}
    </p>}
  </form>;
}
