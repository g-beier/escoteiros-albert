import { describe, expect, it } from "vitest";
import { categoryLabel, compareCodes, decodeCategorySelection, encodeCategorySelection, depthOf, descendantsMap, sortCategories, type CategoryItem } from "./categories";

const item = (id: string, code: string | null, name: string, parent_id: string | null): CategoryItem =>
  ({ id, code, name, parent_id, active: true, kind: code?.startsWith("1") ? "receita" : "despesa" });
const tree = [
  item("d", "2", "Despesas", null),
  item("p", "2.5", "Pastelada", "d"),
  item("i", "2.5.2", "Ingredientes", "p"),
  item("x", "2.2.10", "Alcateia", "d"),
  item("y", "2.2.9", "Loja", "d"),
  item("old", null, "Alimentação", null),
];

describe("compareCodes", () => {
  it("ordena numericamente e deixa sem código por último", () => {
    expect(sortCategories(tree).map((c) => c.code)).toEqual(["2", "2.2.9", "2.2.10", "2.5", "2.5.2", null]);
    expect(compareCodes("1.10", "1.9")).toBeGreaterThan(0);
  });
});

describe("categoryLabel", () => {
  it("mostra código e caminho sem a raiz", () => {
    const byId = new Map(tree.map((c) => [c.id, c]));
    expect(categoryLabel(tree[2], byId)).toBe("2.5.2 Pastelada › Ingredientes");
    expect(categoryLabel(tree[0], byId)).toBe("2 Despesas");
    expect(categoryLabel(tree[5], byId)).toBe("Alimentação");
  });
});

describe("descendantsMap / depthOf", () => {
  it("coleta todos os níveis abaixo", () => {
    const map = descendantsMap(tree);
    expect(map.d.sort()).toEqual(["i", "p", "x", "y"]);
    expect(map.p).toEqual(["i"]);
    expect(map.i).toEqual([]);
    expect(depthOf("2.5.2")).toBe(2);
  });
});

describe("encodeCategorySelection / decodeCategorySelection", () => {
  // d › d1 › (d11, d12); d › d2; e é outra raiz
  const tree = [
    { id: "d", parent_id: null }, { id: "d1", parent_id: "d" }, { id: "d11", parent_id: "d1" },
    { id: "d12", parent_id: "d1" }, { id: "d2", parent_id: "d" }, { id: "e", parent_id: null },
  ];
  const roundTrip = (selected: string[]) => decodeCategorySelection(encodeCategorySelection(selected, tree), tree).sort();

  it("um grupo inteiro vira um só token", () => {
    expect(encodeCategorySelection(["d", "d1", "d11", "d12", "d2"], tree)).toEqual(["d"]);
    expect(decodeCategorySelection(["d"], tree)).toEqual(["d", "d1", "d11", "d12", "d2"]);
  });

  it("desmarcados dentro de um grupo vão com sinal de menos", () => {
    expect(encodeCategorySelection(["d", "d1", "d11", "d2"], tree)).toEqual(["d", "-d12"]);
    // pai sem as filhas
    expect(encodeCategorySelection(["d1"], tree)).toEqual(["d1", "-d11", "-d12"]);
    // folha dentro de grupo desmarcado
    expect(encodeCategorySelection(["d", "d2", "d12"], tree)).toEqual(["d", "-d1", "d12"]);
  });

  it("ida e volta preserva qualquer seleção", () => {
    for (const selected of [[], ["e"], ["d11"], ["d", "d2"], ["d1", "d12", "e"], tree.map((t) => t.id)]) {
      expect(roundTrip(selected)).toEqual([...selected].sort());
    }
  });

  it("ignora tokens de rubricas desconhecidas", () => {
    expect(decodeCategorySelection(["x", "-y"], tree)).toEqual([]);
  });
});
