"use client";

import { useMemo } from "react";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@geas/ui/components/combobox";
import { InputGroupAddon } from "@geas/ui/components/input-group";
import { categoryLabel, depthOf, sortCategories, type CategoryItem, type CategoryKind } from "@/lib/categories";
import { cn } from "@geas/ui/lib/utils";

type PickerItem = {
  value: string;
  /** Texto pesquisável e exibido no campo: código + caminho. */
  label: string;
  code: string | null;
  name: string;
  path: string;
  depth: number;
  isGroup: boolean;
  kind: CategoryKind | null;
  active: boolean;
};

const toneClass = (kind: CategoryKind | null) => kind === "receita" ? "text-success" : kind === "despesa" ? "text-destructive" : "text-muted-foreground";

/**
 * Seleção de rubrica em árvore: receitas e despesas (um lançamento pode misturar as duas),
 * com o tipo do lançamento primeiro, código, recuo por nível e indicação de grupo.
 * Rubricas inativas aparecem apenas quando já estão em uso no lançamento.
 */
export function CategoryPicker({ id, value, onChange, categories, preferredKind, usedIds, disabled, placeholder }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  categories: CategoryItem[];
  /** Tipo listado primeiro (o do lançamento). */
  preferredKind: CategoryKind | null;
  usedIds: string[];
  disabled?: boolean;
  placeholder: string;
}) {
  const items = useMemo<PickerItem[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const parents = new Set(categories.map((c) => c.parent_id).filter(Boolean));
    const rank = (c: CategoryItem) => c.kind === preferredKind ? 0 : c.kind === null ? 2 : 1;
    return sortCategories(categories)
      .sort((a, b) => rank(a) - rank(b))
      .filter((c) => (c.active && c.kind !== null) || usedIds.includes(c.id))
      .map((c) => {
        const label = categoryLabel(c, byId);
        const path = label.replace(/^[\d.]+\s/, "");
        return { value: c.id, label, code: c.code, name: c.name, path, depth: Math.max(depthOf(c.code) - 1, 0), isGroup: parents.has(c.id), kind: c.kind, active: c.active };
      })
      // a raiz (Receitas/Despesas) só aparece como cabeçalho, não como opção
      .filter((item) => item.code === null || item.code.includes(".") || usedIds.includes(item.value));
  }, [categories, preferredKind, usedIds]);

  const selected = items.find((item) => item.value === value) ?? null;

  return <Combobox
    items={items}
    value={selected}
    onValueChange={(item) => onChange((item as PickerItem | null)?.value ?? "")}
    itemToStringLabel={(item: PickerItem) => item.label}
    isItemEqualToValue={(a: PickerItem, b: PickerItem) => a.value === b.value}
    disabled={disabled}
  >
    <ComboboxInput id={id} placeholder={placeholder} disabled={disabled} showClear={!disabled && Boolean(selected)}
      className={cn("w-full", selected && (selected.kind === "receita" ? "border-l-4 border-l-success" : selected.kind === "despesa" ? "border-l-4 border-l-destructive" : ""))}>
      {selected && <InputGroupAddon align="inline-start" className="pr-0">
        <span className={cn("rounded px-1 text-[10px] font-semibold uppercase", selected.kind === "receita" ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive")}>{selected.kind === "receita" ? "Receita" : selected.kind === "despesa" ? "Despesa" : "Antiga"}</span>
      </InputGroupAddon>}
    </ComboboxInput>
    <ComboboxContent className="w-[min(30rem,calc(100vw-2rem))]">
      <ComboboxEmpty>Nenhuma rubrica encontrada.</ComboboxEmpty>
      <ComboboxList className="max-h-80">
        {(item: PickerItem) => <ComboboxItem key={item.value} value={item} className="pr-8">
          <span className="flex min-w-0 flex-1 items-baseline gap-2" style={{ paddingLeft: `${item.depth * 1.1}rem` }}>
            <span className={cn("num w-10 shrink-0 text-right text-[11px]", toneClass(item.kind))}>{item.code ?? "—"}</span>
            <span className={cn("truncate", item.isGroup && "font-semibold")}>{item.name}</span>
            {item.isGroup && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">grupo</span>}
            {!item.active && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">inativa</span>}
            {item.depth >= 1 && <span className="ml-auto hidden truncate text-[11px] text-muted-foreground sm:inline">{item.path.split(" › ").slice(0, -1).join(" › ")}</span>}
          </span>
        </ComboboxItem>}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>;
}
