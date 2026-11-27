import { describe, expect, it } from "vitest";
import { planBatch } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import { EMPTY_STATE, type ImportState } from "@/lib/import/state";

const plan = (files: Record<string, string>, state: ImportState = EMPTY_STATE) =>
  planBatch(
    Object.entries(files).map(([name, text]) => readImportFile(name, text).file!),
    state,
    { filhotes: false, today: "2026-11-24" },
  );

const LOTS = [
  "divisão;família código;família;material;consumível;mínimo;quantidade;condição;validade;valor unitário;variação;observação;contagem 2025;contagem 2026",
  "Cozinha > Armário 1;002;Cozinha;Panela 10 L;não;;3;bom;;89,90;;;4;3",
  "Cozinha › Armário 1;;cozinha;panela 10 l;;;1;bom;;;;;;1",
  "Alcateia;005;Primeiros socorros;Soro;sim;4;;;31/08/2027;6,50;;;10;6",
  "Alcateia;;;Lanterna;;;0;;;;;;2;0",
  "Alcateia;;;Corda;;;;;;;;;;",
  "Alcateia;003;Primeiros socorros;Gaze;sim;;5;;;;;;;",
].join("\n");

describe("inventario-lotes.csv", () => {
  it("lotes, contagens somadas, quantidade pela última contagem e conflitos", () => {
    const result = plan({ "inventario-lotes.csv": LOTS });
    expect(result.errors).toEqual([]);
    const file = result.files[0]!;
    expect(file.rows.map((row) => row.action)).toEqual(["nova", "nova", "nova", "nova", "erro", "erro"]);
    expect(file.rows[1]!.warnings).toEqual(["mesmo lote da linha 2: as quantidades somam"]);
    expect(file.rows[3]!.warnings).toEqual(["quantidade 0: não vira lote, só registra as contagens"]);
    expect(file.rows[4]!.errors).toEqual(["informe a quantidade ou uma contagem"]);
    expect(file.rows[5]!.errors).toEqual(["família Primeiros socorros com código diferente da linha 4"]);
    expect(file.payload[0]).toEqual({
      line: 2,
      location: "Cozinha › Armário 1",
      material: "Panela 10 L",
      family: "Cozinha",
      familyCode: "002",
      consumable: false,
      quantity: 3,
      condition: "bom",
      unitValue: 8990,
      counts: { 2025: 4, 2026: 4 },
    });
    expect(file.payload[1]).not.toHaveProperty("counts");
    expect(file.payload[2]).toMatchObject({
      material: "Soro",
      consumable: true,
      minimum: 4,
      quantity: 6,
      expires: "2027-08-31",
      familyCode: "005",
    });
  });

  it("recusa quando o inventário já foi usado no app e avisa que substitui", () => {
    const used = plan(
      { "inventario-lotes.csv": LOTS },
      { ...EMPTY_STATE, inventory: { locations: 3, materials: 10, lots: 12, units: 1, appMovements: 2 } },
    );
    expect(used.errors[0]).toContain("já tem 2 registros feitos no app");
    const loaded = plan(
      { "inventario-lotes.csv": LOTS },
      { ...EMPTY_STATE, inventory: { locations: 3, materials: 10, lots: 12, units: 1, appMovements: 0 } },
    );
    expect(loaded.errors).toEqual([]);
    expect(loaded.files[0]!.warnings[0]).toContain("Substitui o inventário atual");
  });
});

describe("inventario-pecas.csv", () => {
  it("só junto com os lotes; etiqueta e material conferidos", () => {
    expect(
      plan({ "inventario-pecas.csv": "etiqueta;material;divisão\nGEAS-001-0001;Barraca;Almoxarifado\n" }).errors[0],
    ).toContain("envie junto com inventario-lotes.csv");
    const result = plan({
      "inventario-lotes.csv": LOTS,
      "inventario-pecas.csv": [
        "etiqueta;código antigo;material;família código;família;divisão;condição",
        "GEAS-001-0001;B1;Barraca iglu;001;Barracas;Almoxarifado > Barracas;bom",
        "GEAS-001-0001;B2;Barraca iglu;001;Barracas;Almoxarifado > Barracas;bom",
        "GEAS-1-1;B3;Barraca iglu;001;Barracas;Almoxarifado;bom",
        "GEAS-002-0001;;Panela 10 L;001;Cozinha;Cozinha;bom",
      ].join("\n"),
    });
    const units = result.files[1]!;
    expect(units.rows.map((row) => row.errors[0] ?? row.action)).toEqual([
      "nova",
      "etiqueta repetida (linha 2)",
      'etiqueta "GEAS-1-1" fora do formato GEAS-000-0000',
      "a etiqueta GEAS-002-0001 não é da família 001",
    ]);
    expect(units.rows[3]!.errors).toContain("Panela 10 L já é material por quantidade (inventario-lotes.csv, linha 2)");
    expect(units.payload[0]).toMatchObject({
      tag: "GEAS-001-0001",
      legacyCode: "B1",
      location: "Almoxarifado › Barracas",
    });
  });
});
