/** Lowercase, accents removed, whitespace collapsed. Used for every case/accent-insensitive comparison. */
export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
