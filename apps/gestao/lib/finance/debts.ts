/**
 * Devedores (Mensalidades › Devedores; 038, 023): dívida é uma conta a receber do associado numa rubrica de receita
 * (mensalidade, lojinha, atividades…). Só é paga por rateios ligados a ela (`entry_splits.debt_id`), na rubrica e no
 * associado dela. Nasce à mão, da diferença de um lançamento, de uma venda a pagar ou do "Não pago" da mensalidade.
 * Lidas por `debt_rows`, que entrega associado, pagamentos e lançamento de origem nulos para a consulta.
 */

export type DebtOrigin = "manual" | "lancamento" | "venda" | "mensalidade";

export const DEBT_ORIGIN_LABELS: Record<DebtOrigin, string> = {
  manual: "Anotada", lancamento: "Diferença de lançamento", venda: "Venda a pagar", mensalidade: "Mensalidade",
};

/** Rateio que pagou (parte de) a dívida. */
export type DebtPayment = { entryId: string; entryDate: string; entryName: string; splitId: string; amountCents: number };

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
  categoryId: string;
  /** "1.3 Lojinha". */
  categoryLabel: string;
  origin: DebtOrigin;
  /** Lançamento cuja diferença gerou a dívida (nulo para a consulta). */
  originEntryId: string | null;
  /** Mês da mensalidade ("Não pago"). */
  feeYear: number | null;
  feeMonth: number | null;
  /** Venda (022): itens vendidos. */
  items?: { name: string; quantity: number; unitPriceCents: number }[];
};

/** Dívida em aberto oferecida no rateio do lançamento ("Pagar dívida"), para quem lança no Financeiro. */
export type OpenDebt = { id: string; associate_id: string; category_id: string; description: string; debt_date: string; open_cents: number };

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
};

/**
 * Dívidas agrupadas por devedor: quem deve mais primeiro (o que precisa ser pago), depois os quitados;
 * empates pelo nome (ou número). Dentro do grupo, mais recentes primeiro (ordem de `debt_rows`).
 */
export function groupDebts(debts: Debt[]): DebtorGroup[] {
  const groups = new Map<string, DebtorGroup>();
  for (const debt of debts) {
    const key = debt.associateId ?? `devedor-${debt.debtorNumber}`;
    const group = groups.get(key) ?? { key, label: debt.associateName ?? `Devedor ${debt.debtorNumber}`, associateId: debt.associateId, debts: [], amountCents: 0, paidCents: 0, openCents: 0, openCount: 0 };
    group.debts.push(debt);
    group.amountCents += debt.amountCents;
    group.paidCents += debt.paidCents;
    group.openCents += debtOpenCents(debt);
    if (debtStatus(debt) !== "quitada") group.openCount++;
    groups.set(key, group);
  }
  const number = (group: DebtorGroup) => group.debts[0].debtorNumber;
  return [...groups.values()].sort((a, b) => b.openCents - a.openCents
    || (a.associateId && b.associateId ? a.label.localeCompare(b.label, "pt-BR") : number(a) - number(b)));
}

const MONTHS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** "Mensalidade abr./2026", "Venda a pagar", "Diferença de lançamento", "Anotada". */
export function debtOriginLabel(debt: Pick<Debt, "origin" | "feeYear" | "feeMonth">): string {
  if (debt.origin === "mensalidade" && debt.feeYear && debt.feeMonth) return `Mensalidade ${MONTHS[debt.feeMonth - 1]}/${debt.feeYear}`;
  return DEBT_ORIGIN_LABELS[debt.origin];
}
