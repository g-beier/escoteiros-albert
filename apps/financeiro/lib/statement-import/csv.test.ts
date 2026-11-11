import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvRecords, readCsv, sniffCsv } from "./csv";
import { decodeBytes } from "./text";

const fixture = (name: string) => decodeBytes(new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)))).text;

describe("parseCsvRecords", () => {
  it("segue a RFC 4180: aspas, aspas escapadas, separador e quebra de linha dentro do campo", () => {
    const text = 'a,"b, c","d ""e""","f\r\ng"\r\n1,2,3,4\n';
    expect(parseCsvRecords(text, ",")).toEqual([
      ["a", "b, c", 'd "e"', "f\r\ng"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("aceita campos vazios e falta de quebra de linha no fim", () => {
    expect(parseCsvRecords("a;;c\n;;", ";")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("aceita separador de vários caracteres e CR sozinho", () => {
    expect(parseCsvRecords("a||b\rc||d", "||")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("readCsv", () => {
  it("separa preâmbulo, cabeçalho e linhas, ignorando linhas em branco", () => {
    const table = readCsv(fixture("mercadopago.csv"), { delimiter: ";", headerRow: 4 });
    expect(table.preamble).toEqual([
      ["INITIAL_BALANCE", "CREDITS", "DEBITS", "FINAL_BALANCE"],
      ["1.500,00", "2.778,62", "-1.618,30", "2.660,32"],
    ]);
    expect(table.header).toEqual(["RELEASE_DATE", "TRANSACTION_TYPE", "REFERENCE_ID", "TRANSACTION_NET_AMOUNT", "PARTIAL_BALANCE"]);
    expect(table.rows).toHaveLength(12);
    expect(table.rowNumbers.slice(0, 2)).toEqual([5, 6]);
  });

  it("numera as linhas pelo registro no arquivo, pulando as em branco", () => {
    const table = readCsv("h1,h2\n\n1,2\n , \n3,4\n", { delimiter: ",", headerRow: 1 });
    expect(table.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(table.rowNumbers).toEqual([3, 5]);
  });
});

describe("sniffCsv", () => {
  it("Mercado Pago: ponto e vírgula, cabeçalho depois do bloco de resumo, vírgula decimal", () => {
    expect(sniffCsv(fixture("mercadopago.csv"))).toEqual({
      delimiter: ";",
      headerRow: 4,
      dateFormat: "DD-MM-YYYY",
      decimal: "comma",
    });
  });

  it("Cora: vírgula, ponto decimal e valores inteiros", () => {
    expect(sniffCsv(fixture("cora.csv"))).toEqual({
      delimiter: ",",
      headerRow: 1,
      dateFormat: "DD/MM/YYYY",
      decimal: "dot",
    });
  });

  it("latin1 com título e período antes do cabeçalho", () => {
    expect(sniffCsv(fixture("latin1-bank.csv"))).toEqual({
      delimiter: ";",
      headerRow: 4,
      dateFormat: "DD/MM/YYYY",
      decimal: "comma",
    });
  });

  it("tabulação, datas ISO e MM/DD quando o dia passa de 12", () => {
    expect(sniffCsv("date\tamount\n2026-01-05\t10.50\n2026-01-06\t-3.25\n")).toMatchObject({
      delimiter: "\t",
      headerRow: 1,
      dateFormat: "YYYY-MM-DD",
      decimal: "dot",
    });
    expect(sniffCsv("date|amount\n01/25/2026|10.50\n02/13/2026|1,234.00\n").dateFormat).toBe("MM/DD/YYYY");
  });
});
