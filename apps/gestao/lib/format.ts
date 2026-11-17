export function money(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export function dateBR(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

/** Centavos em reais ("R$ 1.234,56"); ausente vale zero. `money` recebe reais. */
export function formatCents(cents: number | string | null | undefined) {
  return money(Number(cents ?? 0) / 100);
}

/** Centavos para o formato editável do formulário (ex.: -1005 → "-10,05"; ausente → ""). */
export function centsToInput(cents: number | null | undefined) {
  if (cents == null) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** "a1b2c3…f9e8": o FITID do Nubank é um UUID; o começo e o fim bastam para reconhecer. */
export function shortOfxId(id: string) {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}
