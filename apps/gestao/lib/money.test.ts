import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "./money";
import { centsToInput, formatCents } from "./format";
import { MAX_MONEY_DIGITS, formatInputCents, popDigit, pushDigits } from "@geas/ui/lib/money";

describe("parseMoneyToCents", () => {
  it.each([
    ["100", 10000],
    ["20,50", 2050],
    ["-10.05", -1005],
    [" 0,01 ", 1],
    ["12,5", 1250],
    ["12.5", 1250],
    // milhar (antes recusado no Financeiro: o formulário de conta voltava vazio com "1.234,56")
    ["1.234,56", 123456],
    ["12.345.678,90", 1234567890],
    ["1.234", 123400],
    // R$ e sinal (o Inventário já aceitava R$)
    ["R$ 10", 1000],
    ["R$ 1.234,56", 123456],
    ["-R$ 5,00", -500],
    ["R$ -5,00", -500],
  ])("converte %s", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "1,234", "1e3", "1.2.3", "NaN", "1.23.456", "12.34,56", "1,2,3", "R$", "-", "10,-5"])(
    "rejeita %s",
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull();
    },
  );

  it("recusa negativo quando pedido (valores de material)", () => {
    expect(parseMoneyToCents("-1", { allowNegative: false })).toBeNull();
    expect(parseMoneyToCents("1.234,56", { allowNegative: false })).toBe(123456);
  });
});

describe("centsToInput", () => {
  it.each([
    [10000, "100,00"],
    [2050, "20,50"],
    [-1005, "-10,05"],
    [1, "0,01"],
    [123456, "1.234,56"],
    [-123456789, "-1.234.567,89"],
  ])("formata %d", (cents, expected) => {
    expect(centsToInput(cents)).toBe(expected);
    expect(parseMoneyToCents(expected)).toBe(cents);
  });

  it("vazio para valor ausente", () => {
    expect(centsToInput(null)).toBe("");
    expect(centsToInput(undefined)).toBe("");
  });
});

describe("formatCents", () => {
  it("formata centavos em reais", () => {
    // Intl separa "R$" do número com espaço não separável
    const plain = (text: string) => text.replace(/\s/g, " ");
    expect(plain(formatCents(123456))).toBe("R$ 1.234,56");
    expect(plain(formatCents(null))).toBe("R$ 0,00");
  });
});

describe("caixa registradora (MoneyInput)", () => {
  it("dígitos entram pela direita", () => {
    let cents: number | null = null;
    const shown: string[] = [];
    for (const digit of "3500") {
      cents = pushDigits(cents, digit);
      shown.push(formatInputCents(cents));
    }
    expect(shown).toEqual(["0,03", "0,35", "3,50", "35,00"]);
    expect(formatInputCents(pushDigits(null, "123456"))).toBe("1.234,56");
  });

  it("backspace tira o último dígito e esvazia no fim", () => {
    expect(popDigit(3500)).toBe(350);
    expect(popDigit(-350)).toBe(-35);
    expect(popDigit(3)).toBeNull();
    expect(popDigit(null)).toBeNull();
  });

  it("mantém o sinal e para no limite de dígitos", () => {
    expect(pushDigits(-35, "0")).toBe(-350);
    const max = pushDigits(null, "9".repeat(MAX_MONEY_DIGITS + 3));
    expect(String(max)).toHaveLength(MAX_MONEY_DIGITS);
    expect(Number.isSafeInteger(max)).toBe(true);
  });

  it("vazio e zero", () => {
    expect(formatInputCents(null)).toBe("");
    expect(formatInputCents(0)).toBe("0,00");
  });
});
