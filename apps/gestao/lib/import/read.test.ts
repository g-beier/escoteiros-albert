import { describe, expect, it } from "vitest";
import { FILES } from "@/lib/import/contract";
import { countYear, detectKind, readImportFile, writeImportCsv } from "@/lib/import/read";

describe("readImportFile", () => {
  it.each(FILES.map((spec) => [spec.file, spec] as const))("lê o exemplo de %s sem erros", (_, spec) => {
    const { file, error } = readImportFile(spec.file, writeImportCsv(spec.example.header, spec.example.rows));
    expect(error).toBeUndefined();
    expect(file!.kind).toBe(spec.kind);
    expect(file!.warnings).toEqual([]);
    expect(file!.rows.flatMap((row) => row.errors)).toEqual([]);
    expect(file!.rows).toHaveLength(spec.example.rows.length);
  });

  it("converte valores e guarda só as células preenchidas", () => {
    const { file } = readImportFile(
      "pessoas.csv",
      "Nome,Nascimento,Ramo,Situação,Desligado em\nAna Souza,14/05/2015,Alcateia,,\n",
    );
    expect(file!.rows[0]).toEqual({
      line: 2,
      values: { name: "Ana Souza", birth: "2015-05-14", branch: "lobinho" },
      dynamic: {},
      errors: [],
    });
  });

  it("erros por célula, linha em branco ignorada, coluna desconhecida vira aviso", () => {
    const { file } = readImportFile("pessoas.csv", "nome;ramo;cpf\n;castor;123\n\n;;\nBia;adulto;\n");
    expect(file!.warnings).toEqual(['Coluna "cpf" não faz parte de pessoas.csv e foi ignorada.']);
    expect(file!.rows).toHaveLength(2);
    expect(file!.rows[0]!.errors).toEqual(["nome vazio", expect.stringContaining('ramo: "castor"')]);
    expect(file!.rows[1]!.line).toBe(5);
  });

  it("falta coluna obrigatória", () => {
    expect(readImportFile("funcoes.csv", "pessoa;cargo\nAna;Chefe\n").error).toContain("falta a coluna tipo");
  });

  it("colunas dinâmicas: itens do controle e contagens do inventário", () => {
    const controle = readImportFile("controle.csv", "público;pessoa;Ficha de saúde;Paxtu\njovem;Ana;OK;\n").file!;
    expect(controle.dynamicColumns).toEqual(["Ficha de saúde", "Paxtu"]);
    expect(controle.rows[0]!.dynamic).toEqual({ "Ficha de saúde": "OK" });
    const lotes = readImportFile(
      "inventario-lotes.csv",
      "divisão;material;Contagem 2025;contagem 2026;sobra\nA;Panela;3;2;x\n",
    ).file!;
    expect(lotes.dynamicColumns).toEqual(["Contagem 2025", "contagem 2026"]);
    expect(lotes.warnings).toHaveLength(1);
    expect(countYear("Contagem 2025")).toBe(2025);
  });

  it("tipo pelo nome ou pelo cabeçalho", () => {
    expect(detectKind("2026 - Itens controle.csv", [])).toBe("itens-controle");
    expect(detectKind("Controle.csv", [])).toBe("controle");
    expect(detectKind("planilha.csv", ["jovem", "responsável", "parentesco"])).toBe("responsaveis");
    expect(detectKind("planilha.csv", ["divisão", "material", "quantidade"])).toBe("inventario-lotes");
    expect(detectKind("planilha.csv", ["x"])).toBeNull();
  });
});
