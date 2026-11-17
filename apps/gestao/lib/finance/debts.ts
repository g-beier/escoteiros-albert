
/**
 * Devedores (Mensalidades › Devedores, migrations 038 e 039): dívidas de associados com acordo e pagamentos.
 * Cada pagamento é uma alocação: quanto de um lançamento (rateios de receita do associado nele) vai para a dívida;
 * um lançamento pode pagar várias dívidas do associado até a receita dele no lançamento.
 * Lidas por `debt_rows`, que entrega `associate*`, `payments` e `paymentMismatch` nulos para a consulta.
 */

export type DebtPayment = {
  entryId: string; entryDate: string; entryName: string;
  /** Alocado a esta dívida. */
  amountCents: number;
  /** O que vale do alocado (menor se o lançamento foi editado e não comporta mais). */
  paidCents: number;
  /** Receita do associado no lançamento. */
  entryAvailableCents: number;
  /** Receita do associado no lançamento ainda não usada em dívidas (negativa = alocado demais). */
  entryUnallocatedCents: number;
};

export type Debt = {
  id: string;
  date: string;
  amountCents: number;
  paidCents: number;
  description: string;
  agreement: string | null;
  /** Nulos para a consulta. */
  associateId: string | null;
  associateName: string | null;
  /** Agrupa as dívidas do mesmo associado sem dizer quem é (consulta vê "Devedor N"). */
  debtorNumber: number;
  payments: DebtPayment[] | null;
  /** Algum lançamento não comporta mais o alocado (lançamento editado): a tesouraria precisa corrigir. */
  paymentMismatch: boolean | null;
};

export type DebtStatus = "aberta" | "parcial" | "quitada";

export const DEBT_STATUS_LABELS: Record<DebtStatus, string> = { aberta: "Em aberto", parcial: "Parcial", quitada: "Quitada" };

export function debtStatus(debt: Pick<Debt, "amountCents" | "paidCents">): DebtStatus {
  if (debt.paidCents >= debt.amountCents) return "quitada";
  return debt.paidCents > 0 ? "parcial" : "aberta";
}

/** Quanto falta pagar (nunca negativo). */
export const debtOpenCents = (debt: Pick<Debt, "amountCents" | "paidCents">) => Math.max(debt.amountCents - debt.paidCents, 0);

export function debtTotals(debts: Debt[]) {
  const open = debts.filter((debt) => debtStatus(debt) !== "quitada");
  return {
    openCount: open.length,
    openCents: open.reduce((sum, debt) => sum + debtOpenCents(debt), 0),
    paidCents: debts.reduce((sum, debt) => sum + Math.min(debt.paidCents, debt.amountCents), 0),
  };
}

export type DebtorGroup = {
  key: string;
  /** Nome do associado, ou "Devedor N" para a consulta. */
  label: string;
  associateId: string | null;
  debts: Debt[];
  amountCents: number;
  paidCents: number;
  openCents: number;
  openCount: number;
  /** Receita dos lançamentos vinculados ainda não usada em dívidas (só tesouraria). */
  creditCents: number;
};

/**
 * Dívidas agrupadas por devedor: quem deve mais primeiro (o que precisa ser pago), depois os quitados;
 * empates pelo nome (ou número). Dentro do grupo, mais recentes primeiro (ordem de `debt_rows`).
 */
export function groupDebts(debts: Debt[]): DebtorGroup[] {
  const groups = new Map<string, DebtorGroup>();
  for (const debt of debts) {
    const key = debt.associateId ?? `devedor-${debt.debtorNumber}`;
    const group = groups.get(key) ?? { key, label: debt.associateName ?? `Devedor ${debt.debtorNumber}`, associateId: debt.associateId, debts: [], amountCents: 0, paidCents: 0, openCents: 0, openCount: 0, creditCents: 0 };
    group.debts.push(debt);
    group.amountCents += debt.amountCents;
    group.paidCents += debt.paidCents;
    group.openCents += debtOpenCents(debt);
    if (debtStatus(debt) !== "quitada") group.openCount++;
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const unallocated = new Map<string, number>();
    for (const payment of group.debts.flatMap((debt) => debt.payments ?? [])) unallocated.set(payment.entryId, payment.entryUnallocatedCents);
    group.creditCents = [...unallocated.values()].reduce((sum, cents) => sum + Math.max(cents, 0), 0);
  }
  const number = (group: DebtorGroup) => group.debts[0].debtorNumber;
  return [...groups.values()].sort((a, b) => b.openCents - a.openCents
    || (a.associateId && b.associateId ? a.label.localeCompare(b.label, "pt-BR") : number(a) - number(b)));
}


/** Lançamento que pode pagar dívidas do associado, com o que já está alocado a cada dívida dele. */
export type PaymentOption = {
  entryId: string; entryDate: string; entryName: string;
  /** Receita do associado no lançamento. */
  availableCents: number;
  allocations: { debtId: string; amountCents: number }[];
};

/** Quanto do lançamento ainda pode ir para dívidas (fora o que já está em `exceptDebtId`). */
export function optionFreeCents(option: PaymentOption, exceptDebtId?: string) {
  return option.availableCents - option.allocations.filter((a) => a.debtId !== exceptDebtId).reduce((sum, a) => sum + a.amountCents, 0);
}

/**
 * Lançamentos com rateio de receita do associado (candidatos a pagamento), mais recentes primeiro,
 * com as alocações já gravadas em dívidas dele.
 */
export function groupPaymentOptions(
  splits: { entry_id: string; entry_date: string; entry_name: string; amount_cents: number }[],
  allocations: { entry_id: string; debt_id: string; amount_cents: number }[] = [],
): PaymentOption[] {
  const byEntry = new Map<string, PaymentOption>();
  for (const split of splits) {
    const current = byEntry.get(split.entry_id);
    if (current) current.availableCents += Number(split.amount_cents);
    else byEntry.set(split.entry_id, { entryId: split.entry_id, entryDate: split.entry_date, entryName: split.entry_name, availableCents: Number(split.amount_cents), allocations: [] });
  }
  for (const allocation of allocations) {
    byEntry.get(allocation.entry_id)?.allocations.push({ debtId: allocation.debt_id, amountCents: Number(allocation.amount_cents) });
  }
  return [...byEntry.values()].sort((a, b) => b.entryDate.localeCompare(a.entryDate) || a.entryId.localeCompare(b.entryId));
}

/**
 * Reparte `availableCents` entre as dívidas, na ordem dada (mais antiga primeiro), até o que falta em cada uma.
 * Devolve só as dívidas que recebem algo.
 */
export function distributePayment(availableCents: number, debts: { id: string; owedCents: number }[]) {
  let left = Math.max(availableCents, 0);
  const result: { debtId: string; amountCents: number }[] = [];
  for (const debt of debts) {
    const give = Math.min(Math.max(debt.owedCents, 0), left);
    if (give > 0) result.push({ debtId: debt.id, amountCents: give });
    left -= give;
  }
  return result;
}

/** Dívidas da mais antiga para a mais nova (ordem de pagamento). */
export const oldestFirst = <T extends Pick<Debt, "date" | "id">>(debts: T[]) =>
  [...debts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
