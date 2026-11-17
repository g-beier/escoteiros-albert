import { describe, expect, it } from "vitest";
import { groupBySection, matchesSection, NO_SECTION_PARAM, patrolChoices, placementLabel, placementOptions, placementValue, resolvePlacement, sectionChoices, sectionsOf } from "./associates";

const people = [
  { name: "bruno", section: "Tropa Tupã" }, { name: "Ana", section: "Alcateia" }, { name: "Érica", section: null },
  { name: "Carla", section: "Alcateia " }, { name: "Diego", section: "" },
];

describe("seções", () => {
  it("lista as seções em ordem, sem seção por último", () => {
    expect(sectionsOf(people)).toEqual(["Alcateia", "Tropa Tupã", null]);
  });
  it("agrupa e ordena por nome", () => {
    expect(groupBySection(people).map((g) => [g.section, g.members.map((m) => m.name)])).toEqual([
      ["Alcateia", ["Ana", "Carla"]], ["Tropa Tupã", ["bruno"]], [null, ["Diego", "Érica"]],
    ]);
  });
  it("filtra por seção ou sem seção", () => {
    expect(people.filter((p) => matchesSection(p, "Alcateia")).map((p) => p.name)).toEqual(["Ana", "Carla"]);
    expect(people.filter((p) => matchesSection(p, NO_SECTION_PARAM)).map((p) => p.name)).toEqual(["Érica", "Diego"]);
    expect(people.filter((p) => matchesSection(p, undefined))).toHaveLength(5);
  });
});

describe("seções cadastradas", () => {
  const sections = [
    { id: "s1", branch: "lobinho" as const, name: "Alcateia Seeonee", active: true },
    { id: "s2", branch: "escoteiro" as const, name: "Tropa Tupã", active: true },
    { id: "s3", branch: "escoteiro" as const, name: "Tropa Antiga", active: false },
    { id: "s4", branch: "escoteiro" as const, name: "Tropa Arariboia", active: true },
  ];
  const patrols = [
    { id: "p1", sectionId: "s2", name: "Lobo", active: true },
    { id: "p2", sectionId: "s2", name: "Águia", active: false },
  ];
  it("lista ativas do ramo e mantém a atual inativa", () => {
    expect(sectionChoices(sections, "escoteiro").map((s) => s.id)).toEqual(["s4", "s2"]);
    expect(sectionChoices(sections, "escoteiro", "s3").map((s) => s.id)).toEqual(["s3", "s4", "s2"]);
  });
  it("patrulhas da seção", () => {
    expect(patrolChoices(patrols, "s2").map((p) => p.id)).toEqual(["p1"]);
    expect(patrolChoices(patrols, "s2", "p2").map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(patrolChoices(patrols, "")).toEqual([]);
  });
});

describe("divisão (seleção única Ramo › Seção › Equipe)", () => {
  const sections = [
    { id: "s1", branch: "lobinho" as const, name: "Alcateia Seeonee", active: true },
    { id: "s2", branch: "escoteiro" as const, name: "Tropa Tupã", active: true },
    { id: "s5", branch: "pioneiro" as const, name: "Clã Sol", active: true },
    { id: "s6", branch: "adulto" as const, name: "Diretoria", active: true },
  ];
  const patrols = [
    { id: "p1", sectionId: "s2", name: "Lobo", active: true },
    { id: "p3", sectionId: "s5", name: "Indevida", active: true },
  ];

  it("monta a hierarquia: Adulto e Clã sem divisões abaixo", () => {
    expect(placementOptions(sections, patrols).map((o) => `${o.depth}:${o.name}`)).toEqual([
      "0:Lobinho", "1:Alcateia Seeonee", "0:Escoteiro", "1:Tropa Tupã", "2:Lobo", "0:Sênior", "0:Pioneiro", "1:Clã Sol", "0:Adulto",
    ]);
  });
  it("mantém a divisão atual mesmo fora das regras", () => {
    const values = placementOptions(sections, patrols, { sectionId: "s5", patrolId: "p3" }).map((o) => o.value);
    expect(values).toContain("p:p3");
    expect(placementOptions(sections, patrols, { sectionId: "s6" }).map((o) => o.value)).toContain("s:s6");
  });
  it("a equipe define a seção e o ramo; a seção define o ramo", () => {
    expect(resolvePlacement("p:p1", sections, patrols)).toEqual({ branch: "escoteiro", sectionId: "s2", patrolId: "p1" });
    expect(resolvePlacement("s:s1", sections, patrols)).toEqual({ branch: "lobinho", sectionId: "s1", patrolId: "" });
    expect(resolvePlacement("b:adulto", sections, patrols)).toEqual({ branch: "adulto", sectionId: "", patrolId: "" });
    expect(resolvePlacement("", sections, patrols)).toEqual({ branch: "", sectionId: "", patrolId: "" });
  });
  it("valor e rótulo", () => {
    expect(placementValue({ branch: "escoteiro", sectionId: "s2", patrolId: "p1" })).toBe("p:p1");
    expect(placementValue({ branch: "adulto", sectionId: "", patrolId: "" })).toBe("b:adulto");
    expect(placementLabel({ branch: "escoteiro", section: "Tropa Tupã", patrol: "Lobo" })).toBe("Escoteiro › Tropa Tupã › Lobo");
    expect(placementLabel({ branch: "adulto", section: null, patrol: null })).toBe("Adulto");
  });
});
