import type { EntryView } from "@/lib/finance/entry-rows";

export type EditableEntry = {
  id: string;
  date: string;
  name: string;
  paymentMethodId: string;
  accountId: string;
  document: string;
  documentFiled: boolean;
  notes: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  splits: { categoryId: string; amountCents: number; description: string; associateId: string | null }[];
};


const LIST_KEYS = ["ordem", "de", "ate", "conta", "forma", "pasta", "conciliado", "associado", "rubrica", "q", "ofx"] as const;

/** Caminho de uma visão da lista (`/financeiro/lancamentos/movimentacoes` ou `/financeiro/lancamentos/detalhamento`), com a query dos filtros. */
export function entriesPath(view: EntryView, query = "") {
  return `/financeiro/lancamentos/${view}${query ? `?${query}` : ""}`;
}

/** Query string da lista (só chaves conhecidas): os filtros, que seguem de uma visão para a outra e voltam dos detalhes. */
export function listQuery(params: Record<string, string | string[] | undefined> | URLSearchParams) {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) : [params[key]].flat()[0];
  const allowed = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = get(key)?.trim();
    if (value) allowed.set(key, value);
  }
  return allowed.toString();
}

const LIST_PATH = /^\/financeiro\/lancamentos\/(movimentacoes|detalhamento)(?:\?(.*))?$/;

/** Volta para a lista de onde se veio (`voltar` = caminho da visão + filtros); qualquer outra coisa vai para Movimentações. */
export function listHref(voltar: string | string[] | undefined) {
  const raw = Array.isArray(voltar) ? voltar[0] : voltar;
  const match = raw ? LIST_PATH.exec(raw) : null;
  if (!match) return entriesPath("movimentacoes");
  return entriesPath(match[1] as EntryView, listQuery(new URLSearchParams(match[2] ?? "")));
}
