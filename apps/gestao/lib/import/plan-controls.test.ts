import { describe, expect, it } from "vitest";
import { CONTROL_STATUS_CHOICES } from "@/lib/import/contract";
import { planBatch } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import { EMPTY_LIFE, type ImportState, type StatePerson } from "@/lib/import/state";
import { parseControlCell } from "@/lib/import/values";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = (n: number, over: Partial<StatePerson>): StatePerson => ({
  id: id(n), name: `Pessoa ${n}`, nickname: null, birth: null, branch: "adulto", sectionId: null, patrolId: null,
  registration: "definitivo", joined: null, promise: null, active: true, left: null, notes: null, ...over,
});
const item = (itemId: string, name: string, valueKind: string, audiences: Record<string, string | null>, active = true) =>
  ({ id: itemId, name, kind: "documento", directorate: "administrativa", valueKind, validityMonths: null, removeOnLeave: false, active, audiences });

const STATE: ImportState = {
  sections: [], patrols: [],
  people: [person(1, { name: "Carla Dias" }), person(2, { name: "Bruno Lima", branch: "escoteiro", birth: "2012-09-02" }), person(3, { name: "Lia Lima", branch: "lobinho" })],
  functions: [],
  relatives: [{ id: "r1", name: "Marta Lima", associateId: null, notes: null }, { id: "r2", name: "Marta Lima", associateId: null, notes: null }],
  links: [{ id: "l1", associateId: id(2), relativeId: "r1", kinship: "mae", kinshipNote: null, legal: true, financial: false },
    { id: "l2", associateId: id(3), relativeId: "r2", kinship: "outro", kinshipNote: "avó", legal: false, financial: false }],
  items: [
    item("i1", "Ficha de saúde", "situacao", { jovem: "pendente", adulto: "pendente" }),
    item("i2", "Ano-base do registro", "ano", { jovem: null, adulto: null }),
    item("i3", "Validade do registro", "data", { jovem: null, adulto: null }),
    item("i4", "Grupo de WhatsApp", "situacao", { adulto: "convidado", responsavel: "convidado" }),
    item("i5", "Antigo", "situacao", { jovem: null }, false),
  ],
  statuses: [{ associateId: id(2), relativeId: null, itemId: "i1", status: "pendente", statusDate: "2026-01-01", validUntil: null, year: null, note: null }],
  life: EMPTY_LIFE,
};

const plan = (files: Record<string, string>) =>
  planBatch(Object.entries(files).map(([name, text]) => readImportFile(name, text).file!), STATE, { filhotes: false, today: "2026-11-24" });

describe("parseControlCell", () => {
  it.each([
    ["OK", "situacao", { status: "ok" }],
    ["NÃO - falta assinatura", "situacao", { status: "pendente", note: "falta assinatura" }],
    ["ok 10/03/2026", "situacao", { status: "ok", statusDate: "2026-03-10" }],
    ["2026", "ano", { year: 2026 }],
    ["DESAT. 2024", "ano", { status: "desatualizado", year: 2024 }],
    ["31/03/2027", "data", { validUntil: "2027-03-31" }],
    ["XXX", "data", { status: "nao_se_aplica" }],
  ])("%s (%s)", (text, kind, expected) => expect(parseControlCell(text, kind, CONTROL_STATUS_CHOICES)).toEqual({ value: expected }));
  it("recusa código desconhecido", () => expect(parseControlCell("talvez", "situacao", CONTROL_STATUS_CHOICES).error).toContain("não é situação"));
});

describe("controle.csv", () => {
  it("grava só o que muda, pessoa e responsável pelo jovem", () => {
    const file = plan({ "controle.csv": [
      "público;pessoa;nascimento;jovem;Ficha de saúde;Ano-base do registro;Validade do registro;Grupo de WhatsApp",
      "jovem;Bruno Lima;02/09/2012;;NÃO;2026;31/03/2027;",
      "jovem;Lia Lima;;;pendente;;;",
      "responsável;Marta Lima;;Bruno Lima;;;;CONV.",
      "responsável;Marta Lima;;;;;;ok",
      "adulto;Bruno Lima;;;;;;",
      "jovem;Lia Lima;;;;;;ok",
      "adulto;Carla Dias;;;talvez;;;",
    ].join("\n") }).files[0]!;
    expect(file.rows.map((row) => row.action)).toEqual(["atualiza", "atualiza", "atualiza", "erro", "erro", "erro", "erro"]);
    expect(file.rows[0]!.changes).toEqual([
      { field: "Ano-base do registro", before: "", after: "2026" },
      { field: "Validade do registro", before: "", after: "31/03/2027" },
    ]);
    expect(file.payload[0]).toEqual({ line: 2, audience: "jovem", personId: id(2), cells: [
      { item: "Ano-base do registro", itemId: "i2", year: 2026 }, { item: "Validade do registro", itemId: "i3", validUntil: "2027-03-31" },
    ] });
    expect(file.payload[2]).toMatchObject({ audience: "responsavel", relativeId: "r1" });
    expect(file.rows.slice(3).map((row) => row.errors[0])).toEqual([
      'há 2 responsáveis "Marta Lima": informe o jovem', "público adulto, mas é jovem", "mesma pessoa da linha 3",
      'Ficha de saúde: "talvez" não é situação aceita',
    ]);
    expect(file.rows[5]!.errors).toContain("Grupo de WhatsApp: não se aplica a jovem");
  });

  it("coluna que não é item barra o envio; item novo do mesmo envio vale", () => {
    expect(plan({ "controle.csv": "público;pessoa;Instagram\nadulto;Carla Dias;ok\n" }).errors[0]).toContain('a coluna "Instagram" não é item de controle');
    const result = plan({
      "itens-controle.csv": "item;diretoria;tipo;adulto\nInstagram;comunicação;canal;convidado\n",
      "controle.csv": "público;pessoa;Instagram\nadulto;Carla Dias;ok\n",
    });
    expect(result.errors).toEqual([]);
    expect(result.files[0]!.rows[0]!.action).toBe("nova");
    expect(result.files[1]!.payload[0]).toMatchObject({ cells: [{ item: "Instagram", status: "ok" }] });
  });
});

describe("itens-controle.csv", () => {
  it("cria, atualiza o público e recusa sem diretoria", () => {
    const file = plan({ "itens-controle.csv": [
      "item;diretoria;tipo;valor;validade meses;jovem;adulto;responsável",
      "ficha de saúde;;;;12;não;;",
      "Novo item;;documento;;;sim;;",
      "Outro;financeira;etapa;ano;;;;",
    ].join("\n") }).files[0]!;
    expect(file.rows.map((row) => row.action)).toEqual(["atualiza", "erro", "erro"]);
    expect(file.rows[0]!.changes).toEqual([{ field: "validade meses", before: "", after: "12" }, { field: "jovem", before: "pendente", after: "não" }]);
    expect(file.payload[0]).toMatchObject({ itemId: "i1", audiences: [{ audience: "adulto", initial_status: "pendente" }] });
    expect(file.rows[1]!.errors).toEqual(["diretoria é obrigatória para criar"]);
    expect(file.rows[2]!.errors).toEqual(["o item precisa valer para jovem, adulto ou responsável"]);
  });
});

describe("exportar e reimportar itens e controle", () => {
  it("dá tudo igual", async () => {
    const { controlsCsv, itemsCsv } = await import("@/lib/import/export");
    const state: ImportState = {
      ...STATE,
      relatives: [STATE.relatives[0]!],
      links: [STATE.links[0]!],
      statuses: [
        { associateId: id(2), relativeId: null, itemId: "i1", status: "ok", statusDate: "2026-03-10", validUntil: "2027-03-10", year: null, note: "conferida; ok" },
        { associateId: id(2), relativeId: null, itemId: "i2", status: "ok", statusDate: null, validUntil: null, year: 2026, note: null },
        { associateId: id(3), relativeId: null, itemId: "i2", status: "desatualizado", statusDate: null, validUntil: null, year: 2024, note: null },
        { associateId: id(1), relativeId: null, itemId: "i3", status: "ok", statusDate: null, validUntil: "2027-03-31", year: null, note: null },
        { associateId: id(1), relativeId: null, itemId: "i4", status: "nao_se_aplica", statusDate: null, validUntil: null, year: null, note: null },
        { associateId: null, relativeId: "r1", itemId: "i4", status: "convidado", statusDate: null, validUntil: null, year: null, note: null },
      ],
    };
    const result = planBatch([readImportFile("itens-controle.csv", itemsCsv(state)).file!, readImportFile("controle.csv", controlsCsv(state)).file!],
      state, { filhotes: false, today: "2026-11-24" });
    expect(result.errors).toEqual([]);
    for (const file of result.files) expect(file.rows.map((row) => [row.label, row.action, row.errors])).toEqual(file.rows.map((row) => [row.label, "igual", []]));
  });
});
