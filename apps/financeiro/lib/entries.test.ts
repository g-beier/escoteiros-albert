import { describe, expect, it } from "vitest";
import { listHref, listQuery } from "./entries";

describe("listHref", () => {
  it("volta para a lista sem filtros", () => expect(listHref(undefined)).toBe("/lancamentos"));
  it("preserva o filtro de conciliação", () => expect(listHref("conciliado=nao")).toBe("/lancamentos?conciliado=nao"));
  it("preserva filtros conhecidos", () => expect(listHref("visao=rubricas&q=lanche&pasta=pendente")).toBe("/lancamentos?visao=rubricas&pasta=pendente&q=lanche"));
  it("descarta destinos externos e chaves desconhecidas", () => {
    expect(listHref("//evil.test")).toBe("/lancamentos");
    expect(listHref("https://evil.test/?q=x")).toBe("/lancamentos");
    expect(listHref("next=//evil.test&q=ok")).toBe("/lancamentos?q=ok");
  });
});

describe("listQuery", () => {
  it("monta a query da lista a partir dos searchParams", () => {
    expect(listQuery({ visao: "rubricas", q: ["a", "b"], foo: "x", de: "" })).toBe("visao=rubricas&q=a");
  });
});
