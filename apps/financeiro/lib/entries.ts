import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntryView } from "@/lib/entry-queries";

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

type SplitRow = { category_id: string; amount_cents: number; description: string; associate_id: string | null; created_at: string; id: string };

/** Carrega um lançamento com seus rateios na ordem em que foram gravados (RLS restringe ao grupo). */
export async function fetchEntry(supabase: SupabaseClient, id: string): Promise<EditableEntry | null> {
  const { data } = await supabase.from("ledger_entries")
    .select("id, entry_date, name, payment_method_id, account_id, document, document_filed, notes, total_cents, created_at, updated_at, entry_splits(id, category_id, amount_cents, description, associate_id, created_at)")
    .eq("id", id).maybeSingle();
  if (!data) return null;
  const splits = [...(data.entry_splits as SplitRow[])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return {
    id: data.id,
    date: data.entry_date,
    name: data.name,
    paymentMethodId: data.payment_method_id,
    accountId: data.account_id,
    document: data.document ?? "",
    documentFiled: data.document_filed,
    notes: data.notes ?? "",
    totalCents: data.total_cents,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    splits: splits.map((s) => ({ categoryId: s.category_id, amountCents: s.amount_cents, description: s.description, associateId: s.associate_id })),
  };
}

const LIST_KEYS = ["ordem", "de", "ate", "conta", "forma", "pasta", "conciliado", "associado", "rubrica", "q", "ofx"] as const;

/** Caminho de uma visão da lista (`/lancamentos/movimentacoes` ou `/lancamentos/detalhamento`), com a query dos filtros. */
export function entriesPath(view: EntryView, query = "") {
  return `/lancamentos/${view}${query ? `?${query}` : ""}`;
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

const LIST_PATH = /^\/lancamentos\/(movimentacoes|detalhamento)(?:\?(.*))?$/;

/** Volta para a lista de onde se veio (`voltar` = caminho da visão + filtros); qualquer outra coisa vai para Movimentações. */
export function listHref(voltar: string | string[] | undefined) {
  const raw = Array.isArray(voltar) ? voltar[0] : voltar;
  const match = raw ? LIST_PATH.exec(raw) : null;
  if (!match) return entriesPath("movimentacoes");
  return entriesPath(match[1] as EntryView, listQuery(new URLSearchParams(match[2] ?? "")));
}
