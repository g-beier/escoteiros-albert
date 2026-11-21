import { describe, expect, it } from "vitest";
import { buildDoc13 } from "./doc13";
import { doc10Input } from "./doc10.fixture";

// Nomes fictícios (fixture do Doc 10, com nascimentos). Hoje: 20/11/2026.

const births: Record<string, string> = {
  bia: "2019-03-16", caio: "2016-05-10", davi: "2015-10-22", isa: "2012-09-05", sol: "2016-11-21",
};
const input = {
  today: doc10Input.today,
  sections: [...doc10Input.sections, { id: "cla", branch: "pioneiro" as const, name: "Clã Pioneiro", active: true }],
  associates: doc10Input.associates.map((a) => ({ ...a, birth_date: births[a.id] ?? null })),
};

describe("Doc 13", () => {
  const doc = buildDoc13(input);

  it("só jovens, por seção; seções vazias aparecem; faixa de idade no título", () => {
    expect(doc.sections.map((s) => s.label)).toEqual([
      "ALCATEIA (6,5 - 10 anos)", "TROPA (10 - 14 anos)", "ESCOTEIRO (SEM SEÇÃO) (10 - 14 anos)", "CLÃ PIONEIRO (18 - 22 anos)",
    ]);
    expect(doc.sections[3].rows).toEqual([]);
  });

  it("do mais novo ao mais velho, com idade em anos e meses e período de transição", () => {
    const [alcateia, tropa] = doc.sections;
    expect(alcateia.rows.map((r) => [r.name, r.birth, r.age, r.period, r.current, !!r.red])).toEqual([
      ["Bia Lobinha", "16/03/2019", "7 anos e 8 meses", "mar. 2029 - mar. 2030", false, false],
      ["Caio Lobinho", "10/05/2016", "10 anos e 6 meses", "maio 2026 - maio 2027", true, true],
    ]);
    // escoteiro: período dos 14 aos 15; Isa já fez 14 (vigente), Sol e Davi ainda não
    expect(tropa.rows.map((r) => [r.name, r.current])).toEqual([["Sol Escoteira", false], ["Davi Escoteiro", false], ["Isa Escoteira", true]]);
    expect(tropa.rows[0].period).toBe("nov. 2030 - nov. 2031");
    expect(tropa.rows[2].period).toBe("set. 2026 - set. 2027");
  });

  it("sem nascimento: traço e sem período, no fim", () => {
    const loose = doc.sections[2];
    expect(loose.rows).toEqual([{ id: "leo", name: "Leo Solto", birth: null, age: "—", period: null, current: false }]);
  });
});
