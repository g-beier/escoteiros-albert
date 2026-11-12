import type { SupabaseClient } from "@supabase/supabase-js";

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

const LIST_KEYS = ["visao", "ordem", "de", "ate", "conta", "forma", "pasta", "associado", "rubrica", "q", "ofx"] as const;

/** Query string da lista (só chaves conhecidas), para voltar dos detalhes com os mesmos filtros. */
export function listQuery(params: Record<string, string | string[] | undefined> | URLSearchParams) {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) : [params[key]].flat()[0];
  const allowed = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = get(key)?.trim();
    if (value) allowed.set(key, value);
  }
  return allowed.toString();
}

/** Aceita apenas uma query string de volta para a lista, evitando redirecionamentos externos. */
export function listHref(voltar: string | string[] | undefined) {
  const raw = Array.isArray(voltar) ? voltar[0] : voltar;
  if (!raw) return "/lancamentos";
  const query = listQuery(new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw));
  return query ? `/lancamentos?${query}` : "/lancamentos";
}
