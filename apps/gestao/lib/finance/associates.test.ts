import { describe, expect, it } from "vitest";
import { matchesSection, NO_SECTION_PARAM, sectionsOf } from "./associates";

const people = [
  { name: "bruno", section: "Tropa Tupã" },
  { name: "Ana", section: "Alcateia" },
  { name: "Érica", section: null },
  { name: "Carla", section: "Alcateia " },
  { name: "Diego", section: "" },
];

describe("seções", () => {
  it("lista as seções em ordem, sem seção por último", () => {
    expect(sectionsOf(people)).toEqual(["Alcateia", "Tropa Tupã", null]);
  });
  it("filtra por seção ou sem seção", () => {
    expect(people.filter((p) => matchesSection(p, "Alcateia")).map((p) => p.name)).toEqual(["Ana", "Carla"]);
    expect(people.filter((p) => matchesSection(p, NO_SECTION_PARAM)).map((p) => p.name)).toEqual(["Érica", "Diego"]);
    expect(people.filter((p) => matchesSection(p, undefined))).toHaveLength(5);
  });
});
