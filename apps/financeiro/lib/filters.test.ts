import { describe, expect, it } from "vitest";
import { ALL_DATES, defaultFrom, hasAnyFilter, likePattern, listValues, parseFilters, parseOrder } from "./filters";

const id = "0b6c7a4e-5d1f-4c1e-9a8b-2f3d4e5f6a7b";
const id2 = "1b6c7a4e-5d1f-4c1e-9a8b-2f3d4e5f6a7c";

describe("parseFilters", () => {
  it("lê filtros com vários valores", () => {
    expect(parseFilters({ de: "2026-01-01", ate: "2026-01-31", forma: `${id},${id2}`, pasta: "pendente", associado: `${id},nenhum`, rubrica: id, q: " lanche " })).toEqual({
      from: "2026-01-01", to: "2026-01-31", paymentMethodIds: [id, id2], folder: "pendente",
      associateIds: [id], withoutAssociate: true, categoryIds: [id], q: "lanche",
    });
  });

  it("começa em 1º de janeiro do ano atual por padrão; de=tudo remove o limite", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect(parseFilters({}, now).from).toBe("2026-01-01");
    expect(parseFilters({ de: ALL_DATES }, now).from).toBeUndefined();
    expect(defaultFrom(new Date("2027-01-01T01:00:00Z"))).toBe("2026-01-01"); // ainda 31/12 em São Paulo
  });

  it("descarta valores malformados", () => {
    expect(parseFilters({ de: "01/01/2026", forma: "x", pasta: "talvez", rubrica: "' or 1=1", q: "  " })).toEqual({
      from: defaultFrom(), to: undefined, paymentMethodIds: [], folder: undefined, associateIds: [], withoutAssociate: false, categoryIds: [], q: undefined,
    });
  });

  it("trata as duas opções de pasta como sem filtro", () => {
    expect(parseFilters({ pasta: "pendente,na-pasta" }).folder).toBeUndefined();
    expect(parseFilters({ pasta: ["na-pasta"] }).folder).toBe("na-pasta");
  });

  it("limita a busca", () => expect(parseFilters({ q: "a".repeat(300) }).q).toHaveLength(100));
});

describe("listValues", () => {
  it("aceita vírgulas e parâmetros repetidos, sem duplicados", () => {
    expect(listValues(["a,b", "b", " c ", ""])).toEqual(["a", "b", "c"]);
    expect(listValues(undefined)).toEqual([]);
  });
});

describe("likePattern", () => {
  it("escapa curingas", () => expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%"));
});

describe("hasAnyFilter", () => {
  it("detecta filtros ativos", () => {
    expect(hasAnyFilter(parseFilters({}))).toBe(true); // início do ano atual por padrão
    const empty = parseFilters({ de: ALL_DATES });
    expect(hasAnyFilter(empty)).toBe(false);
    expect(hasAnyFilter({ ...empty, withoutAssociate: true })).toBe(true);
    expect(hasAnyFilter({ ...empty, categoryIds: [id] })).toBe(true);
  });
});

describe("parseOrder", () => {
  it("usa mais recentes primeiro por padrão", () => {
    expect(parseOrder({})).toBe("desc");
    expect(parseOrder({ ordem: "antigos" })).toBe("asc");
  });
});
