import { describe, expect, it } from "vitest";
import { BRANCH_COLORS, colorLegend, NO_COLOR, personColor, reportBySlug, reportFilename, reportFooterName, ROLE_COLORS, splitInTwo, updatedLabel } from "./reports";

describe("relatórios", () => {
  it("rodapé e nome do arquivo", () => {
    expect(reportFooterName({ number: "10", title: "Lista simples de efetivo" })).toBe("Documento 10 - Lista simples de efetivo");
    expect(reportFooterName({ number: null, title: "Modelo de layout" })).toBe("Modelo de layout");
    expect(reportFilename({ number: "10", title: "Lista simples de efetivo" }, "2026-11-20")).toBe("doc-10-lista-simples-de-efetivo-2026-11-20.pdf");
    expect(reportFooterName({ number: "14b", title: "Vida escoteira" })).toBe("Documento 14b - Vida escoteira");
    expect(reportFilename({ number: "14a", title: "Datas de promessa" }, "2026-11-20")).toBe("doc-14a-datas-de-promessa-2026-11-20.pdf");
    expect(reportFilename({ number: null, title: "Controle de idade às vésperas" }, "2026-11-20")).toBe("controle-de-idade-as-vesperas-2026-11-20.pdf");
    expect(reportBySlug("doc-10")?.title).toBe("Lista simples de efetivo");
    expect(reportBySlug("x")).toBeNull();
  });

  it("data da emissão: mês abreviado e ano com dois dígitos", () => {
    expect(updatedLabel("2026-11-20")).toBe("nov./26");
    expect(updatedLabel("2027-01-02")).toBe("jan./27");
    expect(updatedLabel("2026-05-31")).toBe("maio/26");
  });

  it("cor da pessoa: ramo, seção do escotista e função", () => {
    expect(personColor({ branch: "lobinho" })).toBe(BRANCH_COLORS.lobinho);
    expect(personColor({ branch: "adulto", functions: ["escotista", "dirigente"], scouterBranch: "senior" })).toBe(BRANCH_COLORS.senior);
    expect(personColor({ branch: "adulto", functions: ["honorifico", "dirigente"] })).toBe(ROLE_COLORS.dirigente);
    expect(personColor({ branch: "adulto", functions: ["comissao_fiscal"] })).toBe(ROLE_COLORS.comissao_fiscal);
    expect(personColor({ branch: "adulto" })).toBe(NO_COLOR);
  });

  it("divide em duas colunas pelo peso, na ordem", () => {
    expect(splitInTwo([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]]);
    expect(splitInTwo([1, 2, 3])).toEqual([[1, 2], [3]]);
    expect(splitInTwo(["a", "b", "c"], (x) => (x === "a" ? 5 : 1))).toEqual([["a"], ["b", "c"]]);
    expect(splitInTwo([])).toEqual([[], []]);
  });

  it("legenda com o Filhote só quando ligado", () => {
    expect(colorLegend(false).map((l) => l.label)).not.toContain("Filhote");
    expect(colorLegend(true)[0].label).toBe("Filhote");
  });
});
