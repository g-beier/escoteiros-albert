import { describe, expect, it } from "vitest";
import { planBatch } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import { EMPTY_LIFE, type ImportState, type StatePerson } from "@/lib/import/state";

const OPTIONS = { filhotes: false, today: "2026-11-24" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = (n: number, over: Partial<StatePerson>): StatePerson => ({
  id: id(n), name: `Pessoa ${n}`, nickname: null, birth: null, branch: "adulto", sectionId: null, patrolId: null,
  registration: "definitivo", joined: null, promise: null, active: true, left: null, notes: null, ...over,
});

const STATE: ImportState = {
  sections: [{ id: "s1", branch: "lobinho", name: "Alcateia Seeonee", active: true }, { id: "s2", branch: "escoteiro", name: "Tropa Tupã", active: true }],
  patrols: [],
  people: [
    person(1, { name: "Carla Dias", birth: "1985-11-21" }),
    person(2, { name: "Bruno Lima", birth: "2012-09-02", branch: "escoteiro", sectionId: "s2" }),
    person(3, { name: "Lia Lima", birth: "2015-01-10", branch: "lobinho", sectionId: "s1" }),
    person(4, { name: "Edu Antigo", active: false }),
  ],
  functions: [{ id: "f1", associateId: id(1), kind: "escotista", title: "Assistente", sectionId: "s1", started: "2019-03-01", ended: null, elected: false }],
  relatives: [{ id: "r1", name: "Marta Lima", associateId: null, notes: null }],
  links: [{ id: "l1", associateId: id(2), relativeId: "r1", kinship: "mae", kinshipNote: null, legal: true, financial: false }],
  items: [], statuses: [], life: EMPTY_LIFE,
};

const plan = (files: Record<string, string>) =>
  planBatch(Object.entries(files).map(([name, text]) => readImportFile(name, text).file!), STATE, OPTIONS);

describe("funcoes.csv", () => {
  it("atualiza a função pela chave, cria as novas e recusa o que não pode", () => {
    const file = plan({ "funcoes.csv": [
      "pessoa;tipo;cargo;seção;início;fim;eleito",
      "Carla Dias;escotista;Chefe de seção;alcateia seeonee;01/03/2019;;",
      "Carla Dias;dirigente;Diretora;;01/01/2025;;sim",
      "Bruno Lima;dirigente;;;;;",
      "Carla Dias;escotista;;;;;",
      "Carla Dias;honorífico;;Tropa Tupã;;;",
      "Edu Antigo;dirigente;;;;;",
      "Ninguém;dirigente;;;;;",
      "Carla Dias;escotista;;Tropa Inexistente;;;",
      "Carla Dias;colaborador;;;01/01/2020;01/01/2019;sim",
    ].join("\n") }).files[0]!;
    expect(file.rows.map((row) => row.action)).toEqual(["atualiza", "nova", "erro", "erro", "erro", "erro", "erro", "erro", "erro"]);
    expect(file.rows[0]!.changes).toEqual([{ field: "cargo", before: "Assistente", after: "Chefe de seção" }]);
    expect(file.payload[0]).toMatchObject({ functionId: "f1", personId: id(1), section: "Alcateia Seeonee" });
    expect(file.rows.slice(2).map((row) => row.errors[0])).toEqual([
      "só adultos têm função", "escotista precisa da seção", "só a função de escotista tem seção",
      "pessoa desligada: reingresse antes de importar a função", '"Ninguém" não encontrada (cadastre em pessoas.csv)',
      'seção "Tropa Inexistente" não cadastrada (cadastre em secoes.csv ou pessoas.csv)', "só dirigente é eleito",
    ]);
  });

  it("encontra pessoas e seções novas do mesmo envio", () => {
    const result = plan({
      "pessoas.csv": "nome;nascimento;ramo;seção\nNova Chefe;01/01/1990;adulto;\nJovem Novo;01/01/2014;escoteiro;Tropa Nova\n",
      "funcoes.csv": "pessoa;nascimento;tipo;seção\nNova Chefe;01/01/1990;escotista;Tropa Nova\n",
    });
    const funcoes = result.files.find((file) => file.kind === "funcoes")!;
    expect(funcoes.rows[0]!.action).toBe("nova");
    expect(funcoes.payload[0]).toMatchObject({ person: "Nova Chefe", personBirth: "1990-01-01", section: "Tropa Nova" });
  });
});

describe("responsaveis.csv", () => {
  it("compartilha o responsável entre irmãos e atualiza o vínculo existente", () => {
    const file = plan({ "responsaveis.csv": [
      "jovem;responsável;parentesco;descrição do parentesco;legal;financeiro;associado",
      "Bruno Lima;Marta Lima;mãe;;;sim;",
      "Lia Lima;MARTA LIMA;mãe;;sim;sim;",
      "Lia Lima;Paulo Lima;pai;;sim;;",
      "Bruno Lima;Paulo Lima;pai;;sim;;",
      "Lia Lima;Carla Dias;outro;tia;;;Carla Dias",
      "Lia Lima;Vó Ana;outro;;;;",
      "Carla Dias;Alguém;mãe;;;;",
    ].join("\n") }).files[0]!;
    expect(file.rows.map((row) => row.action)).toEqual(["atualiza", "nova", "nova", "nova", "nova", "erro", "erro"]);
    expect(file.rows[0]!.changes).toEqual([{ field: "financeiro", before: "não", after: "sim" }]);
    expect(file.payload[0]).toMatchObject({ linkId: "l1", relativeId: "r1" });
    expect(file.rows[1]!.warnings[0]).toContain("ligado a 1 jovem");
    expect(file.payload[1]).toMatchObject({ relativeId: "r1", personId: id(3) });
    expect(file.rows[3]!.warnings[0]).toContain("fica compartilhado");
    expect(file.payload[4]).toMatchObject({ relativeAssociateId: id(1) });
    expect(file.rows[5]!.errors).toEqual(["parentesco outro: informe a descrição (ex.: avó, tia)"]);
    expect(file.rows[6]!.errors).toEqual(["só jovens têm responsáveis"]);
  });
});
