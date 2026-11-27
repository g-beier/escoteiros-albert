import { InputError } from "@/lib/action";

// Leitura dos campos dos formulários do Associados (usada pelas Server Actions do módulo): texto, id, data e notas,
// com mensagens em português (InputError).

export const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
export const optional = (data: FormData, key: string) => text(data, key) || null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function id(data: FormData, key: string) {
  const value = text(data, key);
  if (!UUID.test(value)) throw new InputError("Registro inválido. Recarregue a página.");
  return value;
}
export const optionalId = (data: FormData, key: string) => (text(data, key) ? id(data, key) : null);
export function date(data: FormData, key: string, label: string, required: true): string;
export function date(data: FormData, key: string, label: string, required?: false): string | null;
export function date(data: FormData, key: string, label: string, required = false) {
  const value = text(data, key);
  if (!value) {
    if (required) throw new InputError(`Informe ${label}.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    throw new InputError(`Data inválida: ${label}.`);
  return value;
}
export function notes(data: FormData, key = "notes", max = 500) {
  const value = optional(data, key);
  if (value && value.length > max) throw new InputError(`Use no máximo ${max} caracteres.`);
  return value;
}
