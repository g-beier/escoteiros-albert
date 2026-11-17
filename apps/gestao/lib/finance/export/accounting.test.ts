import { describe, expect, it } from "vitest";
import { ACCOUNTING_COLUMNS, accountingHistory, missingLedgerCodes, toAccountingRows, type AccountingSplit } from "./accounting";
import { csvMoney, csvText, encodeCsv, toCsv } from "./csv";

const split = (amount_cents: number, overrides: Partial<AccountingSplit> = {}): AccountingSplit => ({
  entry_date: "2026-05-18", entry_name: "Fulano", description: "Mensalidade maio", amount_cents, document: "NF 12",
  category_code: "1.1", category_name: "Mensalidades", category_ledger_code: "3.1.1.1.0001",
  account_name: "Cora", account_ledger_code: "1.1.1.2.0003", external_ids: ["FIT-9"], ...overrides,
});

describe("toAccountingRows", () => {
  it("entrada: débito no banco, crédito na rubrica", () => {
    expect(toAccountingRows([split(5000)])[0]).toEqual({
      date: "2026-05-18", debit: "1.1.1.2.0003", credit: "3.1.1.1.0001", amountCents: 5000,
      history: "Fulano — Mensalidade maio", document: "NF 12", ofxId: "FIT-9", category: "1.1 Mensalidades", account: "Cora",
    });
  });

  it("saída: débito na rubrica, crédito no banco, valor positivo", () => {
    expect(toAccountingRows([split(-2500, { category_ledger_code: "4.1.2.1.0010" })])[0]).toMatchObject({ debit: "4.1.2.1.0010", credit: "1.1.1.2.0003", amountCents: 2500 });
  });

  it("rateio misto: cada rateio pelo seu sinal; sem conta do banco a contrapartida sai vazia", () => {
    const rows = toAccountingRows([split(6000), split(-1000, { category_ledger_code: "4.1.1.1.0001", account_ledger_code: null })]);
    expect(rows.map((r) => [r.debit, r.credit, r.amountCents])).toEqual([["1.1.1.2.0003", "3.1.1.1.0001", 6000], ["4.1.1.1.0001", "", 1000]]);
  });
});

describe("missingLedgerCodes", () => {
  it("lista as rubricas sem conta contábil, sem repetir", () => {
    expect(missingLedgerCodes([split(1), split(2, { category_ledger_code: null, category_code: "2.10", category_name: "Lenços" }),
      split(3, { category_ledger_code: null, category_code: "2.2", category_name: "Programa" }),
      split(4, { category_ledger_code: null, category_code: "2.10", category_name: "Lenços" })])).toEqual(["2.2 Programa", "2.10 Lenços"]);
  });
});

describe("CSV contábil", () => {
  it("histórico numa linha, sem separador e até 200 caracteres", () => {
    expect(accountingHistory("Fulano", "fulano")).toBe("Fulano");
    expect(accountingHistory("A;B", "linha 1\nlinha 2")).toBe("A,B — linha 1 linha 2");
    expect(accountingHistory("x".repeat(300), "")).toHaveLength(200);
    expect(csvText('diz "oi"')).toBe("diz 'oi'");
  });

  it("valor com vírgula e sem milhar", () => {
    expect(csvMoney(123456789)).toBe("1234567,89");
    expect(csvMoney(5)).toBe("0,05");
    expect(csvMoney(-150)).toBe("-1,50");
  });

  it("monta o arquivo", () => {
    expect(toCsv(ACCOUNTING_COLUMNS, toAccountingRows([split(5000)]))).toBe(
      "Data;Conta débito;Conta crédito;Valor;Histórico;Documento;ID OFX;Rubrica;Conta\r\n" +
      "18/05/2026;1.1.1.2.0003;3.1.1.1.0001;50,00;Fulano — Mensalidade maio;NF 12;FIT-9;1.1 Mensalidades;Cora\r\n",
    );
  });

  it("codifica em Windows-1252 ou UTF-8 com BOM", () => {
    expect([...encodeCsv("Ação — €☃", "windows-1252")]).toEqual([0x41, 0xe7, 0xe3, 0x6f, 0x20, 0x97, 0x20, 0x80, 0x3f]);
    expect([...encodeCsv("é", "utf-8")]).toEqual([0xef, 0xbb, 0xbf, 0xc3, 0xa9]);
  });
});
