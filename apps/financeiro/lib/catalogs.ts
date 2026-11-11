export const CATALOG_KINDS = {
  categories: { table: "categories", title: "Rubricas", singular: "rubrica", maxLength: 100 },
  payment_methods: { table: "payment_methods", title: "Formas de pagamento", singular: "forma de pagamento", maxLength: 60 },
} as const;

export type CatalogKind = keyof typeof CATALOG_KINDS;

export function isCatalogKind(value: unknown): value is CatalogKind {
  return typeof value === "string" && Object.hasOwn(CATALOG_KINDS, value);
}

/** Mensagem amigável para erros do PostgREST ao gravar cadastros. */
export function catalogErrorMessage(error: { code?: string; message: string }, singular: string) {
  if (error.code === "23505") return `Já existe uma ${singular} com esse nome.`;
  if (error.code === "42501") return "Sem permissão para alterar cadastros.";
  return error.message;
}
