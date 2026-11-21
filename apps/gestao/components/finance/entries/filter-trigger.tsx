"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { cn } from "@geas/ui/lib/utils";
import { HEAD_TRIGGER, HeadIcons } from "@/components/shell/column-head";

export const sortState = (sorted: boolean, dir: "asc" | "desc") => sorted ? (dir === "asc" ? "em ordem crescente" : "em ordem decrescente") : "";

/**
 * Onde o filtro aparece: `head` no cabeçalho da coluna (como nos Materiais), `button` como botão solto,
 * `row` como botão de largura inteira (lista do botão "Filtros" no celular).
 */
export type FilterVariant = "head" | "button" | "row";

type Trigger = { variant: FilterVariant; label: string; summary: string | null; sorted?: boolean; dir?: "asc" | "desc" };

/** Elemento do `PopoverTrigger` (`render`) de um menu de filtro. */
export function triggerElement({ variant, label, summary, sorted = false }: Trigger) {
  const active = summary !== null;
  return variant === "head"
    ? <button type="button" className={cn(HEAD_TRIGGER, (active || sorted) && "text-foreground")} title={active ? `${label}: ${summary}` : undefined} />
    : <Button variant="outline" className={cn("justify-start font-normal", variant === "row" ? "w-full" : "max-w-72", active && "border-primary bg-accent/60 text-accent-foreground")} />;
}

/** Conteúdo do gatilho: rótulo e indicadores (cabeçalho) ou rótulo e resumo (botão). */
export function TriggerContent({ variant, label, summary, sorted = false, dir = "desc" }: Trigger) {
  const active = summary !== null;
  if (variant === "head") {
    const state = [sorted && sortState(true, dir), active && `filtrada: ${summary}`].filter(Boolean).join(", ");
    return <>
      {label}
      <HeadIcons sorted={sorted} dir={dir} filtered={active} menu />
      <span className="sr-only">{state ? ` (${state})` : ""}. Abrir menu da coluna</span>
    </>;
  }
  return <>
    <span className={cn("shrink-0", active ? "font-semibold" : "text-muted-foreground")}>{label}{active && ":"}</span>
    {active && <span className="truncate">{summary}</span>}
    <IconChevronDown className="ml-auto text-muted-foreground" data-icon="inline-end" />
  </>;
}
