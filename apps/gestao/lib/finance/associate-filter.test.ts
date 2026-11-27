import { describe, expect, it } from "vitest";
import { buildAssociateFilterData, expandDivisionTokens, isDivisionToken } from "./associate-filter";
import { encodeCategorySelection } from "./categories";
import { DIVISION_PARAM, hasAnyFilter, parseFilters } from "./filters";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [alcateia, tropa, matilhaA, matilhaB, cla] = [uuid(901), uuid(902), uuid(903), uuid(904), uuid(905)];
const [ana, bia, caio, davi, eva, fabio, gil] = [1, 2, 3, 4, 5, 6, 7].map(uuid);

const person = (
  id: string,
  name: string,
  branch: string,
  section_id: string | null = null,
  patrol_id: string | null = null,
  active = true,
) => ({ id, name, active, branch, section_id, patrol_id });

const data = buildAssociateFilterData({
  associates: [
    person(ana, "Ana", "lobinho", alcateia, matilhaA),
    person(bia, "Bia", "lobinho", alcateia, matilhaB),
    person(caio, "Caio", "lobinho", alcateia),
    person(davi, "Davi", "lobinho"),
    person(eva, "Eva", "escoteiro", tropa),
    person(fabio, "Fábio", "adulto"),
    person(gil, "Gil", "senior", cla, null, false),
  ],
  sections: [
    { id: tropa, branch: "escoteiro", name: "Tropa" },
    { id: alcateia, branch: "lobinho", name: "Alcateia" },
    { id: cla, branch: "senior", name: "Clã só de inativos" },
  ],
  patrols: [
    { id: matilhaB, section_id: alcateia, name: "Branca" },
    { id: matilhaA, section_id: alcateia, name: "Amarela" },
  ],
});

describe("buildAssociateFilterData", () => {
  it("monta só os nós Ramo › Seção › Equipe com algum ativo, ramos na ordem do POR", () => {
    expect(data.divisions.map((item) => `${"  ".repeat(item.depth)}${item.label}`)).toEqual([
      "(Sem associado)",
      "Lobinho",
      "  Alcateia",
      "    Amarela",
      "    Branca",
      "  Sem seção",
      "Escoteiro",
      "  Tropa",
      "Adultos",
    ]);
    expect(data.divisions.map((item) => item.id)).not.toContain("n:adulto");
  });

  it("lista todas as pessoas (ativas e inativas) por nome e guarda onde cada ativo está", () => {
    expect(data.people).toEqual([
      { id: ana, name: "Ana", active: true },
      { id: bia, name: "Bia", active: true },
      { id: caio, name: "Caio", active: true },
      { id: davi, name: "Davi", active: true },
      { id: eva, name: "Eva", active: true },
      { id: fabio, name: "Fábio", active: true },
      { id: gil, name: "Gil", active: false },
    ]);
    expect(data.members).toEqual({
      [`e:${matilhaA}`]: [ana],
      [`e:${matilhaB}`]: [bia],
      [`s:${alcateia}`]: [caio],
      "n:lobinho": [davi],
      [`s:${tropa}`]: [eva],
      "r:adulto": [fabio],
    });
  });
});

describe("tokens de divisão", () => {
  it("reconhece nós e exclusões, não IDs soltos nem lixo", () => {
    for (const token of [
      `s:${alcateia}`,
      `e:${matilhaA}`,
      "r:lobinho",
      "n:escoteiro",
      "nenhum",
      `-s:${alcateia}`,
      "-nenhum",
    ])
      expect(isDivisionToken(token)).toBe(true);
    for (const token of [ana, `-${ana}`, "d", "r:outro", "s:x", "' or 1=1"]) expect(isDivisionToken(token)).toBe(false);
  });

  it("parseFilters lê divisao separado de associado", () => {
    const filters = parseFilters({ [DIVISION_PARAM]: `s:${alcateia},-e:${matilhaB},r:bobagem,${ana}`, associado: eva });
    expect(filters.divisionTokens).toEqual([`s:${alcateia}`, `-e:${matilhaB}`]);
    expect(filters.associateIds).toEqual([eva]);
    expect(parseFilters({ associado: ana }).divisionTokens).toBeUndefined();
    expect(parseFilters({ [DIVISION_PARAM]: "nenhum" }).withoutAssociate).toBe(false); // resolvido no servidor
    expect(hasAnyFilter({ ...parseFilters({ de: "tudo" }), divisionTokens: ["r:adulto"] })).toBe(true);
  });

  it("expande nós em associados ativos, com exclusões e (Sem associado)", () => {
    expect(expandDivisionTokens([`s:${alcateia}`], data)).toEqual({
      associateIds: [caio, ana, bia],
      withoutAssociate: false,
    });
    expect(expandDivisionTokens([`s:${alcateia}`, `-e:${matilhaB}`], data).associateIds).toEqual([caio, ana]);
    expect(expandDivisionTokens(["r:lobinho", `-s:${alcateia}`], data).associateIds).toEqual([davi]);
    expect(expandDivisionTokens(["nenhum", "r:adulto"], data)).toEqual({
      associateIds: [fabio],
      withoutAssociate: true,
    });
    expect(expandDivisionTokens([`s:${uuid(999)}`], data)).toEqual({ associateIds: [], withoutAssociate: false });
  });

  it("marcar uma seção inteira vira um token só na URL, e volta igual", () => {
    const encoded = encodeCategorySelection([`s:${alcateia}`, `e:${matilhaA}`, `e:${matilhaB}`], data.divisions);
    expect(encoded).toEqual([`s:${alcateia}`]);
    expect(expandDivisionTokens(encoded, data).associateIds).toEqual([caio, ana, bia]);
  });
});
