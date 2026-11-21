"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconArrowDown, IconArrowUp, IconCheck } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@geas/ui/components/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@geas/ui/components/popover";
import { cn } from "@geas/ui/lib/utils";
import type { SortKey } from "@/lib/inventory/material-list";
import { HEAD_TRIGGER, HeadIcons } from "@/components/shell/column-head";

/** Filtros de uma coluna: por valores (caixas de marcar) e/ou por faixa de/até (valor em reais ou inteiro). */
export type ColumnFilter = {
  values?: { param: string; title: string; options: { value: string; label: string }[] };
  range?: { from: string; to: string; money: boolean };
};

/**
 * Menu da coluna (como na planilha): ordenar nos dois sentidos e filtrar por valores e/ou por faixa. A ordem vale na
 * hora; o filtro, ao Aplicar. Tudo na query string da lista.
 */
export function ColumnMenu({ label, sortKey, sortLabels, filter, align = "start" }: {
  label: string; sortKey: SortKey; sortLabels: [string, string]; filter: ColumnFilter; align?: "start" | "end";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const { values, range } = filter;

  const sorted = params.get("ordem") === sortKey;
  const dir = params.get("dir") === "desc" ? "desc" : "asc";
  const all = values?.options.map((option) => option.value) ?? [];
  const selected = values ? (params.get(values.param) ?? "").split(",").filter((value) => all.includes(value)) : [];
  const filtered = selected.length > 0 || Boolean(range && (params.get(range.from) || params.get(range.to)));

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const onOpenChange = (next: boolean) => {
    if (next) {
      setChecked(new Set(selected.length ? selected : all));
      if (range) { setFrom(params.get(range.from) ?? ""); setTo(params.get(range.to) ?? ""); }
    }
    setOpen(next);
  };

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setOpen(false);
  };
  const sort = (to: "asc" | "desc") => go({ ordem: sortKey, dir: to === "desc" ? "desc" : null });
  const changes = (clear: boolean) => ({
    ...(values ? { [values.param]: clear || checked.size === all.length ? null : all.filter((value) => checked.has(value)).join(",") } : {}),
    ...(range ? { [range.from]: clear ? null : from.trim() || null, [range.to]: clear ? null : to.trim() || null } : {}),
  });
  const noneChecked = Boolean(values) && checked.size === 0;
  const submit = () => { if (!noneChecked) go(changes(false)); };
  const toggle = (value: string, on: boolean) => setChecked((current) => {
    const next = new Set(current);
    if (on) next.add(value); else next.delete(value);
    return next;
  });
  const state = [sorted && (dir === "asc" ? "em ordem crescente" : "em ordem decrescente"), filtered && "filtrada"].filter(Boolean).join(", ");
  const onEnter = (event: React.KeyboardEvent) => { if (event.key === "Enter") submit(); };

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger render={<button type="button" className={cn(HEAD_TRIGGER, (sorted || filtered) && "text-foreground")} />}>
      {label}
      <HeadIcons sorted={sorted} dir={dir} filtered={filtered} menu />
      <span className="sr-only">{state ? ` (${state})` : ""}. Abrir menu da coluna</span>
    </PopoverTrigger>
    <PopoverContent align={align} className="w-72 gap-0 p-0 text-xs font-normal tracking-normal normal-case">
      <div className="border-b px-3 py-2 text-sm font-semibold text-foreground">{label}</div>
      <ToggleGroup orientation="vertical" aria-label="Ordenar" value={sorted ? [dir] : []} className="grid w-full gap-0 p-1.5">
        {(["asc", "desc"] as const).map((value, index) => {
          const active = sorted && dir === value;
          return <ToggleGroupItem key={value} value={value} onClick={() => sort(value)}
            className="h-auto justify-start gap-2 rounded-md px-2 py-1.5 text-left text-xs font-normal hover:bg-muted aria-pressed:bg-transparent aria-pressed:font-semibold aria-pressed:hover:bg-muted">
            {value === "asc" ? <IconArrowUp className="size-3.5" aria-hidden /> : <IconArrowDown className="size-3.5" aria-hidden />}
            {sortLabels[index]}
            {active && <IconCheck className="ml-auto size-3.5 text-primary" aria-hidden />}
          </ToggleGroupItem>;
        })}
      </ToggleGroup>
      {values && <div className="grid gap-2 border-t p-3">
        <span className="font-semibold text-foreground">{values.title}</span>
        <div className="flex gap-3">
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setChecked(new Set(all))}>Selecionar tudo</button>
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setChecked(new Set())}>Limpar</button>
          <span className="ml-auto text-muted-foreground num">{checked.size} de {all.length}</span>
        </div>
        <ul className="grid gap-0.5" aria-label={`${values.title} — ${label}`}>
          {values.options.map((option) => <li key={option.value}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
              <Checkbox checked={checked.has(option.value)} onCheckedChange={(on) => toggle(option.value, on === true)} />
              {option.label}
            </label>
          </li>)}
        </ul>
      </div>}
      {range && <div className="grid gap-2 border-t p-3">
        <span className="font-semibold text-foreground">Filtrar por faixa</span>
        <div className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${sortKey}-from`}>De{range.money && " (R$)"}</Label>
            <Input id={`${sortKey}-from`} value={from} onChange={(event) => setFrom(event.target.value)} inputMode={range.money ? "decimal" : "numeric"} className="num" onKeyDown={onEnter} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${sortKey}-to`}>Até{range.money && " (R$)"}</Label>
            <Input id={`${sortKey}-to`} value={to} onChange={(event) => setTo(event.target.value)} inputMode={range.money ? "decimal" : "numeric"} className="num" onKeyDown={onEnter} />
          </div>
        </div>
      </div>}
      <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
        {noneChecked
          ? <span className="mr-auto text-destructive">Marque ao menos um.</span>
          : filtered && <button type="button" className="mr-auto font-semibold text-primary hover:underline" onClick={() => go(changes(true))}>Remover filtro</button>}
        <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button onClick={submit} disabled={noneChecked}>Aplicar</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
