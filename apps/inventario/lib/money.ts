/** Valores em centavos inteiros, como no Financeiro. "12,50" → 1250; vazio → null. */
export function parseMoneyToCents(raw: string): number | null {
  const value = raw.trim().replace(/\s/g, "").replace(/^R\$/, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [integer, decimal = ""] = value.split(".");
  const cents = Number(integer) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

/** Centavos para o campo do formulário (1250 → "12,50"). */
export function centsToInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
