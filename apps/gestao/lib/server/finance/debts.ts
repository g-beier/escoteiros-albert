import type { Debt, DebtOrigin, DebtPayment, OpenDebt } from "@/lib/finance/debts";
import { saleLotName, type DebtLinesInput } from "@/lib/finance/sales";
import type { Db } from "@/lib/server/db";
import { rows, rpc } from "@/lib/server/pg/db";

// Devedores (Mensalidades › Devedores; 038, 023): leitura por `debt_rows`; pagamentos são rateios ligados à dívida.

type DebtRow = {
  id: string; debt_date: string; amount_cents: number; paid_cents: number; description: string; agreement: string | null;
  associate_id: string | null; associate_name: string | null; debtor_number: number; payments: DebtPayment[] | null;
  category_id: string; category_label: string; origin: DebtOrigin; origin_entry_id: string | null; fee_year: number | null; fee_month: number | null;
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
    payments: row.payments?.map((p) => ({ ...p, amountCents: Number(p.amountCents) })) ?? null,
    categoryId: row.category_id, categoryLabel: row.category_label, origin: row.origin, originEntryId: row.origin_entry_id,
    feeYear: row.fee_year, feeMonth: row.fee_month,
  }));
  // Venda a pagar (022): itens das dívidas (só o Editor lê `entry_sale_items` das dívidas com o associado à vista).
  if (debts.some((debt) => debt.associateId) && !error) {
    const [items, lots] = await Promise.all([
      rows<{ debt_id: string; lot_id: string; quantity: number; unit_price_cents: number }>(db, (sql) => sql`
        select debt_id, lot_id, quantity, unit_price_cents::int as unit_price_cents
        from public.entry_sale_items where group_id = ${groupId} and debt_id is not null order by position`),
      rows<{ id: string; material_name: string; variant: string | null }>(db, (sql) => sql`
        select id, material_name, variant from public.finance_sale_lots(${groupId})`),
    ]);
    const lotName = new Map(lots.map((lot) => [lot.id, saleLotName(lot)]));
    const byDebt = new Map(debts.map((debt) => [debt.id, debt]));
    for (const item of items) {
      const debt = byDebt.get(item.debt_id);
      if (debt) (debt.items ??= []).push({ name: lotName.get(item.lot_id) ?? "Item", quantity: Number(item.quantity), unitPriceCents: Number(item.unit_price_cents) });
    }
  }
  return { debts, error };
}

/** Dívidas em aberto para o rateio do lançamento ("Pagar dívida"); vazio para quem não lança no Financeiro. */
export async function openDebts(db: Db, groupId: string): Promise<OpenDebt[]> {
  const list = await rows<OpenDebt>(db, (sql) => sql`
    select id, associate_id, category_id, description, debt_date, open_cents::int as open_cents from public.open_debts(${groupId})`);
  return list.map((debt) => ({ ...debt, open_cents: Number(debt.open_cents) }));
}

/** Linhas de dívida sem lançamento no caixa (024): cada uma na conta do seu associado; itens vendidos baixam o estoque. */
export async function createLines(db: Db, groupId: string, input: DebtLinesInput): Promise<string[]> {
  return await rpc(db, "create_debt_lines", {
    p_group_id: groupId, p_debt_date: input.date,
    p_lines: input.lines.map((line) => ({
      associate_id: line.associateId, category_id: line.categoryId, description: line.description, amount_cents: line.amountCents,
      items: line.items.map((item) => ({ lot_id: item.lotId, quantity: item.quantity, unit_price_cents: item.unitPriceCents })),
    })) as never,
  }) as string[];
}

/** Conta para "Receber" (Editor): associado e as linhas em aberto (todas, ou só `lineId`), mais antigas primeiro. */
export async function receivable(db: Db, groupId: string, associateId: string, lineId?: string) {
  const lines = await rows<{ id: string; associate_name: string; category_id: string; description: string; debt_date: string; open_cents: number }>(db, (sql) => sql`
    select r.id, r.associate_name, r.category_id, r.description, r.debt_date, (r.amount_cents - r.paid_cents)::int as open_cents
    from public.debt_rows(${groupId}) r
    where r.associate_id = ${associateId} and r.amount_cents > r.paid_cents ${lineId ? sql`and r.id = ${lineId}` : sql``}
    order by r.debt_date, r.id`);
  if (!lines.length) return null;
  return {
    associateId, associateName: lines[0].associate_name,
    lines: lines.map((line) => ({ debtId: line.id, categoryId: line.category_id, description: line.description, date: line.debt_date, openCents: Number(line.open_cents) })),
  };
}

export type DebtLineUpdate = { id: string; date: string; amountCents: number; categoryId: string; description: string };

/** Edita uma linha da conta: data, valor, rubrica e descrição (024). */
export async function updateLine(db: Db, input: DebtLineUpdate) {
  await rpc(db, "update_debt_line", {
    p_id: input.id, p_debt_date: input.date, p_amount_cents: input.amountCents, p_category_id: input.categoryId, p_description: input.description,
  });
}

/** Acordo de pagamento da conta do associado (024). */
export async function setAgreement(db: Db, groupId: string, associateId: string, agreement: string | null) {
  await rpc(db, "set_debt_agreement", { p_group_id: groupId, p_associate_id: associateId, p_agreement: agreement });
}

export async function remove(db: Db, debtId: string) {
  await rpc(db, "delete_debt", { p_id: debtId });
}
