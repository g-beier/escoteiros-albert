/**
 * Conta contábil: código do plano de contas do sistema contábil de destino.
 * A mesma máscara está no domínio `public.ledger_code` (014_accounting.sql); mude as duas juntas.
 */
export const LEDGER_CODE_MASK = "0.0.0.0.0000";
const PATTERN = /^\d\.\d\.\d\.\d\.\d{4}$/;
const DIGITS = LEDGER_CODE_MASK.replace(/\D/g, "").length;

export function isLedgerCode(value: string) {
  return PATTERN.test(value);
}

/** Aplica a máscara enquanto se digita: "3121" → "3.1.2.1", "31210005" → "3.1.2.1.0005". */
export function formatLedgerCode(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, DIGITS);
  let result = "";
  let used = 0;
  for (const char of LEDGER_CODE_MASK) {
    if (used >= digits.length) break;
    if (char === "0") result += digits[used++];
    else result += char;
  }
  return result;
}

/** Valor do formulário: vazio vira null; formato inválido vira mensagem de erro. */
export function parseLedgerCode(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { ok: true, value: null };
  return isLedgerCode(text) ? { ok: true, value: text } : { ok: false, error: `Conta contábil no formato ${LEDGER_CODE_MASK}.` };
}
