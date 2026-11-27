import { describe, expect, it } from "vitest";
import {
  ALL_DATES,
  defaultFrom,
  DIVISION_PARAM,
  hasAnyFilter,
  likePattern,
  listValues,
  parseEntrySort,
  parseFilters,
  parseOrder,
} from "./filters";

const id = "0b6c7a4e-5d1f-4c1e-9a8b-2f3d4e5f6a7b";
const id2 = "1b6c7a4e-5d1f-4c1e-9a8b-2f3d4e5f6a7c";

describe("parseFilters", () => {
  it("lê filtros com vários valores", () => {
    expect(
      parseFilters({
        de: "2026-01-01",
        ate: "2026-01-31",
        conta: id2,
        forma: `${id},${id2}`,
        pasta: "pendente",
        associado: `${id},nenhum`,
        rubrica: id,
        q: " lanche ",
      }),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      accountIds: [id2],
      paymentMethodIds: [id, id2],
      folder: "pendente",
      associateIds: [id],
      withoutAssociate: true,
      categoryTokens: [id],
      q: "lanche",
    });
  });

  it("começa em 1º de janeiro do ano atual por padrão; de=tudo remove o limite", () => {
    const now = new Date("2026-11-11T12:00:00Z");
    expect(parseFilters({}, now).from).toBe("2026-01-01");
    expect(parseFilters({ de: ALL_DATES }, now).from).toBeUndefined();
    expect(defaultFrom(new Date("2027-01-01T01:00:00Z"))).toBe("2026-01-01"); // ainda 31/12 em São Paulo
  });

  it("descarta valores malformados", () => {
    expect(
      parseFilters({ de: "01/01/2026", conta: "y", forma: "x", pasta: "talvez", rubrica: "' or 1=1", q: "  " }),
    ).toEqual({
      from: defaultFrom(),
      to: undefined,
      accountIds: [],
      paymentMethodIds: [],
      folder: undefined,
      associateIds: [],
      withoutAssociate: false,
      categoryTokens: [],
      q: undefined,
    });
  });

  it("trata as duas opções de pasta como sem filtro", () => {
    expect(parseFilters({ pasta: "pendente,na-pasta" }).folder).toBeUndefined();
    expect(parseFilters({ pasta: ["na-pasta"] }).folder).toBe("na-pasta");
  });

  it("lê o filtro de conciliação; as duas opções equivalem a todos", () => {
    expect(parseFilters({ conciliado: "sim" }).reconciled).toBe(true);
    expect(parseFilters({ conciliado: "nao" }).reconciled).toBe(false);
    expect(parseFilters({ conciliado: "sim,nao" }).reconciled).toBeUndefined();
    expect(parseFilters({ conciliado: "talvez" }).reconciled).toBeUndefined();
  });

  it("lê a faixa de valor em reais, com sinal (despesas negativas)", () => {
    expect(parseFilters({ valor_de: "1.234,56", valor_ate: "2000" })).toMatchObject({
      minCents: 123456,
      maxCents: 200000,
    });
    expect(parseFilters({ valor_de: "-500", valor_ate: "-R$ 10,5" })).toMatchObject({
      minCents: -50000,
      maxCents: -1050,
    });
    expect(parseFilters({ valor_de: "0" }).minCents).toBe(0);
    const invalid = parseFilters({ valor_de: "abc", valor_ate: "1,2,3" });
    expect(invalid.minCents).toBeUndefined();
    expect(invalid.maxCents).toBeUndefined();
  });

  it("lê o recorte por divisão (tokens válidos) à parte dos associados por nome", () => {
    const filters = parseFilters({
      [DIVISION_PARAM]: `r:lobinho,-s:${id},nenhum,xyz,s:abc`,
      associado: `${id2},s:${id}`,
    });
    expect(filters.divisionTokens).toEqual(["r:lobinho", `-s:${id}`, "nenhum"]);
    expect(filters.associateIds).toEqual([id2]);
    expect(filters.withoutAssociate).toBe(false);
    expect(parseFilters({ associado: "nenhum" }).withoutAssociate).toBe(true); // links antigos
    expect(parseFilters({}).divisionTokens).toBeUndefined();
  });

  it("limita a busca", () => expect(parseFilters({ q: "a".repeat(300) }).q).toHaveLength(100));
});

describe("listValues", () => {
  it("aceita vírgulas e parâmetros repetidos, sem duplicados", () => {
    expect(listValues(["a,b", "b", " c ", ""])).toEqual(["a", "b", "c"]);
    expect(listValues(undefined)).toEqual([]);
  });
});

describe("likePattern", () => {
  it("escapa curingas", () => expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%"));
});

describe("hasAnyFilter", () => {
  it("detecta filtros ativos", () => {
    expect(hasAnyFilter(parseFilters({}))).toBe(true); // início do ano atual por padrão
    const empty = parseFilters({ de: ALL_DATES });
    expect(hasAnyFilter(empty)).toBe(false);
    expect(hasAnyFilter({ ...empty, withoutAssociate: true })).toBe(true);
    expect(hasAnyFilter({ ...empty, categoryTokens: [id] })).toBe(true);
    expect(hasAnyFilter({ ...empty, divisionTokens: ["nenhum"] })).toBe(true);
    expect(hasAnyFilter(parseFilters({ de: ALL_DATES, divisao: "xyz" }))).toBe(false);
    expect(hasAnyFilter({ ...empty, accountIds: [id] })).toBe(true);
    expect(hasAnyFilter({ ...empty, reconciled: false })).toBe(true);
    expect(hasAnyFilter({ ...empty, minCents: 0 })).toBe(true);
    expect(hasAnyFilter(parseFilters({ de: ALL_DATES, valor_ate: "-100" }))).toBe(true);
  });
});

describe("parseOrder", () => {
  it("usa mais recentes primeiro por padrão", () => {
    expect(parseOrder({})).toBe("desc");
    expect(parseOrder({ ordem: "antigos" })).toBe("asc");
  });
});

describe("parseEntrySort", () => {
  it("usa data, mais recentes primeiro, por padrão", () => {
    expect(parseEntrySort({})).toEqual({ key: "data", dir: "desc" });
  });
  it("aceita o link antigo ordem=antigos", () => {
    expect(parseEntrySort({ ordem: "antigos" })).toEqual({ key: "data", dir: "asc" });
  });
  it("lê coluna e sentido", () => {
    expect(parseEntrySort({ ordem: "historico", dir: "desc" })).toEqual({ key: "historico", dir: "desc" });
    expect(parseEntrySort({ ordem: ["conta"], dir: "asc" })).toEqual({ key: "conta", dir: "asc" });
  });
  it("sentido padrão: texto crescente, data e valor decrescentes", () => {
    expect(parseEntrySort({ ordem: "forma" })).toEqual({ key: "forma", dir: "asc" });
    expect(parseEntrySort({ ordem: "valor" })).toEqual({ key: "valor", dir: "desc" });
    expect(parseEntrySort({ ordem: "data", dir: "asc" })).toEqual({ key: "data", dir: "asc" });
  });
  it("descarta chave ou sentido inválidos", () => {
    expect(parseEntrySort({ ordem: "xyz", dir: "baixo" })).toEqual({ key: "data", dir: "desc" });
    expect(parseEntrySort({ ordem: "valor", dir: "x" })).toEqual({ key: "valor", dir: "desc" });
  });
});
