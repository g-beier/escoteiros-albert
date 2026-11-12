import { describe, expect, it } from "vitest";
import { ASSOCIATE_CSV_TEMPLATE, parseAssociatesCsv, parseBranch, parseStatus, planAssociatesImport } from "./associates-import";

describe("parseAssociatesCsv", () => {
  it("lê o modelo", () => {
    const { rows, error } = parseAssociatesCsv(ASSOCIATE_CSV_TEMPLATE);
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { line: 2, name: "Ana Souza", branch: "lobinho", section: "Alcateia Seeonee", active: true, errors: [] },
      { line: 3, name: "Bruno Lima", branch: "escoteiro", section: null, active: false, errors: [] },
    ]);
  });

  it("aceita vírgula, cabeçalho sem acento e em outra ordem, ramo no plural e status vazio", () => {
    const { rows } = parseAssociatesCsv("Status,Nome,SECAO,Ramo\n,Carla  Dias,Clã Tupã,Pioneiros\n");
    expect(rows[0]).toMatchObject({ name: "Carla Dias", branch: "pioneiro", section: "Clã Tupã", active: true, errors: [] });
  });

  it("aponta erros por linha", () => {
    const { rows } = parseAssociatesCsv("nome;ramo;seção;status\nA;Lobinho;;ativo\nDiego;Marinheiro;;talvez\nAna;Sênior;;\nana;Adulto;;\n");
    expect(rows.map((r) => r.errors)).toEqual([
      ["nome com 2 a 120 caracteres"],
      ['ramo "Marinheiro" desconhecido', 'status "talvez" desconhecido (use ativo ou inativo)'],
      [],
      ["nome repetido no arquivo (linha 4)"],
    ]);
  });

  it("exige nome e ramo no cabeçalho", () => {
    expect(parseAssociatesCsv("nome;seção\nAna;X\n").error).toMatch(/coluna ramo/);
    expect(parseAssociatesCsv("  ").error).toBe("Arquivo vazio.");
  });
});

describe("ramo e status", () => {
  it("reconhece rótulos e sinônimos", () => {
    expect(parseBranch("Sênior")).toBe("senior");
    expect(parseBranch("ESCOTISTA")).toBe("adulto");
    expect(parseBranch("alcateia")).toBe("lobinho");
    expect(parseBranch("x")).toBeUndefined();
    expect(parseStatus("Inativa")).toBe(false);
    expect(parseStatus("SIM")).toBe(true);
    expect(parseStatus("?")).toBeNull();
  });
});

describe("planAssociatesImport", () => {
  it("separa novas, atualizações, iguais e erros pelo nome", () => {
    const { rows } = parseAssociatesCsv("nome;ramo;seção;status\nAna Souza;Lobinho;;ativo\nBRUNO LIMA;Escoteiro;;inativo\nCarla;Adulto;;\nDiego;?;;\n");
    const plan = planAssociatesImport(rows, [
      { id: "a", name: "Ana Souza", branch: "lobinho", section: null, active: true },
      { id: "b", name: "Bruno Lima", branch: "escoteiro", section: null, active: true },
    ]);
    expect(plan.map((p) => [p.action, p.existingId])).toEqual([["igual", "a"], ["atualiza", "b"], ["nova", undefined], ["erro", undefined]]);
  });
});
