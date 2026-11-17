export function parseMoneyToCents(raw: string) {
  const value = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [integer, decimal = ""] = value.replace("-", "").split(".");
  const cents = Number(integer) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
