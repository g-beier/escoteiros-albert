import type { EntryView } from "@/lib/finance/entry-rows";

/**
 * Colunas que cada usuário mostra ou oculta nas listas de lançamentos (como Materiais no Inventário). Data, Histórico
 * e Valor são fixas. A escolha fica num cookie por visão, lido pela página no servidor (sem pulo ao carregar); filtro
 * de coluna oculta continua valendo (o chip do filtro aparece na linha de filtros).
 */
export type EntryColumnId = "conta" | "forma" | "documentos" | "ofx" | "associado" | "descricao" | "rubrica";

export const ENTRY_COLUMN_LABELS: Record<EntryColumnId, string> = {
  conta: "Conta",
  forma: "Forma pgto",
  documentos: "Documentos",
  ofx: "ID OFX",
  associado: "Associado",
  descricao: "Descrição",
  rubrica: "Rubrica",
};

/** Colunas ocultáveis de cada visão, na ordem da tabela. */
export const VIEW_COLUMNS: Record<EntryView, readonly EntryColumnId[]> = {
  movimentacoes: ["conta", "forma", "documentos", "ofx"],
  detalhamento: ["conta", "forma", "documentos", "ofx", "associado", "descricao", "rubrica"],
};

export const columnsCookie = (view: EntryView) => `fin_${view}_colunas`;

/** Colunas ocultas guardadas no cookie (ids desconhecidos ou de outra visão são ignorados). */
export function hiddenEntryColumns(view: EntryView, cookie: string | undefined): EntryColumnId[] {
  const allowed = new Set<string>(VIEW_COLUMNS[view]);
  return [
    ...new Set(
      (cookie ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => allowed.has(id)),
    ),
  ] as EntryColumnId[];
}
