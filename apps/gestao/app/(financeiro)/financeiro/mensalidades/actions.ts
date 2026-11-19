"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import type { PaymentOption } from "@/lib/finance/debts";
import { DataError, type Db } from "@/lib/server/db";
import * as debts from "@/lib/server/finance/debts";
import * as fees from "@/lib/server/finance/fees";
import { financeEditorOrError } from "@/lib/server/session";

export type FeeResult = { error?: string; success?: string };

const year = z.number().int().min(2000).max(2100);
const month = z.number().int().min(3).max(12);

function done(success?: string): FeeResult {
  revalidatePath("/financeiro/mensalidades", "layout");
  revalidatePath("/");
  return { success };
}

/** Escreve como tesouraria/administração; devolve a mensagem de erro (permissão ou banco), ou nada. */
async function write(denied: string, work: (db: Db, groupId: string) => Promise<void>): Promise<string | undefined> {
  const ctx = await financeEditorOrError(denied);
  if ("error" in ctx) return ctx.error;
  try {
    await work(ctx.db, ctx.groupId);
  } catch (error) {
    if (error instanceof DataError) return error.message;
    throw error;
  }
}

const FEES = "Sem permissão para registrar mensalidades.";
const SETTINGS = "Sem permissão para alterar as configurações.";
const MOVEMENTS = "Sem permissão para registrar movimentações.";
const DEBTS = "Sem permissão para anotar dívidas.";

/** Registra a caixinha: pago, atenção, não pago ou isento (com nota e rateios) ou limpa (status nulo). */
export async function setFeeRecord(payload: unknown): Promise<FeeResult> {
  const parsed = z.object({
    associateId: z.uuid(), year, month,
    status: z.enum(["pago", "atencao", "nao_pago", "isento"]).nullable(),
    note: z.string().trim().max(200, "Observação: no máximo 200 caracteres.").optional(),
    splitIds: z.array(z.uuid()).max(50).default([]),
  }).safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const error = await write(FEES, (db) => fees.setRecord(db, { ...parsed.data, note: parsed.data.note || null }));
  return error ? { error } : done();
}

/** Confirma sugestões (pago + vínculo ao rateio) em lote. */
export async function confirmFeeSuggestions(items: unknown): Promise<FeeResult> {
  const parsed = z.array(z.object({
    associateId: z.uuid(), year, month, splitId: z.uuid(),
    status: z.enum(["pago", "atencao"]).default("pago"), note: z.string().max(200).optional(),
  })).min(1).max(5000).safeParse(items);
  if (!parsed.success) return { error: "Nenhuma sugestão para confirmar." };
  let count = 0;
  const error = await write(FEES, async (db) => { count = await fees.confirmSuggestions(db, parsed.data); });
  return error ? { error } : done(`${count} ${count === 1 ? "mensalidade confirmada" : "mensalidades confirmadas"}.`);
}

/** Isenta o associado no ano (motivo) ou remove a isenção (motivo vazio). */
export async function setFeeExemption(associateId: unknown, yearValue: unknown, reason: unknown): Promise<FeeResult> {
  const parsed = z.object({ associateId: z.uuid(), year, reason: z.string().trim().max(120, "Motivo: no máximo 120 caracteres.") })
    .safeParse({ associateId, year: yearValue, reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (parsed.data.reason && parsed.data.reason.length < 2) return { error: "Informe o motivo." };
  const error = await write(FEES, (db) => fees.setExemption(db, parsed.data.associateId, parsed.data.year, parsed.data.reason || null));
  return error ? { error } : done(parsed.data.reason ? "Isenção registrada." : "Isenção removida.");
}

export type FeeSettingsState = { error?: string; success?: string };

/** Configurações › Mensalidades: regra de vencimento e rubrica. */
export async function saveFeeSettings(_previous: FeeSettingsState, formData: FormData): Promise<FeeSettingsState> {
  const parsed = z.object({
    dueRule: z.enum(["dia_fixo", "dia_util", "fim_do_mes"], { message: "Escolha a regra de vencimento." }),
    dueDay: z.coerce.number().int().min(1).max(28).catch(10),
    categoryId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  }).safeParse({ dueRule: formData.get("dueRule"), dueDay: formData.get("dueDay"), categoryId: formData.get("categoryId") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const error = await write(SETTINGS, (db, groupId) => fees.saveSettings(db, groupId, parsed.data));
  if (error) return { error };
  revalidatePath("/financeiro/configuracoes", "layout");
  done();
  return { success: "Configurações de mensalidade salvas." };
}

/** Valor da mensalidade do ano e desconto do pagamento integral até a data-limite. */
export async function saveFeeYearSettings(_previous: FeeSettingsState, formData: FormData): Promise<FeeSettingsState> {
  const parsed = z.object({
    year,
    monthly: z.string().trim().transform((value, ctx) => {
      const cents = parseMoneyToCents(value);
      if (cents === null || cents <= 0) { ctx.addIssue({ code: "custom", message: "Informe o valor da mensalidade (ex.: 60,00)." }); return z.NEVER; }
      return cents;
    }),
    discount: z.string().trim().transform((value) => Number(value.replace(",", "."))).pipe(z.number({ message: "Desconto inválido." }).min(0, "Desconto entre 0 e 100%.").max(100, "Desconto entre 0 e 100%.")),
    deadline: z.union([z.iso.date({ message: "Data-limite inválida." }), z.literal("")]).transform((v) => v || null),
  }).safeParse({ year: Number(formData.get("year")), monthly: formData.get("monthly") ?? "", discount: formData.get("discount") || "0", deadline: formData.get("deadline") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (parsed.data.discount > 0 && !parsed.data.deadline) return { error: "Informe a data-limite do desconto." };
  const { year: settingsYear, monthly, discount, deadline } = parsed.data;
  const error = await write(SETTINGS, (db, groupId) => fees.saveYearSettings(db, groupId, { year: settingsYear, monthlyCents: monthly, discountPct: discount, deadline }));
  if (error) return { error };
  revalidatePath("/financeiro/configuracoes", "layout");
  done();
  return { success: `Valores de ${settingsYear} salvos.` };
}

/** Valor individual da mensalidade do associado no ano (vazio remove e volta ao valor do ano). */
export async function setFeeAssociatePrice(associateId: unknown, yearValue: unknown, monthly: unknown, reason: unknown): Promise<FeeResult> {
  const parsed = z.object({ associateId: z.uuid(), year, monthly: z.string().trim(), reason: z.string().trim().max(120, "Motivo: no máximo 120 caracteres.") })
    .safeParse({ associateId, year: yearValue, monthly, reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const remove = parsed.data.monthly === "";
  const cents = remove ? null : parseMoneyToCents(parsed.data.monthly);
  if (!remove && (cents === null || cents < 0)) return { error: "Informe o valor mensal (ex.: 40,00)." };
  if (!remove && parsed.data.reason.length < 2) return { error: "Informe o motivo (ex.: irmãos)." };
  const error = await write(FEES, (db) => fees.setAssociatePrice(db, parsed.data.associateId, parsed.data.year, cents, remove ? null : parsed.data.reason));
  return error ? { error } : done(remove ? "Valor individual removido." : "Valor individual salvo.");
}

/** Entrada (ou retorno) e saída do associado: definem os meses cobrados na grade. */
export async function addAssociateMovement(associateId: unknown, date: unknown, kind: unknown, reason: unknown): Promise<FeeResult> {
  const parsed = z.object({
    associateId: z.uuid(), date: z.iso.date({ message: "Informe a data." }),
    kind: z.enum(["entrada", "saida"], { message: "Escolha entrada ou saída." }),
    reason: z.string().trim().max(120, "Motivo: no máximo 120 caracteres."),
  }).safeParse({ associateId, date, kind, reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const error = await write(MOVEMENTS, (db) => fees.addMovement(db, parsed.data.associateId, parsed.data.date, parsed.data.kind, parsed.data.reason || null));
  if (error) return { error };
  revalidatePath("/associados", "layout");
  return done(parsed.data.kind === "saida" ? "Saída registrada." : "Entrada registrada.");
}

export async function deleteAssociateMovement(movementId: unknown): Promise<FeeResult> {
  const id = z.uuid().safeParse(movementId);
  if (!id.success) return { error: "Movimentação inválida." };
  const error = await write(MOVEMENTS, (db) => fees.deleteMovement(db, id.data));
  if (error) return { error };
  revalidatePath("/associados", "layout");
  return done("Movimentação removida.");
}

// Devedores ---------------------------------------------------------------------------------

/** Valor de um pagamento ("50,00" → 5000); maior que zero. */
const paymentAmount = z.string().trim().transform((value, ctx) => {
  const cents = parseMoneyToCents(value);
  if (cents === null || cents <= 0) { ctx.addIssue({ code: "custom", message: "Informe o valor de cada pagamento (ex.: 50,00)." }); return z.NEVER; }
  return cents;
});

const debtSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  associateId: z.uuid({ message: "Escolha o associado." }),
  date: z.iso.date({ message: "Informe a data." }),
  amount: z.string().trim().transform((value, ctx) => {
    const cents = parseMoneyToCents(value);
    if (cents === null || cents <= 0) { ctx.addIssue({ code: "custom", message: "Informe o valor (ex.: 50,00)." }); return z.NEVER; }
    return cents;
  }),
  description: z.string().trim().min(2, "Descrição: ao menos 2 caracteres.").max(200, "Descrição: no máximo 200 caracteres."),
  agreement: z.string().trim().max(300, "Acordo: no máximo 300 caracteres."),
  payments: z.array(z.object({ entryId: z.uuid(), amount: paymentAmount })).max(100).default([]),
});

/** Anota (sem `id`) ou edita uma dívida, com acordo e quanto de cada lançamento a pagou. */
export async function saveDebt(payload: unknown): Promise<FeeResult> {
  const parsed = debtSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { id, associateId, date, amount, description, agreement, payments } = parsed.data;
  const error = await write(DEBTS, (db, groupId) => debts.save(db, groupId, {
    id, associateId, date, amountCents: amount, description, agreement: agreement || null,
    payments: payments.map((p) => ({ entryId: p.entryId, amountCents: p.amount })),
  }));
  return error ? { error } : done(id ? "Dívida salva." : "Dívida anotada.");
}

export async function deleteDebt(debtId: unknown): Promise<FeeResult> {
  const id = z.uuid().safeParse(debtId);
  if (!id.success) return { error: "Dívida inválida." };
  const error = await write(DEBTS, (db) => debts.remove(db, id.data));
  return error ? { error } : done("Dívida excluída.");
}

/** Registra um lançamento pagando dívidas do associado: quanto vai para cada uma (0 tira o lançamento da dívida). */
export async function payDebts(payload: unknown): Promise<FeeResult> {
  const parsed = z.object({
    associateId: z.uuid({ message: "Associado inválido." }),
    entryId: z.uuid({ message: "Escolha o lançamento." }),
    allocations: z.array(z.object({
      debtId: z.uuid(),
      amount: z.string().trim().transform((value, ctx) => {
        if (!value) return 0;
        const cents = parseMoneyToCents(value);
        if (cents === null || cents < 0) { ctx.addIssue({ code: "custom", message: "Valor inválido (ex.: 50,00)." }); return z.NEVER; }
        return cents;
      }),
    })).max(200),
  }).safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { associateId, entryId, allocations } = parsed.data;
  const error = await write(DEBTS, (db, groupId) => debts.pay(db, groupId, associateId, entryId, allocations.map((a) => ({ debtId: a.debtId, amountCents: a.amount }))));
  return error ? { error } : done("Pagamento registrado.");
}

/**
 * Lançamentos com rateio de receita do associado (últimos 200 rateios), para vincular como pagamento,
 * com o que cada um já paga de dívidas dele.
 */
export async function debtPaymentOptions(associateId: unknown): Promise<{ error?: string; options?: PaymentOption[] }> {
  const id = z.uuid().safeParse(associateId);
  if (!id.success) return { options: [] };
  let options: PaymentOption[] = [];
  const error = await write(DEBTS, async (db, groupId) => { options = await debts.paymentOptions(db, groupId, id.data); });
  return error ? { error } : { options };
}
