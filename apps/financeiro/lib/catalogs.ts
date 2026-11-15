export const CATALOG_KINDS = {
  payment_methods: { title: "Formas de pagamento", singular: "forma de pagamento", maxLength: 60 },
} as const;

export type CatalogKind = keyof typeof CATALOG_KINDS;

export function isCatalogKind(value: unknown): value is CatalogKind {
  return typeof value === "string" && Object.hasOwn(CATALOG_KINDS, value);
}
