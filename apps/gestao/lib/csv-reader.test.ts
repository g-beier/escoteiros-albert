import { describe, expect, it } from "vitest";
import { parseCsvRecords, readCsv, sniffCsvLayout } from "@/lib/csv-reader";

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
    const table = readCsv("Relatório de associados\n\nnome;ramo\nAna;Lobinho\n\nBruno;Escoteiro\n", { delimiter: ";", headerRow: 3 });
    expect(table.preamble).toEqual([["Relatório de associados"]]);
    expect(table.header).toEqual(["nome", "ramo"]);
    expect(table.rows).toEqual([["Ana", "Lobinho"], ["Bruno", "Escoteiro"]]);
    expect(table.rowNumbers).toEqual([4, 6]);
  });
});

describe("sniffCsvLayout", () => {
  it("acha o separador e pula linhas antes do cabeçalho", () => {
    expect(sniffCsvLayout("Lista\n\nnome;ramo;status\nAna;Lobinho;ativo\nBruno;Escoteiro;inativo\n")).toEqual({ delimiter: ";", headerRow: 3 });
    expect(sniffCsvLayout("nome,ramo\nAna,Lobinho\nBruno,Escoteiro\n")).toEqual({ delimiter: ",", headerRow: 1 });
    expect(sniffCsvLayout("date\tamount\n2026-01-05\t10.50\n2026-01-06\t-3.25\n")).toEqual({ delimiter: "\t", headerRow: 1 });
  });
});
