import { describe, expect, it } from "vitest";
import { BRANCH_CHOICES, CONTROL_STATUS_CHOICES } from "@/lib/import/contract";
import { parseCents, parseChoice, parseDate, parseInteger, parseMonthOrDate, parseYesNo } from "@/lib/import/values";

describe("parseDate", () => {
  it.each([
    ["14/05/2015", "2015-05-14"],
    ["4/5/2015", "2015-05-04"],
    ["2015-05-14", "2015-05-14"],
    ["14.05.15", "2015-05-14"],
    ["01/01/85", "1985-01-01"],
    [" 29/02/2024 ", "2024-02-29"],
  ])("%s → %s", (text, iso) => expect(parseDate(text)).toEqual({ value: iso }));
  it.each(["31/02/2024", "2015/05/14", "maio 2015", "14/05"])("recusa %s", (text) =>
    expect(parseDate(text).error).toBeTruthy(),
  );
});

describe("parseMonthOrDate", () => {
  it("mês no início = dia 1º; no fim = 1º do mês seguinte", () => {
    expect(parseMonthOrDate("03/2022")).toEqual({ value: "2022-03-01" });
    expect(parseMonthOrDate("12/2025", true)).toEqual({ value: "2026-01-01" });
  });
  it("data no fim = dia seguinte (o último dia conta)", () => {
    expect(parseMonthOrDate("31/12/2025", true)).toEqual({ value: "2026-01-01" });
    expect(parseMonthOrDate("15/03/2022")).toEqual({ value: "2022-03-15" });
  });
  it("recusa mês 13", () => expect(parseMonthOrDate("13/2022").error).toBeTruthy());
});

describe("valores simples", () => {
  it("sim/não", () => {
    expect(parseYesNo("Sim").value).toBe(true);
    expect(parseYesNo("x").value).toBe(true);
    expect(parseYesNo("NÃO").value).toBe(false);
    expect(parseYesNo("talvez").error).toBeTruthy();
  });
  it("inteiro com milhar e limites", () => {
    expect(parseInteger("1.300").value).toBe(1300);
    expect(parseInteger("2,5").error).toBeTruthy();
    expect(parseInteger("200", 1, 120).error).toBeTruthy();
  });
  it("dinheiro", () => {
    expect(parseCents("R$ 1.234,56").value).toBe(123456);
    expect(parseCents("-5").error).toBeTruthy();
  });
  it("listas por valor, rótulo e apelido, sem acento", () => {
    expect(parseChoice("Sênior", BRANCH_CHOICES).value).toBe("senior");
    expect(parseChoice("ALCATEIA", BRANCH_CHOICES).value).toBe("lobinho");
    expect(parseChoice("DESAT.", CONTROL_STATUS_CHOICES).value).toBe("desatualizado");
    expect(parseChoice("TEM?", CONTROL_STATUS_CHOICES).value).toBe("a_verificar");
    expect(parseChoice("NÃO", CONTROL_STATUS_CHOICES).value).toBe("pendente");
    expect(parseChoice("XXX", CONTROL_STATUS_CHOICES).value).toBe("nao_se_aplica");
    expect(parseChoice("castor", BRANCH_CHOICES).error).toContain("não é um valor aceito");
  });
});
