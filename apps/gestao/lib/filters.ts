export type FolderStatus = "pendente" | "na-pasta";
export type ReconciledStatus = "sim" | "nao";

export type EntryFilters = {
  from?: string;
  to?: string;
  accountIds: string[];
  paymentMethodIds: string[];
  folder?: FolderStatus;
  /** Conciliado com o extrato (`conciliado=sim`) ou não (`conciliado=nao`); ausente = todos. */
  reconciled?: boolean;
  associateIds: string[];
  /** Inclui rateios sem associado ("(Sem associado)" no filtro). */
  withoutAssociate: boolean;
  /** Seleção compacta de rubricas (`id` = rubrica e descendentes, `-id` = fora); ver `decodeCategorySelection`. */
  categoryTokens: string[];
  q?: string;
  /** ID OFX (FITID): o lançamento e os rateios ligados a essa movimentação do banco. */
  ofx?: string;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Valor de `de` que remove o limite inicial (sem ele, a lista começa em 1º de janeiro do ano atual). */
export const ALL_DATES = "tudo";

/** Ano corrente no fuso do grupo. */
export function currentYear(now = new Date()) {
  return Number(now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4));
}

/** Início padrão da lista de lançamentos: 1º de janeiro do ano atual. */
export function defaultFrom(now = new Date()) {
  return `${currentYear(now)}-01-01`;
}

/** Valor especial do filtro de associado para rateios sem vínculo. */
export const NO_ASSOCIATE = "nenhum";
const MAX_VALUES = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

function date(value: string | string[] | undefined) {
  const v = first(value);
  return v && ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : undefined;
}

/** Lista separada por vírgulas (aceita também o parâmetro repetido), sem duplicados. */
export function listValues(value: string | string[] | undefined) {
  const raw = (Array.isArray(value) ? value : [value]).flatMap((v) => (v ?? "").split(","));
  return [...new Set(raw.map((v) => v.trim()).filter(Boolean))].slice(0, MAX_VALUES);
}

const uuids = (value: string | string[] | undefined) => listValues(value).filter((v) => UUID.test(v));

/**
 * Converte a query string em filtros válidos, descartando valores malformados.
 * Sem `de` (ou com `de` inválido), a lista começa em 1º de janeiro do ano atual; `de=tudo` remove o limite.
 */
export function parseFilters(params: RawSearchParams, now = new Date()): EntryFilters {
  const folders = listValues(params.pasta).filter((v): v is FolderStatus => v === "pendente" || v === "na-pasta");
  const reconciled = listValues(params.conciliado).filter((v): v is ReconciledStatus => v === "sim" || v === "nao");
  const associates = listValues(params.associado);
  const q = first(params.q)?.slice(0, 100);
  return {
    from: first(params.de) === ALL_DATES ? undefined : date(params.de) ?? defaultFrom(now),
    to: date(params.ate),
    accountIds: uuids(params.conta),
    paymentMethodIds: uuids(params.forma),
    // as duas opções marcadas equivalem a não filtrar
    folder: folders.length === 1 ? folders[0] : undefined,
    reconciled: reconciled.length === 1 ? reconciled[0] === "sim" : undefined,
    associateIds: associates.filter((v) => UUID.test(v)),
    withoutAssociate: associates.includes(NO_ASSOCIATE),
    categoryTokens: listValues(params.rubrica).filter((v) => UUID.test(v.replace(/^-/, ""))),
    q: q || undefined,
    ofx: ofxId(params.ofx),
  };
}

/** FITID como veio do banco (UUID no Nubank, data + sequência no Itaú); só caracteres seguros. */
function ofxId(value: string | string[] | undefined) {
  const v = first(value);
  return v && v.length <= 200 && /^[\w.:\-/]+$/.test(v) ? v : undefined;
}

/** Escapa curingas do LIKE para que a busca trate o texto literalmente. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function hasAnyFilter(filters: EntryFilters) {
  return Boolean(filters.from || filters.to || filters.folder || filters.reconciled !== undefined || filters.q || filters.ofx || filters.withoutAssociate
    || filters.accountIds.length || filters.paymentMethodIds.length || filters.associateIds.length || filters.categoryTokens.length);
}

export type SortOrder = "desc" | "asc";

/** Ordem por data: mais recentes primeiro, salvo `ordem=antigos`. */
export function parseOrder(params: RawSearchParams): SortOrder {
  return first(params.ordem) === "antigos" ? "asc" : "desc";
}
