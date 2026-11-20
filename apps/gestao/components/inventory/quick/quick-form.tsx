"use client";

import { useActionState, useState } from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Field as ChoiceField, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@geas/ui/components/field";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import type { Option } from "@geas/ui/components/option-controls";
import { RadioGroup, RadioGroupItem } from "@geas/ui/components/radio-group";
import { useActionToast } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { quickRecord } from "@/app/(inventario)/inventario/rapido/actions";
import { ConditionPill } from "@/components/inventory/condition-pill";
import { ConditionField, Field, NotesField, SelectField } from "@/components/inventory/materials/fields";
import type { QuickKind } from "@/lib/inventory/quick";
import { conditionOptions, writeOffOptions, type Condition, type Tracking } from "@/lib/inventory/vocabulary";

// Formulário do registro rápido: poucos campos, uma coluna, botões altos para o dedo. O item (lote ou peça) é
// escolhido em cartões; a quantidade tem botões − e +.

export type QuickItem = { value: string; kind: "lot" | "unit"; title: string; path: string; quantity: number; condition: Condition | null };
export type QuickMaterial = { id: string; name: string; tracking: Tracking; consumable: boolean };

const BIG = "h-11 text-sm";

export function QuickForm({ kind, material, items = [], locations, families = [] }: {
  kind: QuickKind; material?: QuickMaterial; items?: QuickItem[]; locations: Option[]; families?: Option[];
}) {
  const [state, formAction, pending] = useActionState(quickRecord, {});
  useActionToast(state);
  const [selected, setSelected] = useState(items.length === 1 ? items[0].value : "");
  const [tracking, setTracking] = useState<Tracking>(material?.tracking ?? "lot");
  const item = items.find((row) => row.value === selected);
  const needsItem = kind !== "entrada" && kind !== "novo";
  const isLot = needsItem ? item?.kind === "lot" : tracking === "lot";

  return <form action={formAction} className="grid gap-4">
    <input type="hidden" name="kind" value={kind} />
    {material && <input type="hidden" name="materialId" value={material.id} />}
    {kind !== "novo" && <input type="hidden" name="tracking" value={tracking} />}

    {kind === "novo" && <>
      <Field id="quick-name" label="Nome do material">
        <Input id="quick-name" name="name" required minLength={2} maxLength={120} placeholder="Ex.: Lanterna de cabeça" className={BIG} />
      </Field>
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-1.5 text-xs font-medium">Controle</legend>
        <RadioGroup value={tracking} onValueChange={(value) => setTracking(value as Tracking)} className="grid gap-2" aria-label="Controle">
          {([["lot", "Por quantidade", "Canecas, cordas, remédios"], ["unit", "Por peça", "Barraca, fogareiro, lampião"]] as const).map(([value, title, examples]) =>
            <FieldLabel key={value} htmlFor={`quick-tracking-${value}`} className="has-data-checked:border-primary">
              <ChoiceField orientation="horizontal">
                <FieldContent><FieldTitle>{title}</FieldTitle><FieldDescription className="italic">Ex.: {examples}</FieldDescription></FieldContent>
                <RadioGroupItem value={value} id={`quick-tracking-${value}`} />
              </ChoiceField>
            </FieldLabel>)}
        </RadioGroup>
        <input type="hidden" name="tracking" value={tracking} />
      </fieldset>
      {tracking === "lot" && <label className="flex items-center gap-2 text-xs"><Checkbox name="consumable" value="on" /> Consumível (acaba com o uso)</label>}
      {families.length > 0 && <SelectField id="quick-family" name="familyId" label="Família" options={families} emptyLabel="Sem família" />}
    </>}

    {needsItem && <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1.5 text-xs font-medium">{material?.tracking === "unit" ? "Peça" : "Lote"}</legend>
      {items.length === 0
        ? <p className="m-0 text-xs text-muted-foreground">Nada em estoque para esta ação.</p>
        : <RadioGroup value={selected} onValueChange={(value) => setSelected(String(value))} className="grid gap-2" aria-label={material?.tracking === "unit" ? "Peça" : "Lote"}>
          {items.map((row) => <FieldLabel key={row.value} htmlFor={`quick-item-${row.value}`} className="has-data-checked:border-primary">
            <ChoiceField orientation="horizontal">
              <FieldContent>
                <FieldTitle>{row.title}</FieldTitle>
                <FieldDescription>{row.path}</FieldDescription>
                {row.condition && <span><ConditionPill condition={row.condition} /></span>}
              </FieldContent>
              <RadioGroupItem value={row.value} id={`quick-item-${row.value}`} />
            </ChoiceField>
          </FieldLabel>)}
        </RadioGroup>}
      <input type="hidden" name="item" value={selected} />
    </fieldset>}

    {(kind === "entrada" || kind === "novo") && <SelectField id="quick-location" name="locationId" label="Divisão" options={locations} />}
    {kind === "transferir" && <SelectField id="quick-location" name="locationId" label="Para a divisão" options={locations.filter((row) => row.label !== item?.path)} />}

    {kind === "retirar" && isLot && <Stepper key={selected} label="Quantidade retirada" max={item?.quantity} defaultValue={1} />}
    {(kind === "condicao" || kind === "transferir") && isLot && <Stepper key={selected} label="Quantidade" max={item?.quantity} defaultValue={item?.quantity ?? 1} />}
    {kind === "ajustar" && <Stepper key={selected} label="Quantidade contada" min={0} defaultValue={item?.quantity ?? 0} />}
    {(kind === "entrada" || kind === "novo") && tracking === "lot" && <Stepper label="Quantidade" defaultValue={1} />}

    {kind === "retirar" && <SelectField id="quick-reason" name="reason" label="Motivo" options={writeOffOptions} defaultValue={material?.consumable ? "consumo" : ""} />}
    {kind === "condicao" && <SelectField id="quick-condition" name="condition" label="Nova condição" options={conditionOptions.filter((row) => row.value !== item?.condition)} />}
    {(kind === "entrada" || kind === "novo") && <ConditionField id="quick-condition" />}
    {(kind === "entrada" || kind === "novo") && tracking === "unit" && <Field id="quick-tag" label="Etiqueta (se já tiver)">
      <Input id="quick-tag" name="tag" placeholder="Ex.: GEAS-001-0012" className={cn(BIG, "num")} />
    </Field>}
    {kind === "entrada" && tracking === "lot" && <Field id="quick-variant" label="Variação (se for diferente dos outros)">
      <Input id="quick-variant" name="variant" maxLength={80} placeholder="Ex.: modelo antigo" className={BIG} />
    </Field>}
    {(kind === "entrada" || kind === "novo") && tracking === "lot" && <Field id="quick-expires" label="Validade (se houver)">
      <Input id="quick-expires" name="expiresOn" type="date" className={cn(BIG, "num")} />
    </Field>}

    <NotesField id="quick-notes" label={kind === "ajustar" ? "Por que a contagem mudou?" : "Observação"} required={kind === "ajustar"} />

    <Button type="submit" size="lg" className={BIG} disabled={pending || (needsItem && !selected)}>{pending ? "Salvando…" : "Registrar"}</Button>
    <p className="m-0 text-center text-[11px] text-muted-foreground">Vale na hora e fica para revisar pelo gestor.</p>
  </form>;
}

/** Quantidade com − e + (o campo continua editável). */
function Stepper({ label, min = 1, max, defaultValue }: { label: string; min?: number; max?: number; defaultValue: number }) {
  const [value, setValue] = useState(String(defaultValue));
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  const step = (delta: number) => setValue(String(clamp((Number(value) || 0) + delta)));
  return <div className="grid gap-1.5">
    <Label htmlFor="quick-quantity">{label}{max != null && <span className="font-normal text-muted-foreground"> (de {max})</span>}</Label>
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon-lg" className="size-11" onClick={() => step(-1)} aria-label="Menos um"><IconMinus /></Button>
      <Input id="quick-quantity" name="quantity" type="number" inputMode="numeric" min={min} max={max} required value={value}
        onChange={(event) => setValue(event.target.value)} className={`${BIG} num flex-1 text-center`} />
      <Button type="button" variant="outline" size="icon-lg" className="size-11" onClick={() => step(1)} aria-label="Mais um"><IconPlus /></Button>
    </div>
  </div>;
}
