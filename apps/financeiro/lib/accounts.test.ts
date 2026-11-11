import { describe, expect, it } from "vitest";
import { accountAfterPaymentChange, accountDetails, defaultAccountFor, readAccountForm, toAccountRpc } from "./accounts";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("readAccountForm", () => {
  it("lê os campos e converte o saldo inicial para centavos", () => {
    const result = readAccountForm(form({ name: " Conta Sicredi ", kind: "corrente", bank: "Sicredi", branch: "0101", number: " ", openingBalance: "-1234,5", openingDate: "2026-01-01" }));
    expect(result.success).toBe(true);
    expect(toAccountRpc(result.data!)).toEqual({
      p_name: "Conta Sicredi", p_kind: "corrente", p_bank: "Sicredi", p_branch: "0101", p_number: null,
      p_opening_balance_cents: -123450, p_opening_date: "2026-01-01",
    });
  });

  it("aceita saldo e data vazios", () => {
    const result = readAccountForm(form({ name: "Caixa", kind: "caixa" }));
    expect(result.data).toMatchObject({ openingBalance: 0, openingDate: null, bank: null });
  });

  it("rejeita tipo, nome e saldo inválidos", () => {
    expect(readAccountForm(form({ name: "Caixa", kind: "cofre" })).error?.issues[0]?.message).toBe("Escolha o tipo da conta.");
    expect(readAccountForm(form({ name: "C", kind: "caixa" })).error?.issues[0]?.message).toMatch(/ao menos 2/);
    expect(readAccountForm(form({ name: "Caixa", kind: "caixa", openingBalance: "abc" })).error?.issues[0]?.message).toMatch(/Saldo inicial/);
  });
});

describe("accountDetails", () => {
  it("junta banco, agência e número", () => {
    expect(accountDetails({ bank: "Sicredi", branch: "0101", number: "12345-6" })).toBe("Sicredi · ag. 0101 · conta 12345-6");
    expect(accountDetails({ bank: null, branch: null, number: null })).toBe("");
  });
});

const accounts = [{ id: "cc", active: true }, { id: "caixa", active: true }, { id: "velha", active: false }];
const methods = [
  { id: "pix", default_account_id: "cc" },
  { id: "dinheiro", default_account_id: "caixa" },
  { id: "boleto", default_account_id: null },
  { id: "cheque", default_account_id: "velha" },
];

describe("defaultAccountFor", () => {
  it("usa a conta padrão ativa da forma", () => {
    expect(defaultAccountFor("pix", methods, accounts)).toBe("cc");
    expect(defaultAccountFor("boleto", methods, accounts)).toBe("");
    expect(defaultAccountFor("cheque", methods, accounts)).toBe("");
    expect(defaultAccountFor("", methods, accounts)).toBe("");
  });
});

describe("accountAfterPaymentChange", () => {
  it("segue a conta padrão quando a conta ainda não foi escolhida à mão", () => {
    expect(accountAfterPaymentChange({ accountId: "", paymentMethodId: "" }, "pix", methods, accounts)).toBe("cc");
    expect(accountAfterPaymentChange({ accountId: "cc", paymentMethodId: "pix" }, "dinheiro", methods, accounts)).toBe("caixa");
  });

  it("mantém a conta escolhida à mão", () => {
    expect(accountAfterPaymentChange({ accountId: "caixa", paymentMethodId: "pix" }, "boleto", methods, accounts)).toBe("caixa");
    expect(accountAfterPaymentChange({ accountId: "caixa", paymentMethodId: "pix" }, "pix", methods, accounts)).toBe("caixa");
  });

  it("mantém a conta atual se a nova forma não tem padrão", () => {
    expect(accountAfterPaymentChange({ accountId: "cc", paymentMethodId: "pix" }, "boleto", methods, accounts)).toBe("cc");
  });
});
