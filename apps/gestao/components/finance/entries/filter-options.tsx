"use client";

import { createContext, useCallback, useContext, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AssociateFilterData } from "@/lib/finance/associate-filter";

export type FilterKey = "conta" | "forma" | "pasta" | "conciliado" | "rubrica" | "secao";
export type FilterOption = { value: string; label: string; depth?: number; tone?: "receita" | "despesa" };
export type FilterDimension = {
  label: string;
  options: FilterOption[];
  /** Para listas hierárquicas: marcar um item marca todos abaixo dele. */
  descendants?: Record<string, string[]>;
  /** Árvore (id, pai): com ela, a URL guarda a seleção compacta (`encodeCategorySelection`) em vez de todos os IDs. */
  hierarchy?: { id: string; parent_id: string | null }[];
  /** Atalhos que marcam um conjunto pronto (ex.: só rubricas inativas). */
  shortcuts?: { label: string; values: string[] }[];
};
/** Cada tela fornece só as dimensões que usa. */
export type FilterDimensions = Partial<Record<FilterKey, FilterDimension>>;

type FilterOptions = { dimensions: FilterDimensions; associates?: AssociateFilterData };

const OptionsContext = createContext<FilterOptions | null>(null);

/** `associates`: divisões e pessoas do filtro da coluna Associado (por nome ou por divisão). */
export function FilterOptionsProvider({
  dimensions,
  associates,
  children,
}: FilterOptions & { children: React.ReactNode }) {
  return <OptionsContext.Provider value={{ dimensions, associates }}>{children}</OptionsContext.Provider>;
}

function useOptions() {
  const options = useContext(OptionsContext);
  if (!options) throw new Error("FilterOptionsProvider ausente.");
  return options;
}

export function useDimension(key: FilterKey) {
  const dimension = useOptions().dimensions[key];
  if (!dimension) throw new Error(`Filtro "${key}" sem opções no FilterOptionsProvider.`);
  return dimension;
}

export function useAssociateOptions() {
  const associates = useOptions().associates;
  if (!associates) throw new Error("Filtro de associado sem dados no FilterOptionsProvider.");
  return associates;
}

/** Lê e grava filtros na URL (estado compartilhável), sem rolar a página. */
export function useListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  const values = useCallback(
    (key: string) =>
      (params.get(key) ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    [params],
  );

  return { params, values, apply, pending };
}
