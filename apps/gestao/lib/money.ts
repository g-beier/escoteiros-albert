/**
 * Valor digitado → centavos inteiros (como o banco guarda). Aceita o formato brasileiro com ou sem milhar
 * ("1.234,56", "1234,56"), ponto decimal com até 2 casas ("10.05"), "R$" e sinal; ponto seguido de grupos de
 * 3 dígitos é milhar ("1.234" = mil duzentos e trinta e quatro). `null` = inválido.
 * `allowNegative: false` (Inventário: valores de material) recusa negativos.
 */
export function parseMoneyToCents(raw: string, { allowNegative = true }: { allowNegative?: boolean } = {}): number | null {
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
