export type ItemCondition = "novo" | "bom" | "regular" | "manutencao" | "inservivel";
export type MovementType = "entrada" | "saida" | "transferencia" | "ajuste";

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  novo: "Novo", bom: "Bom", regular: "Regular", manutencao: "Em manutenção", inservivel: "Inservível",
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  entrada: "Entrada", saida: "Saída", transferencia: "Transferência", ajuste: "Ajuste",
};

export const conditionOptions = Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }));

/** Nome de uma relação do PostgREST, que pode vir como objeto ou lista. */
export function relatedName(value: unknown): string | undefined {
  const row = Array.isArray(value) ? value[0] : value;
  return (row as { name?: string } | null | undefined)?.name;
}

export function dateTimeBR(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(value));
}
