import { describe, expect, it } from "vitest";
import { normalizeSearch, searchTerms } from "./search";

describe("busca de materiais", () => {
  it("normaliza como o banco", () => expect(normalizeSearch("Cerimônia AÇÃO Pião")).toBe("cerimonia acao piao"));
  it("separa as palavras, sem vazias nem repetidas", () => {
    expect(searchTerms("  Primeiros   socorros primeiros ")).toEqual(["primeiros", "socorros"]);
    expect(searchTerms(undefined)).toEqual([]);
  });
});
