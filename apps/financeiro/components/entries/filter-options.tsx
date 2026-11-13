"use client";

import { createContext, useCallback, useContext, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type FilterKey = "conta" | "forma" | "pasta" | "conciliado" | "associado" | "rubrica" | "secao";
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

const DimensionsContext = createContext<FilterDimensions | null>(null);

export function FilterOptionsProvider({ dimensions, children }: { dimensions: FilterDimensions; children: React.ReactNode }) {
  return <DimensionsContext.Provider value={dimensions}>{children}</DimensionsContext.Provider>;
}

export function useDimension(key: FilterKey) {
  const dimensions = useContext(DimensionsContext);
  if (!dimensions) throw new Error("FilterOptionsProvider ausente.");
  const dimension = dimensions[key];
  if (!dimension) throw new Error(`Filtro "${key}" sem opções no FilterOptionsProvider.`);
  return dimension;
}

/** Lê e grava filtros na URL (estado compartilhável), sem rolar a página. */
export function useListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }, [params, pathname, router]);

  const values = useCallback((key: string) => (params.get(key) ?? "").split(",").map((v) => v.trim()).filter(Boolean), [params]);

  return { params, values, apply, pending };
}
