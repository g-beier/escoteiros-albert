import { describe, expect, it } from "vitest";
import { ASSOCIATE_CSV_TEMPLATE, parseAssociatesCsv, parseBranch, parseStatus, planAssociatesImport } from "./associates-import";

describe("parseAssociatesCsv", () => {
  it("lê o modelo", () => {
    const { rows, error } = parseAssociatesCsv(ASSOCIATE_CSV_TEMPLATE);
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { line: 2, name: "Ana Souza", branch: "lobinho", section: "Alcateia Seeonee", patrol: null, active: true, errors: [] },
      { line: 3, name: "Bruno Lima", branch: "escoteiro", section: "Tropa Tupã", patrol: "Patrulha Lobo", active: true, errors: [] },
      { line: 4, name: "Carla Dias", branch: "escoteiro", section: null, patrol: null, active: false, errors: [] },
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

  it("patrulha exige seção", () => {
    expect(parseAssociatesCsv("nome;ramo;equipe\nAna;Escoteiro;Lobo\n").rows[0].errors).toEqual(["patrulha sem seção"]);
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
      { id: "a", name: "Ana Souza", branch: "lobinho", section: null, patrol: null, active: true },
      { id: "b", name: "Bruno Lima", branch: "escoteiro", section: null, patrol: null, active: true },
    ], { sections: [], patrols: [] });
    expect(plan.map((p) => [p.action, p.existingId])).toEqual([["igual", "a"], ["atualiza", "b"], ["nova", undefined], ["erro", undefined]]);
  });

  it("casa seção no ramo e patrulha na seção, com o nome cadastrado", () => {
    const catalog = {
      sections: [{ id: "s1", branch: "escoteiro" as const, name: "Tropa Tupã", active: true }, { id: "s2", branch: "lobinho" as const, name: "Alcateia", active: true }],
      patrols: [{ id: "p1", sectionId: "s1", name: "Patrulha Lobo", active: true }],
    };
    const { rows } = parseAssociatesCsv("nome;ramo;seção;patrulha\nAna;Escoteiro;tropa tupa;patrulha lobo\nBia;Escoteiro;Alcateia;\nCaio;Escoteiro;Tropa Tupã;Águia\nDudu;Escoteiro;Tropa Tupã;\n");
    const plan = planAssociatesImport(rows, [{ id: "d", name: "Dudu", branch: "escoteiro", section: "Tropa Tupã", patrol: null, active: true }], catalog);
    expect(plan[0]).toMatchObject({ action: "nova", section: "Tropa Tupã", patrol: "Patrulha Lobo" });
    expect(plan[1]).toMatchObject({ action: "erro", errors: ['seção "Alcateia" não cadastrada em Escoteiro'] });
    expect(plan[2]).toMatchObject({ action: "erro", errors: ['patrulha "Águia" não cadastrada em Tropa Tupã'] });
    expect(plan[3]).toMatchObject({ action: "igual", existingId: "d" });
  });
});
