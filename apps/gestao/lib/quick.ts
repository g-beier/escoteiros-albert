import { QUICK_DONE as INVENTORY_DONE, type QuickKind } from "@/lib/inventory/quick";

// Registro rápido comum (/rapido, telas de celular): inventário (045), lançamento financeiro e associado novo (049).
// Tudo o que é registrado aqui entra de verdade e fica para revisar na lista de cada módulo.

export type QuickDone = QuickKind | "lancamento" | "associado";

/** Confirmação na tela do registro rápido depois de gravar (`?feito=<tipo>&id=<registro>`). */
export const QUICK_DONE: Record<QuickDone, string> = {
  ...INVENTORY_DONE,
  lancamento: "Lançamento registrado",
  associado: "Associado cadastrado",
};

export const isQuickDone = (value: string | undefined): value is QuickDone => !!value && value in QUICK_DONE;

/** Onde cada módulo revisa o que veio do registro rápido. */
export const REVIEW_HREF = {
  financeiro: "/financeiro/lancamentos/movimentacoes?revisao=para_revisar&de=tudo",
  inventario: "/inventario/movimentacoes?revisao=para_revisar",
  associados: "/associados?revisao=para_revisar",
} as const;

/** Volta para o registro rápido com a confirmação. */
export const quickDoneHref = (kind: QuickDone, id?: string | null) =>
  `/rapido?feito=${kind}${id && /^[0-9a-f-]{36}$/i.test(id) ? `&id=${id}` : ""}`;
