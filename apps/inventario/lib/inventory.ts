// Vocabulário do Inventário (apps/inventario/docs/modelo.md): valores do banco → rótulos da interface.

export type InventoryRole = "manager" | "chief" | "viewer";
export type Condition = "novo" | "bom" | "regular" | "ruim" | "manutencao" | "inservivel";
export type Tracking = "unit" | "lot";
export type Origin = "compra" | "doacao" | "fabricacao" | "nao_informada";
export type WriteOffReason = "perda" | "extravio" | "descarte" | "doacao" | "consumo";
export type MovementKind = "entrada" | "transferencia" | "condicao" | "ajuste" | "baixa" | "edicao";
export type ReviewStatus = "pendente" | "revisado" | "para_revisar";

export const ROLE_LABELS: Record<InventoryRole, string> = { manager: "Gestor", chief: "Chefe", viewer: "Consulta" };
export const CONDITION_LABELS: Record<Condition, string> = {
  novo: "Novo", bom: "Bom", regular: "Regular", ruim: "Ruim", manutencao: "Em manutenção", inservivel: "Inservível",
};
export const TRACKING_LABELS: Record<Tracking, string> = { unit: "Por peça", lot: "Por quantidade" };
export const ORIGIN_LABELS: Record<Origin, string> = { compra: "Compra", doacao: "Doação", fabricacao: "Fabricação própria", nao_informada: "Não informada" };
export const WRITE_OFF_LABELS: Record<WriteOffReason, string> = { perda: "Perda", extravio: "Extravio", descarte: "Descarte", doacao: "Doação", consumo: "Consumo" };
export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  entrada: "Entrada", transferencia: "Transferência", condicao: "Condição", ajuste: "Ajuste", baixa: "Baixa", edicao: "Edição",
};
export const REVIEW_LABELS: Record<ReviewStatus, string> = { pendente: "Pendente de revisão", revisado: "Revisado", para_revisar: "Para revisar" };

const options = <T extends string>(labels: Record<T, string>) => (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
export const conditionOptions = options(CONDITION_LABELS);
export const trackingOptions = options(TRACKING_LABELS);
export const originOptions = options(ORIGIN_LABELS);
export const writeOffOptions = options(WRITE_OFF_LABELS);
export const roleOptions = options(ROLE_LABELS);

/** Formato da etiqueta: GEAS-<família, 3 dígitos>-<contagem, 4 dígitos>. */
export const TAG_PATTERN = /^GEAS-\d{3}-\d{4}$/;

/** Nome de uma relação do PostgREST, que pode vir como objeto ou lista. */
export function relatedName(value: unknown): string | undefined {
  const row = Array.isArray(value) ? value[0] : value;
  return (row as { name?: string } | null | undefined)?.name;
}

/** Data (yyyy-mm-dd) no formato brasileiro, sem fuso. */
export function dateBR(value: string | null | undefined) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Data e hora (timestamptz) no fuso de São Paulo, só a data. */
export function timestampBR(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(value));
}

/** Dias até a validade (negativo = vencido), a partir de hoje em São Paulo. */
export function daysUntil(date: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/** Validade que pede atenção: vencida ou vencendo em até 60 dias. */
export const EXPIRY_WARNING_DAYS = 60;
