import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dropZeroLines, isOfx, newOfxSettings, ofxSettingsFromProfile, parseTextList, profileForAccount, reconciliationHref, sameSettings,
  toImportLines,
} from "@/lib/import-flow";
import { importLinesSchema, parseStatementLines } from "@/lib/import-schema";
import { applyOfxProfile, decodeBytes, readOfx, type ParsedStatement } from "@/lib/statement-import";

const fixture = (name: string) =>
  decodeBytes(new Uint8Array(readFileSync(new URL(`./statement-import/__fixtures__/${name}`, import.meta.url))));

describe("isOfx", () => {
  it("reconhece OFX pelo conteúdo, não pela extensão", () => {
    expect(isOfx(fixture("itau.ofx").text)).toBe(true);
    expect(isOfx(fixture("nubank.ofx").text)).toBe(true);
    expect(isOfx('<?xml version="1.0"?>\n<?OFX OFXHEADER="200"?>')).toBe(true);
    expect(isOfx("Data,Transação,Valor\n01/10/2026,Pix,10.00")).toBe(false);
  });
});

describe("perfil novo", () => {
  it("OFX: separa o MEMO quando a maioria das linhas tem ' - '", () => {
    expect(newOfxSettings(readOfx(fixture("nubank.ofx").text).lines.map((l) => l.description)).memoSplit).toBe(true);
    expect(newOfxSettings(readOfx(fixture("itau.ofx").text).lines.map((l) => l.description)).memoSplit).toBe(false);
  });
});

describe("perfis salvos", () => {
  it("lê configurações salvas e completa as que faltam", () => {
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
  it.each(["nubank.ofx", "itau.ofx"])("%s gera linhas aceitas pela validação", (name) => {
    const { text } = fixture(name);
    const statement = applyOfxProfile(readOfx(text), newOfxSettings(readOfx(text).lines.map((line) => line.description)));
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

describe("profileForAccount", () => {
  const profiles = [
    { id: "nu", format: "ofx" as const, header_signature: "ofx:conversor" },
    { id: "cora", format: "ofx" as const, header_signature: "ofx:conversor" },
    { id: "csv", format: "csv", header_signature: "ofx:outro" },
  ];
  it("prefere o perfil da última importação da conta, depois a assinatura", () => {
    expect(profileForAccount(profiles, "cora", "ofx:conversor")?.id).toBe("cora");
    expect(profileForAccount(profiles, null, "ofx:conversor")?.id).toBe("nu");
    // perfis CSV antigos, que ficaram no banco, nunca são usados
    expect(profileForAccount(profiles, "csv", "ofx:outro")).toBeUndefined();
  });
});
