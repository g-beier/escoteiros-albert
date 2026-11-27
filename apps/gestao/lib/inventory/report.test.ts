import { describe, expect, it } from "vitest";
import type { LocationPath } from "./locations";
import type { StockRow } from "./model";
import { countSheet, tagSummary } from "./report";

const path = (id: string, name: string, parent: LocationPath | null, position: number): LocationPath => ({
  id,
  parent_id: parent?.id ?? null,
  name,
  path: parent ? `${parent.path} › ${name}` : name,
  depth: parent ? parent.depth + 1 : 0,
  active: true,
  ancestors: [...(parent?.ancestors ?? []), id],
  sort_key: [...(parent?.sort_key ?? []), position],
});
const stock = (material: string, location: string, over: Partial<StockRow> = {}): StockRow => ({
  material_id: material,
  location_id: location,
  quantity: 1,
  value_cents: 0,
  next_expiry: null,
  worst_condition: null,
  conditions: {},
  min_unit_cents: null,
  max_unit_cents: null,
  ...over,
});
const material = (id: string, name: string, active = true) => ({
  id,
  name,
  active,
  minimum_quantity: null,
  below_minimum: false,
});

describe("tagSummary", () => {
  it("faixas por família e peças sem etiqueta", () => {
    expect(tagSummary(["GEAS-001-0002", "GEAS-001-0001", "GEAS-001-0004", "GEAS-002-0010", null])).toBe(
      "GEAS-001: 0001–0002, 0004 · GEAS-002: 0010 · +1 sem etiqueta",
    );
    expect(tagSummary([])).toBeNull();
  });
});

describe("countSheet", () => {
  const alm = path("alm", "Almoxarifado", null, 0);
  const prat = path("prat", "Prateleira", alm, 0);
  const coz = path("coz", "Cozinha", null, 1);
  const vazia = path("vazia", "Vazia", null, 2);
  const paths = [alm, prat, coz, vazia];
  const input = {
    paths,
    stock: [
      stock("corda", "alm", { quantity: 3, worst_condition: "bom", conditions: { bom: 3 } }),
      stock("apito", "alm", {
        quantity: 5,
        worst_condition: "ruim",
        conditions: { bom: 3, ruim: 2 },
        next_expiry: "2027-03-31",
      }),
      stock("barraca", "prat", { quantity: 2 }),
      stock("panela", "coz"),
      stock("velho", "coz"),
    ],
    materials: [
      material("corda", "Corda"),
      material("apito", "Apito"),
      material("barraca", "Barraca"),
      material("panela", "Panela"),
      material("velho", "Velho", false),
    ],
    positions: new Map([
      ["alm|corda", 0],
      ["alm|apito", 1],
    ]),
    units: [
      { material_id: "barraca", location_id: "prat", tag: "GEAS-001-0001" },
      { material_id: "barraca", location_id: "prat", tag: "GEAS-001-0002" },
    ],
  };

  it("uma parte por raiz com material, divisões na ordem da árvore e materiais na ordem escolhida", () => {
    const sheet = countSheet(input);
    expect(sheet.parts.map((part) => part.title)).toEqual(["Almoxarifado", "Cozinha"]);
    expect(sheet.parts[0].blocks.map((block) => [block.title, block.depth])).toEqual([
      ["Almoxarifado", 0],
      ["Almoxarifado › Prateleira", 1],
    ]);
    expect(sheet.parts[0].blocks[0].lines.map((line) => line.name)).toEqual(["Corda", "Apito"]);
    expect(sheet.parts[0].blocks[0].lines[1]).toMatchObject({
      condition: "2 ruim · 3 bom",
      expiry: "31/03/27",
      quantity: 5,
    });
    expect(sheet.parts[0].blocks[1].lines[0].tags).toBe("GEAS-001: 0001–0002");
    expect(sheet.parts[1].blocks[0].lines.map((line) => line.name)).toEqual(["Panela"]);
  });

  it("só a divisão pedida e as de dentro", () => {
    const sheet = countSheet({ ...input, scopeId: "prat" });
    expect(sheet.parts.map((part) => part.title)).toEqual(["Almoxarifado › Prateleira"]);
    expect(sheet.parts[0].blocks.map((block) => [block.title, block.depth])).toEqual([
      ["Almoxarifado › Prateleira", 0],
    ]);
  });
});
