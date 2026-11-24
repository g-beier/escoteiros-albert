import { describe, expect, it } from "vitest";
import { peopleCsv, sectionsCsv } from "@/lib/import/export";
import { planBatch } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import { EMPTY_INVENTORY, EMPTY_LIFE, type ImportState } from "@/lib/import/state";

const STATE: ImportState = {
  functions: [], relatives: [], links: [], items: [], statuses: [], life: EMPTY_LIFE, inventory: EMPTY_INVENTORY,
  sections: [{ id: "s1", branch: "escoteiro", name: "Tropa Tupã", active: true }],
  patrols: [{ id: "p1", sectionId: "s1", name: "Patrulha Lobo", active: false }],
  people: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Bruno Lima", nickname: "Bru", birth: "2012-09-02", branch: "escoteiro", sectionId: "s1", patrolId: "p1",
      registration: "definitivo", joined: "2024-02-05", promise: "2024-06-01", active: true, left: null, notes: "Observação; com separador" },
    { id: "00000000-0000-4000-8000-000000000002", name: "Daniel Rocha", nickname: null, birth: null, branch: "adulto", sectionId: null, patrolId: null,
      registration: "provisorio", joined: null, promise: null, active: false, left: "2025-12-20", notes: null },
  ],
};

describe("exportar e reimportar", () => {
  it("dá tudo igual", () => {
    const people = peopleCsv([
      { id: STATE.people[0]!.id, name: "Bruno Lima", nickname: "Bru", birth_date: "2012-09-02", branch: "escoteiro", section: "Tropa Tupã", patrol: "Patrulha Lobo",
        registration: "definitivo", joined_on: "2024-02-05", promise_date: "2024-06-01", active: true, left_on: null, notes: "Observação; com separador" },
      { id: STATE.people[1]!.id, name: "Daniel Rocha", nickname: null, birth_date: null, branch: "adulto", section: null, patrol: null,
        registration: "provisorio", joined_on: null, promise_date: null, active: false, left_on: "2025-12-20", notes: null },
    ]);
    const sections = sectionsCsv([{ branch: "escoteiro", section: "Tropa Tupã", patrol: null, active: true }, { branch: "escoteiro", section: "Tropa Tupã", patrol: "Patrulha Lobo", active: false }]);
    const files = [readImportFile("pessoas.csv", people).file!, readImportFile("secoes.csv", sections).file!];
    const plan = planBatch(files, STATE, { filhotes: false, today: "2026-11-24" });
    expect(plan.errors).toEqual([]);
    for (const file of plan.files) {
      expect(file.rows.map((row) => [row.action, row.errors, row.warnings])).toEqual(file.rows.map(() => ["igual", [], []]));
      expect(file.payload).toEqual([]);
    }
  });
});

describe("exportar e reimportar funções e responsáveis", () => {
  it("dá tudo igual", async () => {
    const { functionsCsv, relativesCsv } = await import("@/lib/import/export");
    const adult = { id: "00000000-0000-4000-8000-000000000003", name: "Carla Dias", nickname: null, birth: "1985-11-21", branch: "adulto", sectionId: null, patrolId: null,
      registration: "definitivo", joined: null, promise: null, active: true, left: null, notes: null };
    const state: ImportState = {
      ...STATE,
      people: [...STATE.people, adult],
      functions: [
        { id: "f1", associateId: adult.id, kind: "escotista", title: "Chefe", sectionId: "s1", started: "2019-03-01", ended: null, elected: false },
        { id: "f2", associateId: adult.id, kind: "dirigente", title: null, sectionId: null, started: null, ended: "2024-12-31", elected: true },
      ],
      relatives: [{ id: "r1", name: "Marta Lima", associateId: null, notes: "Avisar antes" }, { id: "r2", name: "Carla Dias", associateId: adult.id, notes: null }],
      links: [
        { id: "l1", associateId: STATE.people[0]!.id, relativeId: "r1", kinship: "mae", kinshipNote: null, legal: true, financial: false },
        { id: "l2", associateId: STATE.people[0]!.id, relativeId: "r2", kinship: "outro", kinshipNote: "tia", legal: false, financial: true },
      ],
    };
    const functions = functionsCsv([
      { person_id: adult.id, person: "Carla Dias", birth_date: "1985-11-21", kind: "escotista", title: "Chefe", section: "Tropa Tupã", started_on: "2019-03-01", ended_on: null, elected: false },
      { person_id: adult.id, person: "Carla Dias", birth_date: "1985-11-21", kind: "dirigente", title: null, section: null, started_on: null, ended_on: "2024-12-31", elected: true },
    ]);
    const relatives = relativesCsv([
      { youth_id: STATE.people[0]!.id, youth: "Bruno Lima", youth_birth: "2012-09-02", relative: "Marta Lima", kinship: "mae", kinship_note: null, legal: true, financial: false, relative_associate: null, notes: "Avisar antes" },
      { youth_id: STATE.people[0]!.id, youth: "Bruno Lima", youth_birth: "2012-09-02", relative: "Carla Dias", kinship: "outro", kinship_note: "tia", legal: false, financial: true, relative_associate: "Carla Dias", notes: null },
    ]);
    const plan = planBatch([readImportFile("funcoes.csv", functions).file!, readImportFile("responsaveis.csv", relatives).file!], state, { filhotes: false, today: "2026-11-24" });
    expect(plan.errors).toEqual([]);
    for (const file of plan.files) expect(file.rows.map((row) => [row.action, row.errors])).toEqual(file.rows.map(() => ["igual", []]));
  });
});
