/**
 * Valor digitado → centavos inteiros (como o banco guarda). Aceita o formato brasileiro com ou sem milhar
 * ("1.234,56", "1234,56"), ponto decimal com até 2 casas ("10.05"), "R$" e sinal; ponto seguido de grupos de
 * 3 dígitos é milhar ("1.234" = mil duzentos e trinta e quatro). `null` = inválido.
 * `allowNegative: false` (Inventário: valores de material) recusa negativos.
 */
export function parseMoneyToCents(
  raw: string,
  { allowNegative = true }: { allowNegative?: boolean } = {},
): number | null {
  let value = raw.replace(/\s/g, "").replace(/^(-?)R\$/i, "$1");
  const negative = value.startsWith("-");
  if (negative) value = value.slice(1).replace(/^R\$/i, "");
  if (negative && !allowNegative) return null;

  let integer: string;
  let decimal = "";
  if (value.includes(",")) {
    [integer, decimal] = value.split(",") as [string, string];
    if (value.split(",").length > 2 || !/^\d{1,2}$/.test(decimal)) return null;
    if (!/^\d+$/.test(integer) && !/^\d{1,3}(\.\d{3})+$/.test(integer)) return null;
    integer = integer.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(value)) {
    [integer, decimal] = value.split(".") as [string, string];
  } else if (/^\d+$/.test(value) || /^\d{1,3}(\.\d{3})+$/.test(value)) {
    integer = value.replace(/\./g, "");
  } else {
    return null;
  }

  const cents = Number(integer) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Até 13 dígitos (R$ 99 bilhões): cabe em `Number.isSafeInteger` com folga. */
export const MAX_MONEY_DIGITS = 13;

/** Centavos no formato do campo de valor: 123456 → "1.234,56", -500 → "-5,00"; ausente → "". */
export function formatInputCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  const abs = Math.abs(cents);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}${reais},${String(abs % 100).padStart(2, "0")}`;
}

/** Caixa registradora: dígitos entram pela direita (35 + "0" → 350 = R$ 3,50). Mantém o sinal; ignora o que passar do limite. */
export function pushDigits(cents: number | null, digits: string): number {
  const current = cents ?? 0;
  const sign = current < 0 ? -1 : 1;
  let abs = Math.abs(current);
  for (const digit of digits.replace(/\D/g, "")) {
    const next = abs * 10 + Number(digit);
    if (String(next).length > MAX_MONEY_DIGITS) break;
    abs = next;
  }
  return sign * abs;
}

/** Apaga o último dígito (R$ 3,50 → R$ 0,35); sem dígitos sobrando, o campo fica vazio. */
export function popDigit(cents: number | null): number | null {
  if (cents == null) return null;
  const next = Math.trunc(cents / 10);
  return next === 0 ? null : next;
}
