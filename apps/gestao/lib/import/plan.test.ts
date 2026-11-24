import { describe, expect, it } from "vitest";
import { planBatch, planTotals } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import type { ImportState, StatePerson } from "@/lib/import/state";

const OPTIONS = { filhotes: false, today: "2026-11-24" };

const person = (over: Partial<StatePerson>): StatePerson => ({
  id: "00000000-0000-4000-8000-000000000001", name: "Ana Souza", nickname: null, birth: "2015-05-14", branch: "lobinho",
  sectionId: "s1", patrolId: null, registration: "provisorio", joined: null, promise: null, active: true, left: null, notes: null, ...over,
});

const STATE: ImportState = {
  functions: [], relatives: [], links: [], items: [], statuses: [],
  sections: [{ id: "s1", branch: "lobinho", name: "Alcateia Seeonee", active: true }, { id: "s2", branch: "escoteiro", name: "Tropa Tupã", active: true }],
  patrols: [{ id: "p1", sectionId: "s2", name: "Patrulha Lobo", active: true }],
  people: [person({}), person({ id: "00000000-0000-4000-8000-000000000002", name: "Bruno Lima", birth: null, branch: "escoteiro", sectionId: "s2", patrolId: "p1" })],
};

const plan = (files: Record<string, string>, state = STATE) =>
  planBatch(Object.entries(files).map(([name, text]) => readImportFile(name, text).file!), state, OPTIONS);

describe("pessoas.csv", () => {
  it("nova, atualiza, igual e erro", () => {
    const result = plan({ "pessoas.csv": [
      "nome;nascimento;ramo;seção;registro;promessa",
      "Ana Souza;14/05/2015;;;provisório;",
      "Ana Souza;14/05/2015;;;definitivo;18/06/2022",
      "BRUNO  lima;;;;definitivo;",
      "Carla Dias;21/11/1985;adulto;;;",
      "Duda;;;;;",
      "Eva Melo;01/01/2016;lobinho;Alcateia Nova;;",
    ].join("\n") });
    const file = result.files[0]!;
    expect(file.rows.map((row) => row.action)).toEqual(["igual", "erro", "atualiza", "nova", "erro", "nova"]);
    expect(file.rows[1]!.errors).toEqual(["mesma pessoa da linha 2"]);
    expect(file.rows[2]!.changes).toEqual([{ field: "registro", before: "provisório", after: "definitivo" }]);
    expect(file.rows[4]!.errors).toEqual(["ramo é obrigatório para cadastrar"]);
    expect(file.creations).toEqual(['Nova seção "Alcateia Nova" (lobinho)']);
    expect(file.payload.map((row) => row.line)).toEqual([4, 5, 7]);
    expect(file.payload[0]).toMatchObject({ id: STATE.people[1]!.id, registration: "definitivo", section: "Tropa Tupã", patrol: "Patrulha Lobo" });
    expect(planTotals(file)).toEqual({ nova: 2, atualiza: 1, igual: 1, erro: 2 });
  });

  it("nome igual com nascimento diferente é outra pessoa; sem nascimento e dois homônimos é ambíguo", () => {
    const state = { ...STATE, people: [...STATE.people, person({ id: "00000000-0000-4000-8000-000000000003", birth: "2016-01-01" })] };
    const file = plan({ "pessoas.csv": "nome;nascimento;ramo\nAna Souza;02/02/2017;lobinho\nAna Souza;;\n" }, state).files[0]!;
    expect(file.rows[0]!.action).toBe("nova");
    expect(file.rows[1]!.errors[0]).toContain("há 3 pessoas");
  });

  it("mudar o ramo limpa a seção antiga; adulto não tem seção", () => {
    const file = plan({ "pessoas.csv": "nome;nascimento;ramo;seção\nAna Souza;14/05/2015;escoteiro;\nCarla;;adulto;Tropa Tupã\n" }).files[0]!;
    expect(file.rows[0]!.changes).toEqual([
      { field: "ramo", before: "lobinho", after: "escoteiro" },
      { field: "seção", before: "Alcateia Seeonee", after: "" },
    ]);
    expect(file.rows[0]!.warnings[0]).toContain("sem passagem");
    expect(file.payload[0]).toMatchObject({ branch: "escoteiro", section: null, patrol: null });
    expect(file.rows[1]!.errors).toEqual(["adultos não têm seção"]);
  });

  it("desligamento pede data; reingresso não é pela importação; datas no futuro", () => {
    const state = { ...STATE, people: [...STATE.people, person({ id: "00000000-0000-4000-8000-000000000009", name: "Caio", birth: null, active: false })] };
    const file = plan({ "pessoas.csv": "nome;situação;desligado em;promessa\nAna Souza;desligado;;\nBruno Lima;desligado;10/10/2025;\nCaio;ativo;;\nAna Souza;;;01/01/2030\n" }, state).files[0]!;
    expect(file.rows.map((row) => row.errors)).toEqual([
      ["informe a data do desligamento (desligado em)"], [], ["reingresso só pela ficha do associado (Reingressar)"], ["promessa no futuro"],
    ]);
    expect(file.rows[1]!.changes).toEqual([{ field: "situação", before: "ativo", after: "desligado em 10/10/2025" }]);
  });

  it("filhote só com o ramo ligado", () => {
    expect(plan({ "pessoas.csv": "nome;ramo\nZé;filhote\n" }).files[0]!.rows[0]!.errors).toEqual(["o ramo Filhote não está ligado"]);
  });
});

describe("secoes.csv e o envio", () => {
  it("cria seções e patrulhas, desativa, e pessoas.csv do mesmo envio as encontram", () => {
    const result = plan({
      "pessoas.csv": "nome;ramo;seção;patrulha\nNina;escoteiro;Tropa Nova;Patrulha Águia\n",
      "secoes.csv": "ramo;seção;patrulha;ativa\nescoteiro;Tropa Nova;;\nescoteiro;Tropa Tupã;Patrulha Lobo;não\nescoteiro;tropa tupa;;\nadulto;Diretoria;;\n",
    });
    expect(result.files.map((file) => file.kind)).toEqual(["secoes", "pessoas"]);
    const [secoes, pessoas] = result.files;
    expect(secoes!.rows.map((row) => row.action)).toEqual(["nova", "atualiza", "igual", "erro"]);
    expect(secoes!.creations).toEqual(['Nova seção "Tropa Nova" (escoteiro)']);
    expect(pessoas!.creations).toEqual(['Nova patrulha "Patrulha Águia" em Tropa Nova']);
  });

  it("dois arquivos do mesmo tipo e tipos ainda não disponíveis", () => {
    const result = plan({ "pessoas.csv": "nome;ramo\nA B;adulto\n", "pessoas (1).csv": "nome;ramo\nC D;adulto\n" });
    expect(result.errors[0]).toContain("são do mesmo tipo");
  });
});
