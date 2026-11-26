import { groupPaymentOptions, type Debt, type DebtPayment, type PaymentOption } from "@/lib/finance/debts";
import { toRpcSplits, type EntryInput } from "@/lib/finance/entry-schema";
import { saleLotName, type SaleDebtInput } from "@/lib/finance/sales";
import type { Db } from "@/lib/server/db";
import { one, rows, rpc, run } from "@/lib/server/pg/db";

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
  const debts = data.map((row): Debt => ({
    id: row.id, date: row.debt_date, amountCents: Number(row.amount_cents), paidCents: Number(row.paid_cents),
    description: row.description, agreement: row.agreement, associateId: row.associate_id, associateName: row.associate_name, debtorNumber: Number(row.debtor_number),
    payments: row.payments?.map((p) => ({
      ...p, amountCents: Number(p.amountCents), paidCents: Number(p.paidCents),
      entryAvailableCents: Number(p.entryAvailableCents), entryUnallocatedCents: Number(p.entryUnallocatedCents),
    })) ?? null,
    paymentMismatch: row.payment_mismatch,
  }));
  // Venda a pagar (022): rubrica e itens das dívidas (só o Editor lê `debts`; a consulta fica sem).
  if (debts.some((debt) => debt.associateId) && !error) {
    const [sale, lots] = await Promise.all([
      rows<{ id: string; category_id: string | null; lot_id: string | null; quantity: number | null; unit_price_cents: number | null }>(db, (sql) => sql`
        select d.id, d.category_id, i.lot_id, i.quantity, i.unit_price_cents::int as unit_price_cents
        from public.debts d left join public.entry_sale_items i on i.debt_id = d.id
        where d.group_id = ${groupId} order by i.position`),
      rows<{ id: string; material_name: string; variant: string | null }>(db, (sql) => sql`
        select id, material_name, variant from public.finance_sale_lots(${groupId})`),
    ]);
    const lotName = new Map(lots.map((lot) => [lot.id, saleLotName(lot)]));
    const byDebt = new Map(debts.map((debt) => [debt.id, debt]));
    for (const row of sale) {
      const debt = byDebt.get(row.id);
      if (!debt) continue;
      debt.categoryId = row.category_id;
      if (row.lot_id) (debt.items ??= []).push({ name: lotName.get(row.lot_id) ?? "Item", quantity: Number(row.quantity), unitPriceCents: Number(row.unit_price_cents) });
    }
  }
  return { debts, error };
}

/** Venda a pagar depois (022): dívida do associado com os itens; o estoque baixa na hora. */
export async function createSale(db: Db, groupId: string, input: SaleDebtInput): Promise<string> {
  return await rpc(db, "create_sale_debt", {
    p_group_id: groupId, p_associate_id: input.associateId, p_debt_date: input.date, p_category_id: input.categoryId,
    p_description: input.description, p_agreement: input.agreement,
    p_items: input.items.map((item) => ({ lot_id: item.lotId, quantity: item.quantity, unit_price_cents: item.unitPriceCents })) as never,
  }) as string;
}

/** "Receber" (022): cria o lançamento e quita com ele o que falta da dívida. */
export async function receive(db: Db, debtId: string, input: EntryInput): Promise<string> {
  return await rpc(db, "receive_debt", {
    p_debt_id: debtId, p_entry_date: input.date, p_name: input.name, p_payment_method_id: input.paymentMethodId, p_account_id: input.accountId,
    p_document: input.document || null, p_document_filed: input.documentFiled, p_total_cents: input.totalCents,
    p_splits: toRpcSplits(input.splits) as never, p_notes: input.notes?.trim() || null,
  }) as string;
}

/** Dívida para "Receber": associado, rubrica da venda, descrição e quanto falta (Editor; null se não achar). */
export async function receivable(db: Db, groupId: string, debtId: string) {
  const debt = await one<{ id: string; associate_id: string; associate_name: string; category_id: string | null; description: string; open_cents: number }>(db, (sql) => sql`
    select d.id, d.associate_id, a.name as associate_name, d.category_id, d.description,
      (r.amount_cents - r.paid_cents)::int as open_cents
    from public.debts d join public.associates a on a.id = d.associate_id
    join public.debt_rows(${groupId}) r on r.id = d.id
    where d.id = ${debtId} and d.group_id = ${groupId}`);
  return debt;
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
