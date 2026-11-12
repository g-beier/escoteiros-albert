import { z } from "zod";
import { parseMoneyToCents } from "@/lib/money";
import { isLedgerCode, LEDGER_CODE_MASK } from "@/lib/ledger-code";

export const ACCOUNT_KINDS = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  caixa: "Caixa (dinheiro)",
  outro: "Outra",
} as const;

export type AccountKind = keyof typeof ACCOUNT_KINDS;
export const ACCOUNT_KIND_VALUES = Object.keys(ACCOUNT_KINDS) as [AccountKind, ...AccountKind[]];

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  bank: string | null;
  branch: string | null;
  number: string | null;
  opening_balance_cents: number;
  opening_date: string | null;
  active: boolean;
  /** Conta contábil de contrapartida (ex.: "Bancos – Cora" no plano de contas). */
  ledger_code: string | null;
  /** BANKID:ACCTID do OFX ligado a esta conta. */
  ofx_key: string | null;
};

/** Conta "A definir" criada pela migração 011 para lançamentos sem conta conhecida. */
export const PLACEHOLDER_ACCOUNT_NAME = "A definir";

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: no máximo ${max} caracteres.`).transform((value) => value || null);

/** Campos do formulário de conta (FormData → RPC). Saldo inicial digitado em reais, com sinal. */
export const accountFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com ao menos 2 caracteres.").max(60, "Nome: no máximo 60 caracteres."),
  kind: z.enum(ACCOUNT_KIND_VALUES, { message: "Escolha o tipo da conta." }),
  bank: optionalText(60, "Banco"),
  branch: optionalText(20, "Agência"),
  number: optionalText(30, "Número"),
  openingBalance: z.string().trim().transform((value, ctx) => {
    if (!value) return 0;
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Saldo inicial inválido. Use o formato 1234,56." });
      return z.NEVER;
    }
    return cents;
  }),
  openingDate: z.union([z.iso.date({ message: "Data de início inválida." }), z.literal("")]).transform((value) => value || null),
  ledgerCode: z.string().trim().refine((value) => value === "" || isLedgerCode(value), `Conta contábil no formato ${LEDGER_CODE_MASK}.`)
    .transform((value) => value || null),
});

export type AccountInput = z.output<typeof accountFormSchema>;

export function readAccountForm(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return accountFormSchema.safeParse({
    name: text("name"), kind: text("kind"), bank: text("bank"), branch: text("branch"), number: text("number"),
    openingBalance: text("openingBalance"), openingDate: text("openingDate"), ledgerCode: text("ledgerCode"),
  });
}

export function toAccountRpc(input: AccountInput) {
  return {
    p_name: input.name,
    p_kind: input.kind,
    p_bank: input.bank,
    p_branch: input.branch,
    p_number: input.number,
    p_opening_balance_cents: input.openingBalance,
    p_opening_date: input.openingDate,
    p_ledger_code: input.ledgerCode,
  };
}

/** "Sicredi · ag. 0101 · conta 12345-6", para identificar a conta nas listas. */
export function accountDetails(account: Pick<Account, "bank" | "branch" | "number">) {
  return [account.bank, account.branch && `ag. ${account.branch}`, account.number && `conta ${account.number}`].filter(Boolean).join(" · ");
}

type PaymentMethodWithDefault = { id: string; default_account_id?: string | null };

/** Conta padrão (ativa) da forma de pagamento, ou "" se não houver. */
export function defaultAccountFor(paymentMethodId: string, paymentMethods: PaymentMethodWithDefault[], accounts: Pick<Account, "id" | "active">[]) {
  const accountId = paymentMethods.find((method) => method.id === paymentMethodId)?.default_account_id;
  return accountId && accounts.some((account) => account.id === accountId && account.active) ? accountId : "";
}

/**
 * Conta sugerida ao trocar a forma de pagamento: segue a conta padrão da nova forma,
 * a menos que a pessoa já tenha escolhido outra conta (diferente da padrão da forma anterior).
 */
export function accountAfterPaymentChange(
  current: { accountId: string; paymentMethodId: string }, nextPaymentMethodId: string,
  paymentMethods: PaymentMethodWithDefault[], accounts: Pick<Account, "id" | "active">[],
) {
  const previousDefault = defaultAccountFor(current.paymentMethodId, paymentMethods, accounts);
  const chosenByHand = current.accountId !== "" && current.accountId !== previousDefault;
  if (chosenByHand) return current.accountId;
  return defaultAccountFor(nextPaymentMethodId, paymentMethods, accounts) || current.accountId;
}
