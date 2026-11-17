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

/** Formato da etiqueta: GEAS-<categoria, 3 dígitos>-<contagem, 4 dígitos>. */
export const TAG_PATTERN = /^GEAS-\d{3}-\d{4}$/;

/** Categorias padrão do inventário (nome + código de etiqueta sequencial). */
export const DEFAULT_CATEGORIES = [
  { name: "Acampamento", code: "001" },
  { name: "Cozinha", code: "002" },
  { name: "Primeiros Socorros", code: "003" },
  { name: "Ferramentas", code: "004" },
  { name: "Cordas", code: "005" },
  { name: "Iluminação", code: "006" },
  { name: "Consumíveis", code: "007" },
  { name: "Uniforme e distintivos", code: "008" },
  { name: "Escritório", code: "009" },
  { name: "Limpeza", code: "010" },
  { name: "Esporte e jogos", code: "011" },
] as const;

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

/** Situação do material na Home: pior critério vence (Ruim > Médio > Bom). */
export type MaterialStatus = "bom" | "medio" | "ruim";

export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  bom: "Bom",
  medio: "Médio",
  ruim: "Ruim",
};

/** Ruim: validade vencida ou zerado com mínimo. Médio: abaixo do mínimo ou a vencer. Bom: o resto. */
export function materialStatus(row: {
  quantity: number;
  minimum_quantity: number | null;
  next_expiry: string | null;
  below_minimum?: boolean;
}): MaterialStatus {
  const below = row.below_minimum ?? (row.minimum_quantity != null && row.quantity < row.minimum_quantity);
  const days = row.next_expiry ? daysUntil(row.next_expiry) : null;
  if ((days != null && days < 0) || (row.minimum_quantity != null && row.quantity === 0)) return "ruim";
  if (below || (days != null && days <= EXPIRY_WARNING_DAYS)) return "medio";
  return "bom";
}

/** Dono do material na Home: ramo / diretoria, pela divisão principal (raiz do caminho). */
export type MaterialOwner = "diretoria" | "escoteiro" | "senior" | "pioneiro" | "lobinho";

export const MATERIAL_OWNER_LABELS: Record<MaterialOwner, string> = {
  diretoria: "Diretoria",
  escoteiro: "Escoteiro",
  senior: "Senior",
  pioneiro: "Pioneiro",
  lobinho: "Lobinho",
};

/** Cores da bolinha do dono (ramos + diretoria). */
export const MATERIAL_OWNER_DOT: Record<MaterialOwner, string> = {
  diretoria: "bg-[#2563eb]",
  escoteiro: "bg-[#14532d]",
  senior: "bg-[#7a1f3d]",
  pioneiro: "bg-[#dc2626]",
  lobinho: "bg-[#eab308]",
};

/** Infere o dono pela raiz do caminho da divisão (ex.: "Alcateia › Patrulha Lobo"). */
export function ownerFromLocationPath(path: string | null | undefined): MaterialOwner | null {
  if (!path || path === "—") return null;
  const root = path.split(" › ")[0]?.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase() ?? "";
  if (root.includes("diretor") || root.includes("cozinha") || root.includes("almox")) return "diretoria";
  if (root.includes("alcat") || root.includes("lobinh")) return "lobinho";
  if (root.includes("senior") || root.includes("guia")) return "senior";
  if (root.includes("pion") || root.includes("cla")) return "pioneiro";
  if (root.includes("escoteir")) return "escoteiro";
  return null;
}
