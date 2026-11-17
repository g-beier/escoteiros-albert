import { describe, expect, it } from "vitest";
import { listHref, listQuery } from "./entries";

describe("listHref", () => {
  it("volta para Movimentações sem filtros", () => expect(listHref(undefined)).toBe("/lancamentos/movimentacoes"));
  it("volta para a visão de onde se veio, com os filtros", () => {
    expect(listHref("/lancamentos/movimentacoes?conciliado=nao")).toBe("/lancamentos/movimentacoes?conciliado=nao");
    expect(listHref("/lancamentos/detalhamento?q=lanche&pasta=pendente")).toBe("/lancamentos/detalhamento?pasta=pendente&q=lanche");
  });
  it("descarta destinos externos e chaves desconhecidas", () => {
    expect(listHref("//evil.test")).toBe("/lancamentos/movimentacoes");
    expect(listHref("https://evil.test/lancamentos/detalhamento")).toBe("/lancamentos/movimentacoes");
    expect(listHref("/lancamentos/detalhamento/../../x")).toBe("/lancamentos/movimentacoes");
    expect(listHref("/lancamentos/detalhamento?next=//evil.test&q=ok")).toBe("/lancamentos/detalhamento?q=ok");
  });
});

describe("listQuery", () => {
  it("monta a query da lista a partir dos searchParams", () => {
    expect(listQuery({ visao: "detalhamento", q: ["a", "b"], foo: "x", de: "" })).toBe("q=a");
  });
});
