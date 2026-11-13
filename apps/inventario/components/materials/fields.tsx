"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { Textarea } from "@geas/ui/components/textarea";
import { cn } from "@geas/ui/lib/utils";
import { conditionOptions, originOptions } from "@/lib/inventory";
import { centsToInput } from "@/lib/money";

/** Campo com rótulo visível acima. */
export function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-1.5", className)}><Label htmlFor={id}>{label}</Label>{children}</div>;
}

/** OptionSelect que também envia o valor no formulário (campo oculto `name`). */
export function SelectField({ id, name, label, options, defaultValue = "", emptyLabel, className }: {
  id: string; name: string; label: string; options: Option[]; defaultValue?: string; emptyLabel?: string; className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return <Field id={id} label={label} className={className}>
    <OptionSelect id={id} value={value} onValueChange={setValue} options={options} emptyLabel={emptyLabel} />
    <input type="hidden" name={name} value={value} />
  </Field>;
}

export function ConditionField({ id, defaultValue = "", label = "Condição" }: { id: string; defaultValue?: string; label?: string }) {
  return <SelectField id={id} name="condition" label={label} options={conditionOptions} defaultValue={defaultValue} emptyLabel="Não informada" />;
}

export function LocationField({ id, locations, defaultValue = "", label = "Divisão" }: { id: string; locations: Option[]; defaultValue?: string; label?: string }) {
  return <SelectField id={id} name="locationId" label={label} options={locations} defaultValue={defaultValue} className="sm:col-span-2" />;
}

export type EntryDefaults = {
  unit_value_cents?: number | null; acquired_on?: string | null; origin?: string | null;
  supplier?: string | null; invoice?: string | null; notes?: string | null;
};

/** Dados de entrada: valor estimado, data, origem (obrigatórios no modelo) e fornecedor, nota fiscal, observação (opcionais). */
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
  return <Field id={id} label={label} className="sm:col-span-2">
    <Textarea id={id} name="notes" maxLength={500} rows={2} defaultValue={defaultValue} required={required} />
  </Field>;
}

export function QuantityField({ id, label = "Quantidade", max, defaultValue, min = 1 }: { id: string; label?: string; max?: number; defaultValue?: number; min?: number }) {
  return <Field id={id} label={label}>
    <Input id={id} name="quantity" type="number" inputMode="numeric" min={min} max={max} defaultValue={defaultValue} required className="num" />
  </Field>;
}
