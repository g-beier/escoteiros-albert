import { describe, expect, it } from "vitest";
import { buildDoc10, sectionRows, shortName, twoColumnRows } from "./doc10";
import { doc10Input as input } from "./doc10.fixture";

describe("Doc 10", () => {
  const doc = buildDoc10(input);

  it("seções na ordem dos ramos, sem seção à parte, inativa vazia fora", () => {
    expect(doc.sections.map((s) => s.title)).toEqual(["Alcateia", "Tropa", "Escoteiro (sem seção)"]);
    const [alcateia, tropa] = doc.sections;
    expect(alcateia.adults.map((a) => a.name)).toEqual(["Ana Chefe"]);
    expect(alcateia.definitive.map((a) => a.name)).toEqual(["Bia Lobinha"]);
    expect(alcateia.provisional).toEqual([{ id: "caio", name: "Caio Lobinho", red: true }]);
    expect(tropa.adults.map((a) => a.name)).toEqual(["Rui Diretor"]); // duas funções na mesma seção: uma linha
    expect(tropa.definitive.map((a) => a.name)).toEqual(["Davi Escoteiro", "Isa Escoteira", "Sol Escoteira"]);
  });

  it("totais, diretoria com eleitos e outros com a comissão fiscal em negrito", () => {
    expect(doc.totalScouters).toBe(2);
    expect(doc.board).toEqual([{ id: "ana", name: "Ana Chefe", bold: true }, { id: "eva", name: "Eva Diretora" }]);
    expect(doc.totalDirectors).toBe(2);
    expect(doc.totalAdults).toBe(3); // Ana é escotista e dirigente: conta uma vez
    expect(doc.youth).toEqual({ definitive: 5, provisional: 1, total: 6 });
    expect(doc.basic).toBe(9);
    expect(doc.others.map((o) => [o.name, !!o.bold])).toEqual([
      ["Fausto Fiscal", true], ["Hugo Honorário", false], ["Mãe Associada", false], ["Sara Sem Função", false],
    ]);
    expect(doc.totalOthers).toBe(4);
    expect(doc.totalDefinitive).toBe(11); // 13 ativos menos Caio e Eva
    expect(doc.totalPaxtu).toBe(3); // desligado não conta
  });

  it("responsáveis: casa pelo legal e mãe/pai; irmãos mesclados; família recomposta linha a linha", () => {
    const family = (id: string) => doc.families.flatMap((s) => s.families).find((f) => f.youth.id === id)!;
    expect(family("bia").relatives.map((r) => [r.id, r.associate, r.see])).toEqual([["pai", false, null], ["mae", true, null]]);
    expect(family("davi").seeMerged).toBe("Bia");
    // legais primeiro (Roberto, Inês), depois a Luana ("outro", não legal), mesmo cadastrada antes da Inês
    expect(family("isa").relatives.map((r) => [r.id, r.notLegal, r.see])).toEqual([["roberto", false, null], ["ines", false, null], ["luana", true, "Solzinha"]]);
    expect(family("isa").seeMerged).toBeNull();
    expect(family("sol").relatives.map((r) => [r.id, r.notLegal, r.see])).toEqual([["luana", false, null], ["roberto", true, "Isa"]]);
    expect(family("caio").relatives).toEqual([]);
  });

  it("asterisco = não é responsável legal, qualquer que seja o parentesco", () => {
    // Inês (mãe da Isa) sem ser responsável legal; Luana ("outro") responsável legal da Isa
    const doc2 = buildDoc10({ ...input, links: input.links.map((l) =>
      l.associate_id === "isa" && l.relative_id === "ines" ? { ...l, legal: false }
        : l.associate_id === "isa" && l.relative_id === "luana" ? { ...l, legal: true } : l) });
    const isa = doc2.families.flatMap((s) => s.families).find((f) => f.youth.id === "isa")!;
    expect(isa.relatives.map((r) => [r.id, r.notLegal])).toEqual([["roberto", false], ["luana", false], ["ines", true]]);
  });

  it("linhas vazias e colunas na mesma altura", () => {
    expect(sectionRows(1, 1, 1)).toEqual({ adults: 11, definitive: 6, provisional: 4 });
    expect(sectionRows(20, 9, 0)).toEqual({ adults: 23, definitive: 12, provisional: 10 });
    expect(sectionRows(2, 15, 6)).toEqual({ adults: 28, definitive: 18, provisional: 9 });
    expect(twoColumnRows(["a", "b", "c"])).toEqual({ left: ["a", "b"], right: ["c"], rows: 4 });
    expect(twoColumnRows([]).rows).toBe(3);
    expect(shortName({ name: "Manuelle Lacerda", nickname: "Manu" })).toBe("Manu");
    expect(shortName({ name: " Murilo Leal ", nickname: null })).toBe("Murilo");
  });
});
