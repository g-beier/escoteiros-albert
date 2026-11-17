import { describe, expect, it } from "vitest";
import { listHref, listQuery } from "./entries";

describe("listHref", () => {
  it("volta para Movimentações sem filtros", () => expect(listHref(undefined)).toBe("/financeiro/lancamentos/movimentacoes"));
  it("volta para a visão de onde se veio, com os filtros", () => {
    expect(listHref("/financeiro/lancamentos/movimentacoes?conciliado=nao")).toBe("/financeiro/lancamentos/movimentacoes?conciliado=nao");
    expect(listHref("/financeiro/lancamentos/detalhamento?q=lanche&pasta=pendente")).toBe("/financeiro/lancamentos/detalhamento?pasta=pendente&q=lanche");
  });
  it("descarta destinos externos e chaves desconhecidas", () => {
    expect(listHref("//evil.test")).toBe("/financeiro/lancamentos/movimentacoes");
    expect(listHref("https://evil.test/lancamentos/detalhamento")).toBe("/financeiro/lancamentos/movimentacoes");
    expect(listHref("/financeiro/lancamentos/detalhamento/../../x")).toBe("/financeiro/lancamentos/movimentacoes");
    expect(listHref("/financeiro/lancamentos/detalhamento?next=//evil.test&q=ok")).toBe("/financeiro/lancamentos/detalhamento?q=ok");
  });
});

describe("listQuery", () => {
  it("monta a query da lista a partir dos searchParams", () => {
    expect(listQuery({ visao: "detalhamento", q: ["a", "b"], foo: "x", de: "" })).toBe("q=a");
  });
});
