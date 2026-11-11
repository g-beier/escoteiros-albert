import { describe, expect, it } from "vitest";
import { listHref, listQuery } from "./entries";

describe("listHref", () => {
  it("volta para a lista sem filtros", () => expect(listHref(undefined)).toBe("/"));
  it("preserva filtros conhecidos", () => expect(listHref("visao=rubricas&q=lanche&pasta=pendente")).toBe("/?visao=rubricas&pasta=pendente&q=lanche"));
  it("descarta destinos externos e chaves desconhecidas", () => {
    expect(listHref("//evil.test")).toBe("/");
    expect(listHref("https://evil.test/?q=x")).toBe("/");
    expect(listHref("next=//evil.test&q=ok")).toBe("/?q=ok");
  });
});

describe("listQuery", () => {
  it("monta a query da lista a partir dos searchParams", () => {
    expect(listQuery({ visao: "rubricas", q: ["a", "b"], foo: "x", de: "" })).toBe("visao=rubricas&q=a");
  });
});
