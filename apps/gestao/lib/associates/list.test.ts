import { describe, expect, it } from "vitest";
import type { FunctionKind } from "./controls";
import { listGroups, matchesQuery } from "./list";
import type { AssociateProfile, ScoutBranch } from "./model";

const person = (name: string, branch: ScoutBranch, section_id: string | null = null): AssociateProfile => ({
  id: name, name, branch, active: true, section_id, section: null, patrol_id: null, patrol: null,
  birth_date: null, promise_date: null, joined_on: null, notes: null, left_on: null,
});
const rows = [person("Bia", "escoteiro", "t2"), person("Ana", "escoteiro", "t1"), person("Caio", "escoteiro"), person("Duda", "lobinho", "a1"),
  person("Eva", "adulto"), person("Fábio", "adulto"), person("Gil", "adulto")];
const kinds = new Map<string, Set<FunctionKind>>([["Eva", new Set(["escotista", "dirigente"])], ["Fábio", new Set(["dirigente"])], ["Gil", new Set(["honorifico", "comissao_fiscal"])]]);
const shape = (groups: ReturnType<typeof listGroups>) => groups.map((g) => `${g.level}:${g.label}(${g.count}):${g.rows.map((r) => r.name).join(",")}`);

describe("lista de associados", () => {
  it("aba Todos: só por ramo, sem seções; adultos por função", () => {
    expect(shape(listGroups(rows, "", kinds))).toEqual([
      "root:Lobinho(1):Duda", "root:Escoteiro(3):Ana,Bia,Caio", "root:Adultos(3):",
      "sub:Escotistas(1):Eva", "sub:Dirigentes(2):Eva,Fábio", "sub:Honoríficos(1):Gil", "sub:Comissão fiscal(1):Gil",
    ]);
  });
  it("aba de um ramo: um grupo só; Adultos só os subgrupos", () => {
    expect(shape(listGroups(rows, "escoteiro", kinds))).toEqual(["root:Escoteiro(3):Ana,Bia,Caio"]);
    expect(listGroups(rows, "adulto", kinds).map((g) => g.label)).toEqual(["Escotistas", "Dirigentes", "Honoríficos", "Comissão fiscal"]);
    expect(listGroups(rows, "adulto").map((g) => [g.label, g.count])).toEqual([["Sem função", 3]]);
    expect(listGroups(rows, "senior")).toEqual([]);
  });
  it("busca sem acento e sem maiúsculas", () => {
    expect(matchesQuery("José Antônio", "jose ANTO")).toBe(true);
    expect(matchesQuery("Ana", "bia")).toBe(false);
    expect(matchesQuery("Ana", " ")).toBe(true);
  });
});
