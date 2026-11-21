import { describe, expect, it } from "vitest";
import { buildDoc14, shortPromiseDate } from "./doc14";
import { doc10Input } from "./doc10.fixture";
import { BRANCH_COLORS, NO_COLOR, ROLE_COLORS } from "./reports";

// Nomes fictícios (fixture do Doc 10, com datas de promessa).

const withDates: Record<string, string> = {
  bia: "2024-08-17", davi: "2011-08-13", isa: "2024-08-17", sol: "2023-03-07", ana: "1991-08-24", rui: "2024-08-24",
  eva: "2015-03-29", fis: "2010-01-17", ex: "2020-05-05",
};
const input = {
  ...doc10Input,
  associates: doc10Input.associates.map((a) => ({ ...a, promise_date: withDates[a.id] ?? null })),
};

describe("Doc 14", () => {
  const doc = buildDoc14(input);

  it("data curta da planilha", () => {
    expect(shortPromiseDate("2026-01-17")).toBe("17/1/26");
    expect(shortPromiseDate("1985-06-29")).toBe("29/6/85");
  });

  it("só os meses com promessa; no mês, por dia, depois ano e nome; desligado fora", () => {
    expect(doc.months.map((m) => m.label)).toEqual(["Janeiro", "Março", "Agosto"]);
    const august = doc.months.find((m) => m.month === 8)!;
    expect(august.people.map((p) => [p.name, p.date])).toEqual([
      ["Davi Escoteiro", "13/8/11"], ["Bia Lobinha", "17/8/24"], ["Isa Escoteira", "17/8/24"], ["Ana Chefe", "24/8/91"], ["Rui Diretor", "24/8/24"],
    ]);
  });

  it("cores: ramo do jovem, seção do escotista, dirigente e outros", () => {
    const color = (id: string) => [...doc.months.flatMap((m) => m.people), ...doc.without].find((p) => p.id === id)!.color;
    expect(color("bia")).toBe(BRANCH_COLORS.lobinho);
    expect(color("ana")).toBe(BRANCH_COLORS.lobinho); // escotista da Alcateia (também dirigente)
    expect(color("rui")).toBe(BRANCH_COLORS.escoteiro);
    expect(color("eva")).toBe(ROLE_COLORS.dirigente);
    expect(color("fis")).toBe(ROLE_COLORS.comissao_fiscal);
    expect(color("sem")).toBe(NO_COLOR);
  });

  it("sem promessa: ativos sem data, por nome, com pendência em vermelho", () => {
    expect(doc.without.map((p) => p.name)).toEqual(["Caio Lobinho", "Hugo Honorário", "Leo Solto", "Mãe Associada", "Sara Sem Função"]);
    expect(doc.without[0].red).toBe(true);
  });
});
