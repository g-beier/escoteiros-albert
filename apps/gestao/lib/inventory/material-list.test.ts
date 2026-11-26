import { describe, expect, it } from "vitest";
import {
  compareLines, conditionBreakdown, hiddenColumns, listQuery, matchesFilters, materialsBackHref, materialsHref, parseListState, withBack,
  type ListFilters, type ListLine,
} from "./material-list";

const line = (name: string, over: Partial<ListLine> = {}): ListLine => ({
  material: { name, minimum_quantity: null, below_minimum: false }, quantity: 1, value_cents: 0, next_expiry: null, worst_condition: null, conditions: {},
  min_unit_cents: null, max_unit_cents: null, previous: [null, null], ...over,
});
const none: ListFilters = { conditions: [], minimum: [], expiry: [], unitFrom: null, unitTo: null, qtyFrom: null, qtyTo: null };

describe("materialsHref / materialsBackHref", () => {
  it("mantém só as chaves conhecidas, na ordem da lista", () => {
    expect(materialsHref({ ordem: "total", q: "panela", foo: "x", estado: "" })).toBe("/inventario/materiais?q=panela&ordem=total");
    expect(materialsHref({ divisao: "abc", q: "a" }, ["divisao"])).toBe("/inventario/materiais?q=a");
    expect(listQuery(new URLSearchParams("dir=desc&ordem=quantidade"))).toBe("ordem=quantidade&dir=desc");
  });
  it("volta para a lista com os filtros", () => {
    expect(materialsBackHref("/inventario/materiais?divisao=abc&estado=ruim,regular")).toBe("/inventario/materiais?divisao=abc&estado=ruim%2Cregular");
    expect(materialsBackHref(undefined)).toBe("/inventario/materiais");
  });
  it("descarta destinos externos e chaves desconhecidas", () => {
    expect(materialsBackHref("//evil.test")).toBe("/inventario/materiais");
    expect(materialsBackHref("https://evil.test/inventario/materiais")).toBe("/inventario/materiais");
    expect(materialsBackHref("/inventario/materiais/../../x")).toBe("/inventario/materiais");
    expect(materialsBackHref("/inventario/materiais?next=//evil.test&q=ok")).toBe("/inventario/materiais?q=ok");
  });
  it("acrescenta voltar só quando há filtros", () => {
    expect(withBack("/inventario/materiais/1", "/inventario/materiais")).toBe("/inventario/materiais/1");
    expect(withBack("/inventario/materiais/1", "/inventario/materiais?q=a b")).toBe("/inventario/materiais/1?voltar=%2Finventario%2Fmateriais%3Fq%3Da%20b");
  });
});

describe("parseListState", () => {
  it("lê filtros e ordem, ignorando valores inválidos", () => {
    expect(parseListState({ estado: "ruim,xyz,bom", unitario_de: "10,50", unitario_ate: "-1", qtd_de: "2", qtd_ate: "a", ordem: "total", dir: "desc" }))
      .toEqual({ conditions: ["ruim", "bom"], minimum: [], expiry: [], unitFrom: 1050, unitTo: null, qtyFrom: 2, qtyTo: null, sort: "total", dir: "desc" });
    expect(parseListState({ ordem: "foo" })).toMatchObject({ sort: "posicao", dir: "asc" });
    expect(parseListState({ ordem: "material" })).toMatchObject({ sort: "material" });
  });
});

describe("matchesFilters", () => {
  it("estado: alguma das condições escolhidas", () => {
    const mixed = line("Panela", { conditions: { bom: 3, ruim: 1 } });
    expect(matchesFilters(mixed, { ...none, conditions: ["ruim"] })).toBe(true);
    expect(matchesFilters(mixed, { ...none, conditions: ["regular", "inservivel"] })).toBe(false);
  });
  it("valor unitário: a faixa da linha cruza a pedida; sem valor fica de fora", () => {
    const range = line("Panela", { min_unit_cents: 500, max_unit_cents: 800 });
    expect(matchesFilters(range, { ...none, unitFrom: 700 })).toBe(true);
    expect(matchesFilters(range, { ...none, unitFrom: 900 })).toBe(false);
    expect(matchesFilters(range, { ...none, unitTo: 400 })).toBe(false);
    expect(matchesFilters(line("Sem valor"), { ...none, unitTo: 400 })).toBe(false);
  });
  it("mínimo: abaixo, no mínimo ou sem mínimo (pelo total do material)", () => {
    const below = line("A", { material: { name: "A", minimum_quantity: 5, below_minimum: true } });
    const ok = line("B", { material: { name: "B", minimum_quantity: 1, below_minimum: false } });
    expect(matchesFilters(below, { ...none, minimum: ["abaixo"] })).toBe(true);
    expect(matchesFilters(ok, { ...none, minimum: ["abaixo"] })).toBe(false);
    expect(matchesFilters(line("C"), { ...none, minimum: ["sem", "ok"] })).toBe(true);
  });
  it("validade: vencidos, não vencidos, sem validade", () => {
    expect(matchesFilters(line("A", { next_expiry: "2000-01-01" }), { ...none, expiry: ["vencido"] })).toBe(true);
    expect(matchesFilters(line("A", { next_expiry: "2999-01-01" }), { ...none, expiry: ["vencido"] })).toBe(false);
    expect(matchesFilters(line("A", { next_expiry: "2999-01-01" }), { ...none, expiry: ["valido"] })).toBe(true);
    expect(matchesFilters(line("A"), { ...none, expiry: ["sem"] })).toBe(true);
  });
  it("quantidade na faixa", () => {
    expect(matchesFilters(line("A", { quantity: 5 }), { ...none, qtyFrom: 5, qtyTo: 5 })).toBe(true);
    expect(matchesFilters(line("A", { quantity: 5 }), { ...none, qtyTo: 4 })).toBe(false);
  });
});

describe("compareLines", () => {
  const rows = [
    line("Corda", { quantity: 3, worst_condition: "ruim", value_cents: 100 }),
    line("Apito", { quantity: 10, worst_condition: "bom", value_cents: 900 }),
    line("Bússola", { quantity: 3, value_cents: 500 }),
  ];
  const names = (key: Parameters<typeof compareLines>[0], dir: "asc" | "desc") => [...rows].sort(compareLines(key, dir)).map((row) => row.material.name);
  it("por nome", () => expect(names("material", "asc")).toEqual(["Apito", "Bússola", "Corda"]));
  it("pela posição escolhida; sem posição no fim, por nome", () => {
    const placed = [{ ...rows[0], position: 1 }, rows[1], { ...rows[2], position: 0 }, line("Apito 2", {})];
    expect([...placed].sort(compareLines("posicao", "asc")).map((row) => row.material.name)).toEqual(["Bússola", "Corda", "Apito", "Apito 2"]);
  });
  it("por número, empate por nome", () => expect(names("quantidade", "asc")).toEqual(["Bússola", "Corda", "Apito"]));
  it("decrescente", () => expect(names("total", "desc")).toEqual(["Apito", "Bússola", "Corda"]));
  it("vazios no fim nos dois sentidos", () => {
    expect(names("estado", "asc")).toEqual(["Apito", "Corda", "Bússola"]);
    expect(names("estado", "desc")).toEqual(["Corda", "Apito", "Bússola"]);
  });
});

describe("colunas e condições", () => {
  it("lê as colunas ocultas do cookie", () => expect([...hiddenColumns("total,foo,estado")]).toEqual(["total", "estado"]));
  it("quebra da pior para a melhor", () => expect(conditionBreakdown({ bom: 7, ruim: 2, regular: 0 })).toBe("2 ruim · 7 bom"));
});
