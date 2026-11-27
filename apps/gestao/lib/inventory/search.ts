// Busca da lista de Materiais: o termo é normalizado como `inventory_search_normalize` (043) — sem acento e em
// minúsculas — e separado em palavras; o material precisa conter todas (em qualquer ordem e em qualquer campo).

/** Sem acento e em minúsculas, como a coluna `search_text` de `inventory_material_rows`. */
export function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Palavras da busca, normalizadas e sem repetição. */
export function searchTerms(query: string | undefined) {
  return [
    ...new Set(
      normalizeSearch(query ?? "")
        .split(/\s+/)
        .filter(Boolean),
    ),
  ];
}
