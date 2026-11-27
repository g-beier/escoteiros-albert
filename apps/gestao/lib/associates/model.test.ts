import { describe, expect, it } from "vitest";
import {
  activityPeriods,
  ageInYears,
  ageInYearsMonths,
  ageLabel,
  ageYearsMonthsLabel,
  nextBranch,
  patrolChoices,
  placementLabel,
  placementOptions,
  placementValue,
  resolvePlacement,
  sectionChoices,
  statusFilter,
} from "./model";
import { FILHOTES_ENABLED } from "@/lib/features";

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
    // o Filhote só aparece com o ramo ligado (lib/features.ts)
    expect(placementOptions(sections, patrols).map((o) => `${o.depth}:${o.name}`)).toEqual([
      ...(FILHOTES_ENABLED ? ["0:Filhote"] : []),
      "0:Lobinho",
      "1:Alcateia Seeonee",
      "0:Escoteiro",
      "1:Tropa Tupã",
      "2:Lobo",
      "0:Sênior",
      "0:Pioneiro",
      "1:Clã Sol",
      "0:Adulto",
    ]);
  });
  it("mantém a divisão atual mesmo fora das regras", () => {
    const values = placementOptions(sections, patrols, { sectionId: "s5", patrolId: "p3" }).map((o) => o.value);
    expect(values).toContain("p:p3");
    expect(placementOptions(sections, patrols, { sectionId: "s6" }).map((o) => o.value)).toContain("s:s6");
  });
  it("passagem: só o ramo seguinte, com suas seções e equipes", () => {
    expect(placementOptions(sections, patrols, undefined, "escoteiro").map((o) => `${o.depth}:${o.name}`)).toEqual([
      "0:Escoteiro",
      "1:Tropa Tupã",
      "2:Lobo",
    ]);
    expect(nextBranch("lobinho")).toBe("escoteiro");
    expect(nextBranch("pioneiro")).toBe("adulto");
    expect(nextBranch("filhote")).toBe("lobinho");
    expect(nextBranch("adulto")).toBeNull();
  });
  it("a equipe define a seção e o ramo; a seção define o ramo", () => {
    expect(resolvePlacement("p:p1", sections, patrols)).toEqual({
      branch: "escoteiro",
      sectionId: "s2",
      patrolId: "p1",
    });
    expect(resolvePlacement("s:s1", sections, patrols)).toEqual({ branch: "lobinho", sectionId: "s1", patrolId: "" });
    expect(resolvePlacement("b:adulto", sections, patrols)).toEqual({ branch: "adulto", sectionId: "", patrolId: "" });
    expect(resolvePlacement("", sections, patrols)).toEqual({ branch: "", sectionId: "", patrolId: "" });
  });
  it("valor e rótulo", () => {
    expect(placementValue({ branch: "escoteiro", sectionId: "s2", patrolId: "p1" })).toBe("p:p1");
    expect(placementValue({ branch: "adulto", sectionId: "", patrolId: "" })).toBe("b:adulto");
    expect(placementLabel({ branch: "escoteiro", section: "Tropa Tupã", patrol: "Lobo" })).toBe(
      "Escoteiro › Tropa Tupã › Lobo",
    );
    expect(placementLabel({ branch: "adulto", section: null, patrol: null })).toBe("Adulto");
  });
});

describe("idade e períodos", () => {
  it("conta anos completos", () => {
    expect(ageInYears("2014-05-20", "2026-05-19")).toBe(11);
    expect(ageInYears("2014-05-20", "2026-05-20")).toBe(12);
    expect(ageInYears("2014-02-28", "2026-03-01")).toBe(12);
    expect(ageInYears(null, "2026-05-20")).toBeNull();
    expect(ageInYears("2027-01-01", "2026-05-20")).toBeNull();
    expect(ageLabel(1)).toBe("1 ano");
    expect(ageLabel(null)).toBe("—");
  });
  it("conta anos e meses completos", () => {
    expect(ageInYearsMonths("2016-07-20", "2026-11-19")).toEqual({ years: 10, months: 3 });
    expect(ageInYearsMonths("2016-07-19", "2026-11-19")).toEqual({ years: 10, months: 4 });
    expect(ageInYearsMonths("2016-11-20", "2026-11-19")).toEqual({ years: 9, months: 11 });
    expect(ageInYearsMonths("2027-01-01", "2026-11-19")).toBeNull();
    expect(ageYearsMonthsLabel({ years: 10, months: 4 })).toBe("10 anos e 4 meses");
    expect(ageYearsMonthsLabel({ years: 1, months: 1 })).toBe("1 ano e 1 mês");
    expect(ageYearsMonthsLabel({ years: 10, months: 0 })).toBe("10 anos");
    expect(ageYearsMonthsLabel(null)).toBe("—");
  });
  it("monta os períodos a partir das entradas e saídas", () => {
    const m = (id: string, kind: "entrada" | "saida", date: string) => ({
      id,
      kind,
      movement_date: date,
      reason: null,
      created_at: `${date}T00:00:00Z`,
    });
    const periods = activityPeriods([
      m("c", "entrada", "2024-03-01"),
      m("a", "entrada", "2020-02-01"),
      m("b", "saida", "2023-12-10"),
    ]);
    expect(periods.map((p) => [p.start?.id ?? null, p.end?.id ?? null])).toEqual([
      ["a", "b"],
      ["c", null],
    ]);
    expect(activityPeriods([m("x", "saida", "2022-01-01")]).map((p) => [p.start, p.end?.id])).toEqual([[null, "x"]]);
  });
  it("lê a situação da URL", () => {
    expect(statusFilter(undefined)).toBe("ativos");
    expect(statusFilter("desligados")).toBe("desligados");
    expect(statusFilter("x")).toBe("ativos");
  });
});
