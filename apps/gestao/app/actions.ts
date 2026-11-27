"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InputError } from "@/lib/action";
import { entrySchema } from "@/lib/finance/entry-schema";
import type { EntryPage } from "@/lib/finance/entry-rows";
import { parseEntrySort, parseFilters } from "@/lib/finance/filters";
import { DataError } from "@/lib/server/db";
import * as entries from "@/lib/server/finance/entries";
import * as debts from "@/lib/server/finance/debts";
import { financeAdminOrError, financeEditorOrError, memberOrError, type Member } from "@/lib/server/session";

// Lançamentos (formulário, lista e ações em lote). As regras de quem pode o quê ficam nas funções SQL:
// aqui qualquer membro chama; o banco recusa quem não é Colaborador ou mais (Editor para conta e revisão).

type Result = { error?: string; success?: boolean; id?: string };

/** Executa com o membro da sessão; `InputError`/`DataError` viram `{ error }`. */
async function withMember<T extends object>(
  guard: () => Promise<Member | { error: string }>,
  work: (member: Member) => Promise<T>,
): Promise<T | { error: string }> {
  const member = await guard();
  if ("error" in member) return member;
  try {
    return await work(member);
  } catch (error) {
    if (error instanceof InputError || error instanceof DataError) return { error: error.message };
    throw error;
  }
}

function readEntry(payload: unknown) {
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) throw new InputError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  return parsed.data;
}

function readId(value: unknown, message = "Lançamento inválido.") {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new InputError(message);
  return parsed.data;
}

export async function createEntry(payload: unknown): Promise<Result> {
  return withMember(memberOrError, async ({ db, groupId }) => {
    const id = await entries.create(db, groupId, readEntry(payload));
    revalidatePath("/", "layout");
    return { success: true, id };
  });
}

const debtLinesSchema = z.object({
  date: z.iso.date({ message: "Informe a data." }),
  lines: z
    .array(
      z.object({
        associateId: z.uuid({ message: "Escolha o associado de cada linha de dívida." }),
        categoryId: z.uuid({ message: "Escolha a rubrica de cada linha de dívida." }),
        description: z.string().trim().min(2, "Descreva cada linha de dívida.").max(200),
        amountCents: z.number().int().positive().nullable(),
        items: z
          .array(
            z.object({
              lotId: z.uuid(),
              quantity: z.number().int().positive(),
              unitPriceCents: z.number().int().nonnegative(),
            }),
          )
          .default([]),
      }),
    )
    .min(1, "Informe ao menos uma linha de dívida."),
});

/**
 * Dívidas sem lançamento no caixa (024): "Nova dívida" em Devedores e lançamento sem valor recebido. Cada linha vai para
 * a conta do seu associado; itens vendidos baixam o estoque na hora.
 */
export async function createDebtLines(payload: unknown): Promise<Result> {
  return withMember(memberOrError, async ({ db, groupId }) => {
    const parsed = debtLinesSchema.safeParse(payload);
    if (!parsed.success) throw new InputError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    await debts.createLines(db, groupId, parsed.data);
    revalidatePath("/", "layout");
    return { success: true };
  });
}

export async function updateEntry(entryId: unknown, payload: unknown): Promise<Result> {
  return withMember(memberOrError, async ({ db }) => {
    const id = readId(entryId);
    await entries.update(db, id, readEntry(payload));
    revalidatePath("/", "layout");
    revalidatePath(`/financeiro/lancamentos/${id}`);
    return { success: true };
  });
}

export async function deleteEntry(entryId: unknown): Promise<Result> {
  return withMember(memberOrError, async ({ db }) => {
    await entries.remove(db, readId(entryId));
    revalidatePath("/", "layout");
    return { success: true };
  });
}

export async function setDocumentFiled(entryId: unknown, filed: unknown): Promise<Result> {
  return withMember(memberOrError, async ({ db }) => {
    const value = z.boolean().safeParse(filed);
    if (!value.success) throw new InputError("Dados inválidos.");
    await entries.setDocumentFiled(db, readId(entryId, "Dados inválidos."), value.data);
    revalidatePath("/", "layout");
    return { success: true };
  });
}

export type MoveResult = { error?: string; moved?: number; unchanged?: number; unlinked?: number };

/** Move vários lançamentos para outra conta (ex.: os que ficaram em "A definir"); conciliados perdem o vínculo. */
export async function moveEntriesAccount(entryIds: unknown, accountId: unknown): Promise<MoveResult> {
  const ids = z
    .array(z.uuid())
    .min(1, "Selecione ao menos um lançamento.")
    .max(500, "Selecione no máximo 500 lançamentos por vez.")
    .safeParse(entryIds);
  const account = z.uuid().safeParse(accountId);
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  if (!account.success) return { error: "Escolha a conta." };
  return withMember(
    () => financeAdminOrError(),
    async ({ db }) => {
      const result = await entries.moveToAccount(db, ids.data, account.data);
      revalidatePath("/", "layout");
      return { moved: result.moved, unchanged: result.unchanged, unlinked: result.unlinked };
    },
  );
}

/** Marca lançamentos do registro rápido como revisados (049); os já revisados ficam como estão. */
export async function reviewEntries(entryIds: unknown): Promise<{ error?: string; reviewed?: number }> {
  const ids = z
    .array(z.uuid())
    .min(1, "Selecione ao menos um lançamento.")
    .max(500, "Selecione no máximo 500 lançamentos por vez.")
    .safeParse(entryIds);
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  return withMember(
    () => financeEditorOrError("Sem permissão para revisar lançamentos."),
    async ({ db, groupId }) => {
      const reviewed = await entries.review(db, groupId, ids.data);
      revalidatePath("/", "layout");
      return { reviewed };
    },
  );
}

const bulkIds = (input: unknown, what: string) =>
  z
    .array(z.uuid())
    .min(1, `Selecione ao menos um ${what}.`)
    .max(500, `Selecione no máximo 500 de cada vez.`)
    .safeParse(input);
type BulkResult = { error?: string; changed?: number };

/** Lote: documentos arquivados na pasta ou pendentes. */
export async function setEntriesFiled(entryIds: unknown, filed: unknown): Promise<BulkResult> {
  const ids = bulkIds(entryIds, "lançamento");
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  if (typeof filed !== "boolean") return { error: "Escolha arquivado ou pendente." };
  return withMember(
    () => financeAdminOrError(),
    async ({ db, groupId }) => {
      const changed = await entries.setDocumentsFiled(db, groupId, ids.data, filed);
      revalidatePath("/", "layout");
      return { changed };
    },
  );
}

/** Lote: forma de pagamento. */
export async function setEntriesPaymentMethod(entryIds: unknown, paymentMethodId: unknown): Promise<BulkResult> {
  const ids = bulkIds(entryIds, "lançamento");
  const method = z.uuid().safeParse(paymentMethodId);
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  if (!method.success) return { error: "Escolha a forma de pagamento." };
  return withMember(
    () => financeAdminOrError(),
    async ({ db, groupId }) => {
      const changed = await entries.setPaymentMethod(db, groupId, ids.data, method.data);
      revalidatePath("/", "layout");
      return { changed };
    },
  );
}

/** Lote (Detalhamento): rubrica dos rateios. */
export async function setSplitsCategory(splitIds: unknown, categoryId: unknown): Promise<BulkResult> {
  const ids = bulkIds(splitIds, "rateio");
  const category = z.uuid().safeParse(categoryId);
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  if (!category.success) return { error: "Escolha a rubrica." };
  return withMember(
    () => financeAdminOrError(),
    async ({ db, groupId }) => {
      const changed = await entries.setSplitsCategory(db, groupId, ids.data, category.data);
      revalidatePath("/", "layout");
      return { changed };
    },
  );
}

/** Lote (Detalhamento): associado dos rateios; vazio tira. */
export async function setSplitsAssociate(splitIds: unknown, associateId: unknown): Promise<BulkResult> {
  const ids = bulkIds(splitIds, "rateio");
  const associate = z.union([z.uuid(), z.literal("")]).safeParse(associateId);
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  if (!associate.success) return { error: "Associado inválido." };
  return withMember(
    () => financeAdminOrError(),
    async ({ db, groupId }) => {
      const changed = await entries.setSplitsAssociate(db, groupId, ids.data, associate.data || null);
      revalidatePath("/", "layout");
      return { changed };
    },
  );
}

/** Detalhamento: agrupa os lançamentos dos rateios marcados num só, com os dados preenchidos na tela. */
const mergeSchema = z.object({
  date: z.iso.date("Informe a data."),
  name: z
    .string()
    .trim()
    .min(2, "Informe o histórico (2 a 200 caracteres).")
    .max(200, "Histórico: no máximo 200 caracteres."),
  accountId: z.uuid("Escolha a conta."),
  paymentMethodId: z.uuid("Escolha a forma de pagamento."),
  document: z.string().trim().max(60, "Documento: no máximo 60 caracteres."),
  filed: z.boolean(),
  notes: z.string().trim().max(2000, "Observações: no máximo 2.000 caracteres."),
});
export type MergeData = z.infer<typeof mergeSchema>;

export async function mergeSplitEntries(
  splitIds: unknown,
  data: unknown,
): Promise<{ error?: string; entryId?: string }> {
  const ids = bulkIds(splitIds, "rateio");
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  const entry = mergeSchema.safeParse(data);
  if (!entry.success) return { error: entry.error.issues[0]?.message ?? "Dados do lançamento inválidos." };
  return withMember(
    () => financeAdminOrError(),
    async ({ db, groupId }) => {
      const entryId = await entries.mergeEntries(db, groupId, ids.data, entry.data);
      revalidatePath("/", "layout");
      return { entryId };
    },
  );
}

/** Detalhamento: cada rateio marcado vira um lançamento próprio. */
export async function splitSplitEntries(splitIds: unknown): Promise<BulkResult> {
  const ids = bulkIds(splitIds, "rateio");
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  return withMember(
    () => financeAdminOrError(),
    async ({ db, groupId }) => {
      const changed = await entries.splitEntries(db, groupId, ids.data);
      revalidatePath("/", "layout");
      return { changed };
    },
  );
}

/** Próxima página da rolagem infinita; os filtros chegam como a query string da lista. */
export async function loadEntryPage(viewInput: unknown, query: unknown, offset: unknown): Promise<EntryPage> {
  const params = Object.fromEntries(new URLSearchParams(typeof query === "string" ? query : ""));
  const view = viewInput === "detalhamento" ? "detalhamento" : "movimentacoes";
  const start = z.number().int().min(0).max(1_000_000).safeParse(offset);
  if (!start.success) return { view, rows: [], total: null, error: "Página inválida." };
  const ctx = await memberOrError();
  if ("error" in ctx) return { view, rows: [], total: null, error: ctx.error };
  return entries.fetchEntryPage(
    ctx.db,
    ctx.groupId,
    view,
    parseFilters(params),
    parseEntrySort(params),
    start.data,
    false,
  );
}
