"use client";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@geas/ui/components/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geas/ui/components/select";
import { cn } from "@geas/ui/lib/utils";

/** `detail`: informação secundária (ex.: código), à direita do rótulo e mais discreta na lista de opções. */
export type Option = { value: string; label: string; detail?: string };

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
  const longest = Math.min(24, Math.max(placeholder.length, ...items.map((item: Option) => item.label.length + (item.detail ? item.detail.length + 2 : 0))));
  return <Select disabled={disabled} items={items} value={value || (emptyLabel ? "" : null)} onValueChange={(next) => onValueChange((next as string | null) ?? "")}>
    <SelectTrigger id={id} style={{ minWidth: `calc(${longest}ch + 2.75rem)` }} className={cn("w-full", className)} aria-invalid={invalid || undefined} aria-label={aria["aria-label"]}>
      <SelectValue className="block min-w-0 truncate" placeholder={emptyLabel ?? placeholder} />
    </SelectTrigger>
    <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-(--anchor-width)">
      {items.map((item: Option) => <SelectItem key={item.value || "__empty"} value={item.value} className={cn(item.detail && "pr-7")}>
        {item.label}
        {item.detail && <>{" "}<span className="num ml-auto pl-3 text-muted-foreground">{item.detail}</span></>}
      </SelectItem>)}
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
