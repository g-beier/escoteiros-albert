import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "./money";
import { centsToInput } from "./format";

describe("parseMoneyToCents", () => {
  it.each([["100", 10000], ["20,50", 2050], ["-10.05", -1005], [" 0,01 ", 1]])("converte %s", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it.each(["", "1,234", "1e3", "R$ 10", "1.2.3", "NaN"])("rejeita %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("centsToInput", () => {
  it.each([[10000, "100,00"], [2050, "20,50"], [-1005, "-10,05"], [1, "0,01"]])("formata %d", (cents, expected) => {
    expect(centsToInput(cents)).toBe(expected);
    expect(parseMoneyToCents(expected)).toBe(cents);
  });
});
