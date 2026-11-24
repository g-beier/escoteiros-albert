import { describe, expect, it } from "vitest";
import { peopleCsv, sectionsCsv } from "@/lib/import/export";
import { planBatch } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import type { ImportState } from "@/lib/import/state";

const STATE: ImportState = {
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
