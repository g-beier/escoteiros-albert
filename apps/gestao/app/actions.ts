"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InputError } from "@/lib/action";
import { entrySchema } from "@/lib/finance/entry-schema";
import type { EntryPage } from "@/lib/finance/entry-rows";
import { parseEntrySort, parseFilters } from "@/lib/finance/filters";
import { DataError } from "@/lib/server/db";
import * as entries from "@/lib/server/finance/entries";
import { financeEditorOrError, memberOrError, type Member } from "@/lib/server/session";

// Lançamentos (formulário, lista e ações em lote). As regras de quem pode o quê ficam nas funções SQL:
// aqui qualquer membro chama, e o banco recusa quem não é tesouraria/administração.

type Result = { error?: string; success?: boolean; id?: string };

/** Executa com o membro da sessão; `InputError`/`DataError` viram `{ error }`. */
async function withMember<T extends object>(guard: () => Promise<Member | { error: string }>, work: (member: Member) => Promise<T>): Promise<T | { error: string }> {
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
  const ids = z.array(z.uuid()).min(1, "Selecione ao menos um lançamento.").max(500, "Selecione no máximo 500 lançamentos por vez.").safeParse(entryIds);
  const account = z.uuid().safeParse(accountId);
  if (!ids.success) return { error: ids.error.issues[0]?.message ?? "Seleção inválida." };
  if (!account.success) return { error: "Escolha a conta." };
  return withMember(() => financeEditorOrError("Sem permissão para mudar a conta dos lançamentos."), async ({ db }) => {
    const result = await entries.moveToAccount(db, ids.data, account.data);
    revalidatePath("/", "layout");
    return { moved: result.moved, unchanged: result.unchanged, unlinked: result.unlinked };
  });
}

/** Próxima página da rolagem infinita; os filtros chegam como a query string da lista. */
export async function loadEntryPage(viewInput: unknown, query: unknown, offset: unknown): Promise<EntryPage> {
  const params = Object.fromEntries(new URLSearchParams(typeof query === "string" ? query : ""));
  const view = viewInput === "detalhamento" ? "detalhamento" : "movimentacoes";
  const start = z.number().int().min(0).max(1_000_000).safeParse(offset);
  if (!start.success) return { view, rows: [], total: null, error: "Página inválida." };
  const ctx = await memberOrError();
  if ("error" in ctx) return { view, rows: [], total: null, error: ctx.error };
  return entries.fetchEntryPage(ctx.db, ctx.groupId, view, parseFilters(params), parseEntrySort(params), start.data, false);
}
