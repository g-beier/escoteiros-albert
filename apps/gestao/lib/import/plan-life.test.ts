import { describe, expect, it } from "vitest";
import { planBatch } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import { EMPTY_LIFE, EMPTY_STATE, type ImportState, type StatePerson } from "@/lib/import/state";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const person = (n: number, over: Partial<StatePerson>): StatePerson => ({
  id: id(n), name: `Pessoa ${n}`, nickname: null, birth: null, branch: "escoteiro", sectionId: null, patrolId: null,
  registration: "definitivo", joined: null, promise: null, active: true, left: null, notes: null, ...over,
});

const STATE: ImportState = {
  ...EMPTY_STATE,
  people: [person(1, { name: "Bruno Lima" }), person(2, { name: "Lia Lima" })],
  life: {
    ...EMPTY_LIFE,
    periods: [
      { associateId: id(1), branch: "lobinho", started: "2020-02-01", ended: "2023-03-01", place: null },
      { associateId: id(1), branch: "escoteiro", started: "2023-03-01", ended: null, place: null },
      { associateId: id(2), branch: "lobinho", started: "2024-03-01", ended: null, place: null },
    ],
    events: [{ associateId: id(1), date: "2024-11-10", title: "Lis de Ouro", description: null }],
  },
};

const plan = (text: string) => planBatch([readImportFile("vida-escoteira.csv", text).file!], STATE, { filhotes: false, today: "2026-11-24" }).files[0]!;
const HEADER = "pessoa;tipo;ramo;início;fim;outro grupo;motivo;data;título;descrição;estrela;entregue em";

describe("vida-escoteira.csv", () => {
  it("igual quando os fatos do tipo batem; substitui só os tipos presentes", () => {
    const file = plan([HEADER,
      "Bruno Lima;período;lobinho;02/2020;02/2023;;;;;;;",
      "Bruno Lima;período;escoteiro;03/2023;;;;;;;;",
      "Lia Lima;período;lobinho;03/2024;06/2025;;;;;;;",
      "Lia Lima;período;escoteiro;07/2025;;;;;;;;",
      "Lia Lima;estrela;;;;;;;;;1;20/06/2025",
      "Lia Lima;anotação;;;;;;;;Veio da Alcateia de outro grupo.;;",
    ].join("\n"));
    expect(file.rows.map((row) => row.action)).toEqual(["igual", "igual", "atualiza", "atualiza", "nova", "nova"]);
    expect(file.rows[2]!.warnings).toEqual(["substitui 1 período de Lia Lima no app"]);
    expect(file.payload).toEqual([{
      line: 4, personId: id(2),
      periods: [
        { branch: "lobinho", started_on: "2024-03-01", ended_on: "2025-07-01", place: null },
        { branch: "escoteiro", started_on: "2025-07-01", ended_on: null, place: null },
      ],
      stars: [{ star: 1, branch: null, delivered: "2025-06-20" }],
      notes: "Veio da Alcateia de outro grupo.",
    }]);
  });

  it("sobreposição ou erro numa linha tira a pessoa inteira", () => {
    const file = plan([HEADER,
      "Bruno Lima;período;lobinho;02/2020;;;;;;;;",
      "Bruno Lima;período;escoteiro;03/2023;;;;;;;;",
      "Bruno Lima;evento;;;;;;10/11/2024;Lis de Ouro;;;",
      "Lia Lima;exclusão;;04/2025;04/2025;;licença;;;;;",
      "Lia Lima;evento;;;;;;;Sem data;;;",
    ].join("\n"));
    expect(file.rows.map((row) => row.errors[0])).toEqual([
      "Bruno Lima fica de fora: corrija a linha 3", "sobrepõe o período da linha 2", "Bruno Lima fica de fora: corrija a linha 3",
      "licença só conta acima de 60 dias", "evento sem data",
    ]);
    expect(file.payload).toEqual([]);
  });
});

describe("exportar e reimportar a vida escoteira", () => {
  it("dá tudo igual", async () => {
    const { lifeCsv } = await import("@/lib/import/export");
    const state: ImportState = {
      ...STATE,
      life: {
        periods: [...STATE.life.periods, { associateId: id(2), branch: "adulto", started: "2010-05-15", ended: "2012-08-20", place: "Grupo Exemplo" }],
        exclusions: [{ associateId: id(1), started: "2024-04-01", ended: "2024-09-01", reason: "licenca", note: null }],
        events: STATE.life.events,
        stars: [{ associateId: id(1), star: 1, branch: "lobinho", delivered: "2021-06-20" }],
        notes: { [id(2)]: "Linha um.\nLinha dois; com separador" },
      },
    };
    const file = planBatch([readImportFile("vida-escoteira.csv", lifeCsv(state)).file!], state, { filhotes: false, today: "2026-11-24" }).files[0]!;
    expect(file.rows.map((row) => [row.label, row.action, row.errors])).toEqual(file.rows.map((row) => [row.label, "igual", []]));
  });
});
