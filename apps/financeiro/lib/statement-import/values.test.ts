import { describe, expect, it } from "vitest";
import { decodeBytes, normalizeText } from "./text";
import { parseAmount, parseDate } from "./values";

describe("parseAmount", () => {
  it.each([
    ["1.234,56", "comma", 123456],
    ["-1.311,75", "comma", -131175],
    ["50,00", "comma", 5000],
    ["R$ 1.234,56", "comma", 123456],
    ["-R$ 10,00", "comma", -1000],
    ["R$ -10,00", "comma", -1000],
    ["(1.234,56)", "comma", -123456],
    ["(R$ 5,5)", "comma", -550],
    ["10,00-", "comma", -1000],
    ["+3,12", "comma", 312],
    [" 1 234,56 ", "comma", 123456],
    ["-0,00", "comma", 0],
    ["-1311.75", "dot", -131175],
    ["-150", "dot", -15000],
    ["-150.5", "dot", -15050],
    ["1,234.56", "dot", 123456],
    ["12.3456", "dot", 1235],
    ["12.344", "dot", 1234],
  ] as const)("%s (%s) → %d", (raw, decimal, expected) => {
    expect(parseAmount(raw, decimal)).toBe(expected);
  });

  it.each([
    ["", "comma"],
    ["abc", "comma"],
    ["1.234.5", "comma"],
    ["1234.56", "comma"],
    ["1,2,3", "dot"],
    ["--5", "dot"],
    ["1e3", "dot"],
  ] as const)("rejeita %s (%s)", (raw, decimal) => {
    expect(parseAmount(raw, decimal)).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["18/05/2026", "DD/MM/YYYY", "2026-05-18"],
    ["1/5/2026", "DD/MM/YYYY", "2026-05-01"],
    ["01-10-2026", "DD-MM-YYYY", "2026-10-01"],
    ["2026-10-01", "YYYY-MM-DD", "2026-10-01"],
    ["10/31/2026", "MM/DD/YYYY", "2026-10-31"],
    ["29/02/24", "DD/MM/YY", "2024-02-29"],
    ["18.05.2026", "DD.MM.YYYY", "2026-05-18"],
    ["18/05/2026 14:03:00", "DD/MM/YYYY", "2026-05-18"],
    ["2026-10-01T10:00:00", "YYYY-MM-DD", "2026-10-01"],
  ] as const)("%s (%s) → %s", (raw, format, expected) => {
    expect(parseDate(raw, format)).toBe(expected);
  });

  it.each([
    ["31/02/2026", "DD/MM/YYYY"],
    ["29/02/2026", "DD/MM/YYYY"],
    ["13/13/2026", "DD/MM/YYYY"],
    ["18/05/2026", "DD-MM-YYYY"],
    ["", "YYYY-MM-DD"],
    ["31/10/2026", "MM/DD/YYYY"],
  ] as const)("rejeita %s (%s)", (raw, format) => {
    expect(parseDate(raw, format)).toBeNull();
  });
});

describe("decodeBytes", () => {
  it("lê UTF-8 e remove o BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Débito")]);
    expect(decodeBytes(bytes)).toEqual({ text: "Débito", encoding: "utf-8" });
  });

  it("cai para latin1 quando o UTF-8 é inválido", () => {
    // "Crédito – Ação" in windows-1252 (0x96 is an en dash, not a C1 control).
    const bytes = new Uint8Array([0x43, 0x72, 0xe9, 0x64, 0x69, 0x74, 0x6f, 0x20, 0x96, 0x20, 0x41, 0xe7, 0xe3, 0x6f]);
    expect(decodeBytes(bytes)).toEqual({ text: "Crédito – Ação", encoding: "latin1" });
    expect(decodeBytes(bytes.buffer)).toEqual({ text: "Crédito – Ação", encoding: "latin1" });
  });

  it("respeita a codificação pedida", () => {
    const utf8 = new TextEncoder().encode("Ação");
    expect(decodeBytes(utf8, "latin1").text).toBe("AÃ§Ã£o");
    expect(decodeBytes(utf8, "utf-8").text).toBe("Ação");
  });
});

describe("normalizeText", () => {
  it("ignora caixa, acentos e espaços", () => {
    expect(normalizeText("  SALDO TOTAL   DISPONÍVEL Dia ")).toBe("saldo total disponivel dia");
  });
});
