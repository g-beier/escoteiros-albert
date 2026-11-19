import type { MaterialRow, StockRow } from "./model";
import { CONDITION_LABELS, daysUntil, type Condition } from "./vocabulary";
import { parseMoneyToCents } from "@/lib/money";

// Lista de Materiais (/inventario/materiais): estado na URL (local, busca, filtros, ordem), volta dos detalhes
// com o mesmo estado (`voltar`), filtros por faixa e ordenação dentro de cada divisão. Colunas escolhidas pelo
// usuário ficam num cookie (não são filtro).

export const MATERIALS_PATH = "/inventario/materiais";

/** Chaves da query da lista, na ordem em que entram na URL. */
export const LIST_KEYS = [
  "divisao", "q", "familia", "alerta", "inativos", "estado", "unitario_de", "unitario_ate", "qtd_de", "qtd_ate", "minimo", "validade", "ordem", "dir",
] as const;
export type ListKey = (typeof LIST_KEYS)[number];

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const read = (params: Params, key: string) => (params instanceof URLSearchParams ? params.get(key) : [params[key]].flat()[0])?.trim() || undefined;

/** Query string da lista: só as chaves conhecidas, sem as vazias. */
export function listQuery(params: Params, omit: ListKey[] = []) {
  const query = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = read(params, key);
    if (value && !omit.includes(key)) query.set(key, value);
  }
  return query.toString();
}

/** Caminho da lista com a query (só chaves conhecidas). */
export function materialsHref(params: Params = {}, omit: ListKey[] = []) {
  const query = listQuery(params, omit);
  return query ? `${MATERIALS_PATH}?${query}` : MATERIALS_PATH;
}

const LIST_PATH = /^\/inventario\/materiais(?:\?(.*))?$/;

/** Volta para a lista de onde se veio (`voltar` = caminho + filtros); qualquer outra coisa vai para a lista sem filtros. */
export function materialsBackHref(voltar: string | string[] | undefined) {
  const raw = Array.isArray(voltar) ? voltar[0] : voltar;
  const match = raw ? LIST_PATH.exec(raw) : null;
  return materialsHref(match ? new URLSearchParams(match[1] ?? "") : {});
}

/** Acrescenta `voltar` a um link de detalhe/edição/cadastro, quando houver para onde voltar. */
export function withBack(href: string, back: string | undefined) {
  if (!back || back === MATERIALS_PATH) return href;
  return `${href}${href.includes("?") ? "&" : "?"}voltar=${encodeURIComponent(back)}`;
}

// Colunas ----------------------------------------------------------------------------------------

/** Colunas da lista além de Material (sempre visível). `anterior1`/`anterior2` = contagens dos dois anos anteriores. */
export const COLUMN_IDS = ["estado", "quantidade", "anterior1", "anterior2", "validade", "unitario", "total"] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];
export type SortKey = "material" | ColumnId;

export const COLUMN_LABELS: Record<Exclude<ColumnId, "anterior1" | "anterior2">, string> = {
  estado: "Estado", quantidade: "Quantidade", validade: "Validade", unitario: "Valor unitário", total: "Valor total",
};

/** Cookie com as colunas ocultas (ids separados por vírgula). */
export const COLUMNS_COOKIE = "inv_materiais_colunas";

export function hiddenColumns(cookie: string | undefined): Set<ColumnId> {
  return new Set((cookie ?? "").split(",").filter((id): id is ColumnId => (COLUMN_IDS as readonly string[]).includes(id)));
}

// Filtros e ordem ---------------------------------------------------------------------------------

export type SortDir = "asc" | "desc";

/** Quantidade frente ao estoque mínimo do material (total de todas as divisões). */
export type MinimumState = "abaixo" | "ok" | "sem";
export const MINIMUM_LABELS: Record<MinimumState, string> = { abaixo: "Abaixo do mínimo", ok: "No mínimo ou acima", sem: "Sem mínimo definido" };

/** Validade na divisão (a mais próxima entre os lotes). */
export type ExpiryState = "vencido" | "valido" | "sem";
export const EXPIRY_LABELS: Record<ExpiryState, string> = { vencido: "Vencidos", valido: "Não vencidos", sem: "Sem validade" };

export type ListFilters = {
  conditions: Condition[];
  minimum: MinimumState[];
  expiry: ExpiryState[];
  unitFrom: number | null; unitTo: number | null;
  qtyFrom: number | null; qtyTo: number | null;
};

export type ListState = ListFilters & { sort: SortKey; dir: SortDir };

const CONDITIONS = Object.keys(CONDITION_LABELS) as Condition[];
const SORT_KEYS: SortKey[] = ["material", ...COLUMN_IDS];

/** Valores separados por vírgula, só os conhecidos. */
const listOf = <T extends string>(raw: string | undefined, allowed: T[]) => (raw ?? "").split(",").filter((value): value is T => (allowed as string[]).includes(value));
const cents = (raw: string | undefined) => (raw ? parseMoneyToCents(raw, { allowNegative: false }) : null);
const integer = (raw: string | undefined) => (raw && /^\d+$/.test(raw) ? Number(raw) : null);

/** Filtros e ordem lidos da URL; valores inválidos são ignorados. Padrão: material, A→Z. */
export function parseListState(params: Params): ListState {
  const sort = read(params, "ordem") as SortKey | undefined;
  const dir = read(params, "dir");
  return {
    conditions: listOf(read(params, "estado"), CONDITIONS),
    minimum: listOf(read(params, "minimo"), Object.keys(MINIMUM_LABELS) as MinimumState[]),
    expiry: listOf(read(params, "validade"), Object.keys(EXPIRY_LABELS) as ExpiryState[]),
    unitFrom: cents(read(params, "unitario_de")), unitTo: cents(read(params, "unitario_ate")),
    qtyFrom: integer(read(params, "qtd_de")), qtyTo: integer(read(params, "qtd_ate")),
    sort: sort && SORT_KEYS.includes(sort) ? sort : "material",
    dir: dir === "desc" ? "desc" : "asc",
  };
}

export function hasFilters(state: ListFilters) {
  return state.conditions.length > 0 || state.minimum.length > 0 || state.expiry.length > 0 || state.unitFrom != null || state.unitTo != null || state.qtyFrom != null || state.qtyTo != null;
}

/** Material numa divisão, como a lista mostra: estoque de lá e as contagens dos dois anos anteriores. */
export type ListLine = Pick<StockRow, "quantity" | "value_cents" | "next_expiry" | "worst_condition" | "conditions" | "min_unit_cents" | "max_unit_cents">
  & { material: Pick<MaterialRow, "name" | "minimum_quantity" | "below_minimum">; previous: [number | null, number | null] };

export function minimumState(line: ListLine): MinimumState {
  return line.material.minimum_quantity == null ? "sem" : line.material.below_minimum ? "abaixo" : "ok";
}

export function expiryState(line: ListLine): ExpiryState {
  return line.next_expiry == null ? "sem" : daysUntil(line.next_expiry) < 0 ? "vencido" : "valido";
}

/** Linha passa nos filtros: algum dos estados escolhidos, faixa de unitário que cruza a pedida, quantidade na faixa. */
export function matchesFilters(line: ListLine, filters: ListFilters) {
  if (filters.conditions.length > 0 && !filters.conditions.some((condition) => (line.conditions[condition] ?? 0) > 0)) return false;
  if (filters.minimum.length > 0 && !filters.minimum.includes(minimumState(line))) return false;
  if (filters.expiry.length > 0 && !filters.expiry.includes(expiryState(line))) return false;
  if (filters.unitFrom != null || filters.unitTo != null) {
    if (line.min_unit_cents == null || line.max_unit_cents == null) return false;
    if (filters.unitFrom != null && Number(line.max_unit_cents) < filters.unitFrom) return false;
    if (filters.unitTo != null && Number(line.min_unit_cents) > filters.unitTo) return false;
  }
  if (filters.qtyFrom != null && line.quantity < filters.qtyFrom) return false;
  if (filters.qtyTo != null && line.quantity > filters.qtyTo) return false;
  return true;
}

/** Ordem das condições, da melhor para a pior (mesma de inventory_condition_rank, 042). */
export const CONDITION_RANK: Record<Condition, number> = { novo: 1, bom: 2, regular: 3, manutencao: 4, ruim: 5, inservivel: 6 };

function sortValue(line: ListLine, key: SortKey): number | string | null {
  switch (key) {
    case "material": return line.material.name;
    case "estado": return line.worst_condition ? CONDITION_RANK[line.worst_condition] : null;
    case "quantidade": return line.quantity;
    case "anterior1": return line.previous[0];
    case "anterior2": return line.previous[1];
    case "validade": return line.next_expiry;
    case "unitario": return line.min_unit_cents == null ? null : (Number(line.min_unit_cents) + Number(line.max_unit_cents ?? line.min_unit_cents)) / 2;
    case "total": return Number(line.value_cents);
  }
}

const byName = (a: ListLine, b: ListLine) => a.material.name.localeCompare(b.material.name, "pt-BR");

/** Compara duas linhas pela coluna; vazios sempre no fim; empate por nome. */
export function compareLines(key: SortKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  return (a: ListLine, b: ListLine) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null || vb == null) return va == null && vb == null ? byName(a, b) : va == null ? 1 : -1;
    const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "pt-BR") : Number(va) - Number(vb);
    return cmp !== 0 ? cmp * sign : byName(a, b);
  };
}

/** Quebra das condições da linha, da pior para a melhor ("2 ruim · 7 bom"). */
export function conditionBreakdown(conditions: ListLine["conditions"]) {
  return (Object.entries(conditions) as [Condition, number][])
    .filter(([, quantity]) => quantity > 0)
    .sort(([a], [b]) => CONDITION_RANK[b] - CONDITION_RANK[a])
    .map(([condition, quantity]) => `${quantity} ${CONDITION_LABELS[condition].toLowerCase()}`)
    .join(" · ");
}
