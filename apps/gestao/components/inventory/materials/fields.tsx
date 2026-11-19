"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { Textarea } from "@geas/ui/components/textarea";
import { cn } from "@geas/ui/lib/utils";
import { conditionOptions, originOptions } from "@/lib/inventory/vocabulary";
import { centsToInput } from "@/lib/format";

/** Campo com rótulo visível acima; `required` mostra * vermelho à direita do nome. */
export function Field({ id, label, required = false, className, children }: {
  id: string; label: string; required?: boolean; className?: string; children: ReactNode;
}) {
  return <div className={cn("grid gap-1.5", className)}>
    <Label htmlFor={id} className="gap-0">
      {label}
      {required && <span className="pl-0.5 text-destructive" aria-hidden>*</span>}
      {required && <span className="sr-only">(obrigatório)</span>}
    </Label>
    {children}
  </div>;
}

/** OptionSelect que também envia o valor no formulário (campo oculto `name`). */
export function SelectField({ id, name, label, options, defaultValue = "", emptyLabel, required = false, className }: {
  id: string; name: string; label: string; options: Option[]; defaultValue?: string; emptyLabel?: string; required?: boolean; className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return <Field id={id} label={label} required={required} className={className}>
    <OptionSelect id={id} value={value} onValueChange={setValue} options={options} emptyLabel={emptyLabel} />
    <input type="hidden" name={name} value={value} />
  </Field>;
}

export function ConditionField({ id, defaultValue = "", label = "Condição", required = false }: {
  id: string; defaultValue?: string; label?: string; required?: boolean;
}) {
  return <SelectField id={id} name="condition" label={label} options={conditionOptions} defaultValue={defaultValue} emptyLabel="Não informada" required={required} />;
}

export function LocationField({ id, locations, defaultValue = "", label = "Divisão", emptyLabel = "Escolha a divisão", required = false, className = "sm:col-span-2" }: {
  id: string; locations: Option[]; defaultValue?: string; label?: string; emptyLabel?: string; required?: boolean; className?: string;
}) {
  return <SelectField id={id} name="locationId" label={label} options={locations} defaultValue={defaultValue} emptyLabel={emptyLabel} required={required} className={className} />;
}

export type EntryDefaults = {
  unit_value_cents?: number | null; acquired_on?: string | null; origin?: string | null;
  supplier?: string | null; invoice?: string | null; notes?: string | null;
};

/** Dados de entrada: valor estimado, data, origem e fornecedor, nota fiscal, observação (opcionais). */
export function EntryFields({ prefix, defaults = {}, valueLabel = "Valor estimado (unidade)" }: { prefix: string; defaults?: EntryDefaults; valueLabel?: string }) {
  return <>
    <Field id={`${prefix}-value`} label={valueLabel}>
      <Input id={`${prefix}-value`} name="value" inputMode="decimal" placeholder="Ex.: 35,00" defaultValue={centsToInput(defaults.unit_value_cents)} className="num" />
    </Field>
    <Field id={`${prefix}-acquired`} label="Data de entrada">
      <Input id={`${prefix}-acquired`} name="acquiredOn" type="date" defaultValue={defaults.acquired_on ?? ""} className="num" />
    </Field>
    <SelectField id={`${prefix}-origin`} name="origin" label="Origem" options={originOptions} defaultValue={defaults.origin ?? "nao_informada"} />
    <Field id={`${prefix}-supplier`} label="Fornecedor">
      <Input id={`${prefix}-supplier`} name="supplier" maxLength={120} defaultValue={defaults.supplier ?? ""} />
    </Field>
    <Field id={`${prefix}-invoice`} label="Nota fiscal">
      <Input id={`${prefix}-invoice`} name="invoice" maxLength={60} defaultValue={defaults.invoice ?? ""} />
    </Field>
    <NotesField id={`${prefix}-notes`} defaultValue={defaults.notes ?? ""} />
  </>;
}

export function NotesField({ id, defaultValue = "", label = "Observação", required = false }: { id: string; defaultValue?: string; label?: string; required?: boolean }) {
  return <Field id={id} label={label} required={required} className="sm:col-span-2">
    <Textarea id={id} name="notes" maxLength={500} rows={2} defaultValue={defaultValue} required={required} />
  </Field>;
}

export function QuantityField({ id, label = "Quantidade", max, defaultValue, min = 1, required = true }: {
  id: string; label?: string; max?: number; defaultValue?: number; min?: number; required?: boolean;
}) {
  return <Field id={id} label={label} required={required}>
    <Input id={id} name="quantity" type="number" inputMode="numeric" min={min} max={max} defaultValue={defaultValue} required={required} className="num" />
  </Field>;
}
