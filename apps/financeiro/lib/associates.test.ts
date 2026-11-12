import { describe, expect, it } from "vitest";
import { defaultSectionFor, groupBySection, matchesSection, NO_SECTION_PARAM, patrolChoices, sectionChoices, sectionsOf } from "./associates";

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
  it("pré-seleciona a seção quando o ramo tem uma só ativa", () => {
    expect(defaultSectionFor(sections, "lobinho")).toBe("s1");
    expect(defaultSectionFor(sections, "escoteiro")).toBe("");
    expect(defaultSectionFor(sections, "senior")).toBe("");
  });
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
