import { z } from "zod";

const nonZeroCents = z.number().int().safe().refine((value) => value !== 0, {
  message: "O valor não pode ser zero.",
});

/** Observações do lançamento: texto livre opcional (mesmo limite da coluna `notes`). */
export const NOTES_MAX = 2000;

export const entrySchema = z.object({
  date: z.iso.date({ message: "Informe a data." }),
  name: z.string().trim().min(2, "Informe o histórico do lançamento (quem pagou/recebeu, emitente da nota…).").max(200),
  paymentMethodId: z.uuid({ message: "Escolha a forma de pagamento." }),
  accountId: z.uuid({ message: "Escolha a conta." }),
  document: z.string().trim().max(60).optional(),
  documentFiled: z.boolean(),
  notes: z.string().max(NOTES_MAX, `Observações: no máximo ${NOTES_MAX.toLocaleString("pt-BR")} caracteres.`).optional(),
  totalCents: nonZeroCents,
  splits: z.array(z.object({
    categoryId: z.uuid({ message: "Escolha a rubrica." }),
    amountCents: nonZeroCents,
    description: z.string().trim().min(2, "Descreva cada rubrica.").max(200),
    associateId: z.uuid().nullable(),
    /** Dívida que este rateio paga (023): mesma rubrica e associado da dívida. */
    debtId: z.uuid().nullable().optional(),
    /** Só ao criar (023): diferença que fica a pagar e vira dívida do associado do rateio, na mesma rubrica. */
    dueCents: z.number().int().nonnegative().optional(),
    /** Itens vendidos (só em rubrica que vende itens; a soma = valor do rateio + o que ficou a pagar). */
    items: z.array(z.object({
      lotId: z.uuid({ message: "Escolha o item vendido." }),
      quantity: z.number().int().positive("Informe a quantidade de cada item vendido."),
      unitPriceCents: z.number().int().nonnegative("Informe o preço de cada item vendido."),
    })).optional(),
  })).min(1, "Informe ao menos uma rubrica."),
}).refine((value) => value.splits.reduce((sum, split) => sum + split.amountCents, 0) === value.totalCents, {
  message: "A soma das rubricas deve ser igual ao total do lançamento.",
}).refine((value) => value.splits.every((split) => !split.items?.length || split.debtId
  || split.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0) >= split.amountCents), {
  message: "A soma dos itens vendidos não pode ser menor que o valor da rubrica.",
});

export type EntryInput = z.infer<typeof entrySchema>;

export function toRpcSplits(splits: EntryInput["splits"]) {
  return splits.map((s) => ({
    category_id: s.categoryId,
    amount_cents: s.amountCents,
    description: s.description,
    associate_id: s.associateId,
    debt_id: s.debtId ?? null,
    ...(s.dueCents ? { due_cents: s.dueCents } : {}),
    items: (s.items ?? []).map((item) => ({ lot_id: item.lotId, quantity: item.quantity, unit_price_cents: item.unitPriceCents })),
  }));
}
