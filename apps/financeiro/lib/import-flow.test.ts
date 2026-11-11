import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  csvSettingsFromProfile, detectFormat, distinctValues, dropZeroLines, findMatchingProfile, guessColumns, missingRoles,
  newCsvSettings, newOfxSettings, ofxSettingsFromProfile, parseTextList, pruneColumns, reconciliationHref, roleOf,
  sameSettings, setColumnRole, toImportLines,
} from "@/lib/import-flow";
import { importLinesSchema, parseStatementLines } from "@/lib/import-schema";
import { applyOfxProfile, applyProfile, decodeBytes, headerSignature, readCsv, readOfx, type ParsedStatement, type ProfileColumns } from "@/lib/statement-import";

const fixture = (name: string) =>
  decodeBytes(new Uint8Array(readFileSync(new URL(`./statement-import/__fixtures__/${name}`, import.meta.url))));

describe("detectFormat", () => {
  it("reconhece OFX pelo conteúdo, não pela extensão", () => {
    expect(detectFormat(fixture("itau.ofx").text)).toBe("ofx");
    expect(detectFormat(fixture("nubank.ofx").text)).toBe("ofx");
    expect(detectFormat('<?xml version="1.0"?>\n<?OFX OFXHEADER="200"?>')).toBe("ofx");
    expect(detectFormat(fixture("cora.csv").text)).toBe("csv");
  });
});

describe("papéis das colunas", () => {
  const header = ["Data", "Transação", "Tipo Transação", "Identificação", "Valor"];
  const base: ProfileColumns = { date: "Data", amount: "Valor", description: ["Transação"] };

  it("lê o papel de cada coluna sem diferenciar acentos", () => {
    expect(header.map((name) => roleOf(base, name))).toEqual(["date", "description", "ignore", "ignore", "amount"]);
    expect(roleOf(base, "TRANSACAO")).toBe("description");
  });

  it("move papéis únicos, exclui Valor × Crédito/Débito e ordena a descrição pelo arquivo", () => {
    let columns = setColumnRole(base, header, 3, "description");
    expect(columns.description).toEqual(["Transação", "Identificação"]);
    columns = setColumnRole(columns, header, 1, "date");
    expect(columns).toEqual({ date: "Transação", amount: "Valor", description: ["Identificação"] });
    columns = setColumnRole(columns, header, 4, "credit");
    expect(columns.amount).toBeUndefined();
    expect(columns.credit).toBe("Valor");
    columns = setColumnRole(columns, header, 0, "amount");
    expect(columns).toMatchObject({ amount: "Data" });
    expect(columns.credit).toBeUndefined();
    expect(setColumnRole(columns, header, 0, "ignore").amount).toBeUndefined();
  });

  it("natureza exige marcar os valores de saída", () => {
    const columns = setColumnRole(base, header, 2, "nature");
    expect(columns.debitValues).toEqual([]);
    expect(missingRoles(columns)).toEqual(["Natureza C/D: marque quais valores indicam saída"]);
    expect(missingRoles({ ...columns, debitValues: ["DÉBITO"] })).toEqual([]);
    expect(setColumnRole({ ...columns, debitValues: ["DÉBITO"] }, header, 2, "ignore").debitValues).toBeUndefined();
  });

  it("lista os papéis obrigatórios que faltam", () => {
    expect(missingRoles({ date: "", description: [] })).toEqual(["Data", "Valor (ou Crédito/Débito)", "Descrição"]);
    expect(missingRoles({ date: "Data", debit: "Débito", description: ["Histórico"] })).toEqual([]);
  });

  it("descarta colunas que não estão no cabeçalho atual", () => {
    const columns: ProfileColumns = { date: "Data", amount: "Outra", nature: "Tipo Transação", debitValues: ["D"], description: ["Transação", "Sumiu"] };
    expect(pruneColumns(columns, header)).toEqual({ date: "Data", nature: "Tipo Transação", debitValues: ["D"], description: ["Transação"] });
  });

  it("lista valores distintos de uma coluna", () => {
    const rows = [["a", "DÉBITO"], ["b", "CRÉDITO"], ["c", "débito"], ["d", ""]];
    expect(distinctValues(["x", "y"], rows, "Y")).toEqual(["DÉBITO", "CRÉDITO"]);
    expect(distinctValues(["x", "y"], rows, undefined)).toEqual([]);
  });
});

describe("sugestões para um arquivo sem perfil", () => {
  it("Mercado Pago: data pelas amostras, demais papéis pelo nome", () => {
    const { text } = fixture("mercadopago.csv");
    const settings = newCsvSettings(text, "utf-8");
    expect(settings).toMatchObject({ delimiter: ";", headerRow: 4, dateFormat: "DD-MM-YYYY", decimal: "comma" });
    expect(settings.columns).toEqual({
      date: "RELEASE_DATE",
      amount: "TRANSACTION_NET_AMOUNT",
      description: ["TRANSACTION_TYPE"],
      externalId: "REFERENCE_ID",
      balance: "PARTIAL_BALANCE",
    });
    const parsed = applyProfile(text, settings);
    expect(parsed.errors).toEqual([]);
    expect(parsed.balanceCheck).toEqual({ ok: true });
  });

  it("Cora: natureza com os valores de débito e contraparte", () => {
    const { text } = fixture("cora.csv");
    const settings = newCsvSettings(text, "utf-8");
    expect(settings.columns).toEqual({
      date: "Data",
      amount: "Valor",
      nature: "Tipo Transação",
      debitValues: ["DÉBITO"],
      counterparty: "Identificação",
      description: ["Transação"],
    });
    expect(applyProfile(text, settings).totals.netCents).toBe(-150215);
  });

  it("não marca natureza sem valores que indiquem saída", () => {
    expect(guessColumns(["Data", "Natureza", "Valor"], [["01/01/2026", "X", "1,00"]], "DD/MM/YYYY")).toEqual({
      date: "Data", amount: "Valor", description: [],
    });
  });

  it("OFX: separa o MEMO quando a maioria das linhas tem ' - '", () => {
    expect(newOfxSettings(readOfx(fixture("nubank.ofx").text).lines.map((l) => l.description)).memoSplit).toBe(true);
    expect(newOfxSettings(readOfx(fixture("itau.ofx").text).lines.map((l) => l.description)).memoSplit).toBe(false);
  });
});

describe("perfis salvos", () => {
  const { text } = fixture("mercadopago.csv");
  const saved = newCsvSettings(text, "utf-8");
  const profiles = [
    { id: "ofx", format: "ofx" as const, header_signature: "ofx:0341", settings: { memoSplit: false } },
    { id: "mp", format: "csv" as const, header_signature: headerSignature(readCsv(text, saved).header), settings: saved },
  ];

  it("reconhece o arquivo lendo-o com as configurações de cada perfil", () => {
    const signatureFor = (profile: (typeof profiles)[number]) => {
      const settings = csvSettingsFromProfile(profile.settings);
      return settings ? headerSignature(readCsv(text, settings).header) : null;
    };
    expect(findMatchingProfile(profiles, "csv", signatureFor)?.id).toBe("mp");
    expect(findMatchingProfile(profiles, "ofx", () => "ofx:0341")?.id).toBe("ofx");
    expect(findMatchingProfile(profiles, "ofx", () => "ofx:nu")).toBeUndefined();
  });

  it("lê configurações salvas e recusa formatos desconhecidos", () => {
    expect(csvSettingsFromProfile(saved)).toEqual(saved);
    expect(csvSettingsFromProfile({ delimiter: ";" })).toBeNull();
    expect(ofxSettingsFromProfile({ memoSplit: true, ignoreIf: ["X"] })).toEqual({ memoSplit: true, kindPrefixes: [], ignoreIf: ["X"] });
    expect(ofxSettingsFromProfile(null)).toEqual({ memoSplit: false, kindPrefixes: [], ignoreIf: [] });
  });

  it("compara configurações sem depender da ordem das chaves nem de listas vazias", () => {
    expect(sameSettings({ a: 1, b: [], c: { d: "x" } }, { c: { d: "x" }, a: 1 })).toBe(true);
    expect(sameSettings({ memoSplit: false }, {})).toBe(true);
    expect(sameSettings({ a: ["x", "y"] }, { a: ["y", "x"] })).toBe(false);
  });

  it("lê a lista de linhas a ignorar sem vazios nem repetidos", () => {
    expect(parseTextList(" SALDO ANTERIOR \n\nsaldo anterior\nTARIFA\r\n")).toEqual(["SALDO ANTERIOR", "TARIFA"]);
  });
});

describe("envio", () => {
  const statement: ParsedStatement = {
    lines: [
      { date: "2026-10-01", amountCents: 0, description: "Estorno", sourceRow: 2 },
      { date: "2026-10-01", amountCents: -500, description: "", counterparty: "Fulano", sourceRow: 3 },
      { date: "2026-10-02", amountCents: 700, description: "x".repeat(600), kind: "k".repeat(300), sourceRow: 5 },
    ],
    errors: [],
    ignored: [{ sourceRow: 4, reason: 'Contém "SALDO"' }],
    totals: { creditsCents: 700, debitsCents: -500, netCents: 200 },
  };

  it("tira linhas de valor zero e as mostra como ignoradas", () => {
    const result = dropZeroLines(statement);
    expect(result.lines.map((line) => line.sourceRow)).toEqual([3, 5]);
    expect(result.ignored).toEqual([{ sourceRow: 2, reason: "Valor zero" }, { sourceRow: 4, reason: 'Contém "SALDO"' }]);
    expect(dropZeroLines(result)).toBe(result);
  });

  it("garante histórico e respeita os limites de tamanho", () => {
    const [first, second] = toImportLines(dropZeroLines(statement).lines);
    expect(first).toMatchObject({ description: "Fulano", counterparty: "Fulano", amountCents: -500 });
    expect(second.description).toHaveLength(500);
    expect(second.kind).toHaveLength(200);
    expect(toImportLines([{ date: "2026-01-01", amountCents: 1, description: "", sourceRow: 1 }])[0].description).toBe("Sem histórico");
  });

  it("monta o link da conciliação", () => {
    expect(reconciliationHref("abc", "2026-10-01", "2026-10-31")).toBe("/conciliacao?conta=abc&de=2026-10-01&ate=2026-10-31");
    expect(reconciliationHref("abc")).toBe("/conciliacao?conta=abc");
  });
});

describe("arquivo sem perfil até o payload do servidor", () => {
  it.each(["mercadopago.csv", "cora.csv", "latin1-bank.csv", "nubank.ofx", "itau.ofx"])("%s gera linhas aceitas pela validação", (name) => {
    const { text, encoding } = fixture(name);
    const statement = detectFormat(text) === "ofx"
      ? applyOfxProfile(readOfx(text), newOfxSettings(readOfx(text).lines.map((line) => line.description)))
      : applyProfile(text, newCsvSettings(text, encoding));
    const lines = toImportLines(dropZeroLines(statement).lines);
    expect(lines.length).toBeGreaterThan(0);
    expect(parseStatementLines(lines)).toEqual({ lines: expect.any(Array) });
    const payload = { accountId: "00000000-0000-4000-8000-000000000001", fileName: name, periodFrom: statement.periodFrom, periodTo: statement.periodTo, lines };
    expect(importLinesSchema.safeParse(payload).success).toBe(true);
  });

  it("Itaú OFX sem perfil: pseudo-linhas de saldo ignoradas e saldo anterior como saldo inicial", () => {
    const { text } = fixture("itau.ofx");
    const statement = applyOfxProfile(readOfx(text), newOfxSettings([]));
    expect(statement.ignored).toHaveLength(3);
    expect(statement.openingBalanceCents).toBe(100000);
    expect(statement.balanceCheck).toEqual({ ok: true });
  });
});
