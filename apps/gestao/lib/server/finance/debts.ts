import { groupPaymentOptions, type Debt, type DebtPayment, type PaymentOption } from "@/lib/finance/debts";
import type { Db } from "@/lib/server/db";
import { rpc, run } from "@/lib/server/pg/db";

// Devedores (Mensalidades › Devedores, 038/039): leitura pela função debt_rows.

type DebtRow = {
  id: string; debt_date: string; amount_cents: number; paid_cents: number; description: string; agreement: string | null;
  associate_id: string | null; associate_name: string | null; debtor_number: number; payments: DebtPayment[] | null;
  payment_mismatch: boolean | null;
};

export async function fetchDebts(db: Db, groupId: string): Promise<{ debts: Debt[]; error?: string }> {
  let data: DebtRow[] = [];
  let error: string | undefined;
  try {
    data = (await rpc(db, "debt_rows", { p_group_id: groupId })) as unknown as DebtRow[];
  } catch (failure) {
    error = (failure as Error).message;
  }
  const debts = data.map((row) => ({
    id: row.id, date: row.debt_date, amountCents: Number(row.amount_cents), paidCents: Number(row.paid_cents),
    description: row.description, agreement: row.agreement, associateId: row.associate_id, associateName: row.associate_name, debtorNumber: Number(row.debtor_number),
    payments: row.payments?.map((p) => ({
      ...p, amountCents: Number(p.amountCents), paidCents: Number(p.paidCents),
      entryAvailableCents: Number(p.entryAvailableCents), entryUnallocatedCents: Number(p.entryUnallocatedCents),
    })) ?? null,
    paymentMismatch: row.payment_mismatch,
  }));
  return { debts, error };
}

export type DebtInput = {
  id: string | null; associateId: string; date: string; amountCents: number; description: string; agreement: string | null;
  payments: { entryId: string; amountCents: number }[];
};

/** Anota (sem `id`) ou edita uma dívida, com acordo e quanto de cada lançamento a pagou. */
export async function save(db: Db, groupId: string, input: DebtInput) {
  await rpc(db, "save_debt", {
    p_group_id: groupId, p_id: input.id, p_associate_id: input.associateId, p_debt_date: input.date, p_amount_cents: input.amountCents,
    p_description: input.description, p_agreement: input.agreement, p_payments: input.payments as never,
  });
}

export async function remove(db: Db, debtId: string) {
  await rpc(db, "delete_debt", { p_id: debtId });
}

/** Um lançamento pagando dívidas do associado: quanto vai para cada uma (0 tira o lançamento da dívida). */
export async function pay(db: Db, groupId: string, associateId: string, entryId: string, allocations: { debtId: string; amountCents: number }[]) {
  await rpc(db, "pay_debts", { p_group_id: groupId, p_associate_id: associateId, p_entry_id: entryId, p_allocations: allocations as never });
}

/** Lançamentos com receita do associado (últimos 200 rateios), com o que cada um já paga de dívidas dele. */
export async function paymentOptions(db: Db, groupId: string, associateId: string): Promise<PaymentOption[]> {
  return run(db, async (sql) => {
    const [splits, allocations] = await Promise.all([
      sql`select entry_id, entry_date, entry_name, amount_cents from public.entry_split_rows
          where group_id = ${groupId} and associate_id = ${associateId} and amount_cents > 0 order by entry_date desc limit 200`,
      sql`select p.entry_id, p.debt_id, p.amount_cents from public.debt_payments p
          join public.debts d on d.id = p.debt_id where d.associate_id = ${associateId}`,
    ]);
    return groupPaymentOptions([...splits] as never, [...allocations] as never);
  });
}
