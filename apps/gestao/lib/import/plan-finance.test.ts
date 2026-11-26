import { describe, expect, it } from "vitest";
import { findCategory, planBatch } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import { EMPTY_STATE, type ImportState, type StateCategory } from "@/lib/import/state";

const categories: StateCategory[] = [
  { id: "c1", code: "1", name: "Receitas", kind: "receita", active: true },
  { id: "c11", code: "1.1", name: "Mensalidades", kind: "receita", active: true },
  { id: "c262", code: "2.6.2", name: "Ingredientes", kind: "despesa", active: true },
  { id: "c252", code: "2.5.2", name: "Ingredientes", kind: "despesa", active: true },
  { id: "c264", code: "2.6.4", name: "Descartáveis", kind: "despesa", active: true },
  { id: "c9", code: "2.9", name: "Antiga", kind: "despesa", active: false },
];
const state: ImportState = {
  ...EMPTY_STATE,
  people: [{ id: "p1", name: "Ana Souza", nickname: null, birth: "2015-05-14", branch: "lobinho", sectionId: null, patrolId: null, registration: "definitivo", joined: null, promise: null, active: true, left: null, notes: null }],
  finance: {
    categories,
    accounts: [{ id: "a1", name: "Mercado Pago", active: true }, { id: "a2", name: "Velha", active: false }],
    paymentMethods: [{ id: "m1", name: "PIX", active: true }, { id: "m2", name: "Dinheiro", active: true }],
    entries: [{ id: "e1000000-0000-0000-0000-000000000000", date: "2026-03-10", account: "Mercado Pago", name: "Mensalidade", total: 3000 }],
  },
};

const HEADER = "id;lançamento;data;histórico;conta;forma de pagamento;documento;pasta;valor;rubrica;descrição;associado;observação";
const plan = (lines: string[], current = state) =>
  planBatch([readImportFile("lancamentos.csv", [HEADER, ...lines].join("\n")).file!], current, { filhotes: false, today: "2026-11-25" });

describe("findCategory", () => {
  it("acha pelo código (com ponto e nome) e avisa se o nome difere", () => {
    expect(findCategory(categories, "1.1").category?.id).toBe("c11");
    expect(findCategory(categories, "1.1. Mensalidades")).toEqual({ category: categories[1] });
    expect(findCategory(categories, "1.1 Mensalidade de março").warning).toContain("no app o nome é \"Mensalidades\"");
    expect(findCategory(categories, "3.1 Caixinhas").error).toBe("rubrica 3.1 não existe no app");
  });
  it("pelo nome só quando é único", () => {
    expect(findCategory(categories, "descartaveis").category?.id).toBe("c264");
    expect(findCategory(categories, "Ingredientes").error).toContain("use o código");
  });
});

describe("lancamentos.csv", () => {
  it("sinal pela rubrica, rateios juntos por `lançamento`, conta e forma novas", () => {
    const result = plan([
      ";;10/03/2026;Mensalidade;Mercado Pago;PIX;;não;30,00;1.1;;Ana Souza;",
      ";feira;12/03/2026;Feira;Caixa;Dinheiro;NF 1;sim;40,00;2.6.2;Legumes;;",
      ";feira;12/03/2026;Feira;Caixa;Dinheiro;NF 1;sim;12,50;2.6.4;Copos;;",
      ";;13/03/2026;Doação;Cora;Maquininha;;;100,00;1;;Fulano de Tal;",
    ]);
    expect(result.errors).toEqual([]);
    const file = result.files[0]!;
    expect(file.rows.map((row) => row.action)).toEqual(["igual", "nova", "nova"]);
    expect(file.creations).toEqual(['Nova conta "Caixa"', 'Nova conta "Cora"', 'Nova forma de pagamento "Maquininha"']);
    expect(file.payload[0]).toMatchObject({
      date: "2026-03-12", name: "Feira", account: "Caixa", payment_method: "Dinheiro", document: "NF 1", filed: true, total_cents: -5250,
      splits: [{ category_id: "c262", amount_cents: -4000, description: "Legumes" }, { category_id: "c264", amount_cents: -1250, description: "Copos" }],
    });
    expect(file.rows[2]!.warnings).toEqual(['associado "Fulano de Tal" não encontrado: o nome vai para a observação']);
    expect(file.payload[1]).toMatchObject({ total_cents: 10000, notes: "Associado na planilha: Fulano de Tal", splits: [{ amount_cents: 10000, description: "Doação" }] });
  });

  it("lançamentos iguais no mesmo dia contam um a um; o id identifica", () => {
    const twice = ";;10/03/2026;Mensalidade;Mercado Pago;PIX;;;30,00;1.1;;Ana Souza;";
    expect(plan([twice, twice]).files[0]!.rows.map((row) => row.action)).toEqual(["igual", "nova"]);
    expect(plan(["e1000000-0000-0000-0000-000000000000;;10/03/2026;Xis;;;;;30,00;1.1;;;"]).files[0]!.rows[0]!.action).toBe("igual");
  });

  it("erros: rubrica inexistente, inativa ou ambígua, conta inativa, linhas do mesmo lançamento divergentes, faltando conta", () => {
    const rows = plan([
      ";;10/03/2026;Xis;Mercado Pago;PIX;;;5,00;3.1 Caixinhas;;;",
      ";;10/03/2026;Xis;Mercado Pago;PIX;;;5,00;2.9;;;",
      ";;10/03/2026;Xis;Mercado Pago;PIX;;;5,00;Ingredientes;;;",
      ";;10/03/2026;Xis;Velha;PIX;;;5,00;1.1;;;",
      ";g;10/03/2026;Xis;Mercado Pago;PIX;;;5,00;1.1;;;",
      ";g;11/03/2026;Xis;Mercado Pago;PIX;;;5,00;1.1;;;",
      ";;10/03/2026;Xis;;PIX;;;5,00;1.1;;;",
    ]).files[0]!.rows;
    expect(rows.map((row) => row.errors[0])).toEqual([
      "rubrica 3.1 não existe no app",
      "rubrica 2.9 Antiga está inativa",
      expect.stringContaining("use o código"),
      "a conta Velha está inativa",
      "linha 7: data diferente da linha 6 (o lançamento é um só)",
      "conta é obrigatória para criar o lançamento",
    ]);
  });
});
