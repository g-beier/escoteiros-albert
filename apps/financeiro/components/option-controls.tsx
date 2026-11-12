"use client";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

type SelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  /** Rótulo da opção vazia (ex.: "Todas"); omitido quando a escolha é obrigatória. */
  emptyLabel?: string;
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
};

/** Select acessível (Base UI) que trabalha com strings; "" representa nenhuma opção. */
export function OptionSelect({ id, value, onValueChange, options, placeholder = "Selecione…", emptyLabel, className, invalid, disabled, ...aria }: SelectProps) {
  const items = emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options;
  // largura mínima para o rótulo mais longo caber (até 24 caracteres; acima disso, corta com "…")
  const longest = Math.min(24, Math.max(placeholder.length, ...items.map((item) => item.label.length)));
  return <Select disabled={disabled} items={items} value={value || (emptyLabel ? "" : null)} onValueChange={(next) => onValueChange((next as string | null) ?? "")}>
    <SelectTrigger id={id} style={{ minWidth: `calc(${longest}ch + 2.75rem)` }} className={cn("w-full", className)} aria-invalid={invalid || undefined} aria-label={aria["aria-label"]}>
      <SelectValue className="block min-w-0 truncate" placeholder={emptyLabel ?? placeholder} />
    </SelectTrigger>
    <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width)">
      {items.map((item) => <SelectItem key={item.value || "__empty"} value={item.value}>{item.label}</SelectItem>)}
    </SelectContent>
  </Select>;
}

type ComboboxProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

/** Combobox com busca, para listas longas (associados). */
export function OptionCombobox({ id, value, onValueChange, options, placeholder = "Buscar…", emptyText = "Nada encontrado.", className, disabled, ...aria }: ComboboxProps) {
  const selected = options.find((option) => option.value === value) ?? null;
  return <Combobox
    disabled={disabled}
    items={options}
    value={selected}
    onValueChange={(item) => onValueChange((item as Option | null)?.value ?? "")}
    itemToStringLabel={(item: Option) => item.label}
    isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
  >
    <ComboboxInput id={id} placeholder={placeholder} showClear={!disabled} disabled={disabled} className={cn("w-full", className)} aria-label={aria["aria-label"]} />
    <ComboboxContent>
      <ComboboxEmpty>{emptyText}</ComboboxEmpty>
      <ComboboxList>{(item: Option) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}</ComboboxList>
    </ComboboxContent>
  </Combobox>;
}
