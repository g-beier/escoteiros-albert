import { describe, expect, it } from "vitest";
import { displayCase, titleCasePt } from "@geas/ui/lib/text";

// Nomes fictícios.
describe("displayCase (breadcrumbs)", () => {
  it("capitaliza nomes em maiúsculas, com partículas em minúsculas", () => {
    expect(displayCase("JOSÉ AUGUSTO DA SILVA")).toBe("José Augusto da Silva");
    expect(displayCase("ANA DOS SANTOS E SOUZA")).toBe("Ana dos Santos e Souza");
    expect(titleCasePt("MARIA-CLARA DE ÁVILA")).toBe("Maria-Clara de Ávila");
  });
  it("deixa como está o que não está todo em maiúsculas, e siglas soltas", () => {
    expect(displayCase("Vida escoteira")).toBe("Vida escoteira");
    expect(displayCase("Ana da Silva")).toBe("Ana da Silva");
    expect(displayCase("PDF")).toBe("PDF");
  });
});
