import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyOfxProfile, parseOfxDate, readOfx } from "./ofx";
import { decodeBytes } from "./text";

const fixture = (name: string) => decodeBytes(new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe("readOfx — Nubank (com tags de fechamento)", () => {
  const parsed = readOfx(fixture("nubank.ofx").text);

  it("lê conta, período, saldo final e transações", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.account).toEqual({ org: "NU PAGAMENTOS S.A.", bankId: "0260", branchId: "1", acctId: "00000000-0", currency: "BRL" });
    expect(parsed.signature).toBe("ofx:nu pagamentos s.a.");
    expect(parsed.periodFrom).toBe("2026-10-01");
    expect(parsed.periodTo).toBe("2026-10-31");
    expect(parsed.closingBalanceCents).toBe(235147);
    expect(parsed.openingBalanceCents).toBeUndefined();
    expect(parsed.lines).toHaveLength(5);
    expect(parsed.lines[1]).toEqual({
      date: "2026-10-05",
      amountCents: -25000,
      description:
        "Transferência enviada pelo Pix - CICRANO DA SILVA FICTICIO - •••.123.456-•• - BANCO INVENTADO S.A. (0998) Agência: 10 Conta: 99999-0",
      externalId: "a1b2c3d4-0000-4000-8000-000000000002",
      trnType: "DEBIT",
      sourceRow: 50,
    });
    expect(parsed.totals).toEqual({ creditsCents: 150312, debitsCents: -165165, netCents: -14853 });
  });

  it("separa tipo e contraparte do MEMO", () => {
    const applied = applyOfxProfile(parsed, { memoSplit: true });
    expect(applied.lines.map((line) => [line.kind, line.counterparty])).toEqual([
      ["Transferência recebida pelo Pix", "FULANA DE TESTE EXEMPLO"],
      ["Transferência enviada pelo Pix", "CICRANO DA SILVA FICTICIO"],
      ["Pagamento de boleto efetuado", "COMPANHIA DE AGUA IMAGINARIA"],
      ["Transferência enviada pelo Pix", "LOJA DE CAMPING FICTICIA LTDA"],
      [undefined, undefined],
    ]);
    expect(applied.lines[0].description).toBe(parsed.lines[0].description);
  });

  it("usa prefixos quando o MEMO não tem separador", () => {
    const applied = applyOfxProfile(parsed, { memoSplit: true, kindPrefixes: ["Rendimento"] });
    expect(applied.lines[4]).toMatchObject({ kind: "Rendimento", counterparty: "líquido" });
  });
});

describe("readOfx — Itaú (SGML sem tags de fechamento)", () => {
  const decoded = fixture("itau.ofx");
  const parsed = readOfx(decoded.text);

  it("ignora o ENCODING do cabeçalho e lê o UTF-8 real", () => {
    expect(decoded.text).toContain("ENCODING:USASCII");
    expect(decoded.encoding).toBe("utf-8");
    expect(parsed.lines[3].description).toBe("SALDO TOTAL DISPONÍVEL DIA");
  });

  it("lê transações, conta e período", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.account).toEqual({ bankId: "0341", acctId: "0000000000", currency: "BRL" });
    expect(parsed.signature).toBe("ofx:0341");
    expect(parsed.periodFrom).toBe("2026-10-01");
    expect(parsed.periodTo).toBe("2026-10-03");
    expect(parsed.closingBalanceCents).toBe(85300);
    expect(parsed.lines).toHaveLength(8);
    expect(parsed.lines[1]).toEqual({
      date: "2026-10-02",
      amountCents: 12000,
      description: "PIX TRANSF JOANA 02 10",
      externalId: "20261002001",
      trnType: "CREDIT",
      checkNumber: "20261002001",
      sourceRow: 48,
    });
  });

  it("descarta as pseudo-linhas de saldo com ignoreIf e recalcula os totais", () => {
    const applied = applyOfxProfile(parsed, {
      ignoreIf: ["saldo anterior", "SALDO TOTAL DISPONIVEL DIA"],
      kindPrefixes: ["PIX TRANSF", "PIX QRS", "PAY", "PAG BOLETO", "TAR"],
    });
    expect(applied.ignored).toEqual([
      { sourceRow: 40, reason: 'Contém "saldo anterior"' },
      { sourceRow: 64, reason: 'Contém "SALDO TOTAL DISPONIVEL DIA"' },
      { sourceRow: 96, reason: 'Contém "SALDO TOTAL DISPONIVEL DIA"' },
    ]);
    expect(applied.lines.map((line) => [line.amountCents, line.kind, line.counterparty])).toEqual([
      [12000, "PIX TRANSF", "JOANA 02 10"],
      [-4550, "PAY", "PADARIA 02 10"],
      [-150, "TAR", "PIX QR LIQ ESTATICO"],
      [8000, "PIX QRS", "MARCOS F 03 10"],
      [-30000, "PAG BOLETO", "GRAFICA EXEMPLO"],
    ]);
    expect(applied.totals).toEqual({ creditsCents: 20000, debitsCents: -34700, netCents: -14700 });
    expect(applied.closingBalanceCents).toBe(85300);
  });

  it("usa a pseudo-linha SALDO ANTERIOR ignorada como saldo inicial e confere com o saldo final", () => {
    expect(parsed.openingBalanceCents).toBeUndefined();
    const applied = applyOfxProfile(parsed, { ignoreIf: ["Saldo Anterior", "SALDO TOTAL DISPONÍVEL DIA"] });
    expect(applied.openingBalanceCents).toBe(100000);
    expect(applied.balanceCheck).toEqual({ ok: true });
  });

  it("não inventa saldo inicial quando SALDO ANTERIOR não é ignorado", () => {
    const applied = applyOfxProfile(parsed, { ignoreIf: ["SALDO TOTAL DISPONÍVEL DIA"] });
    expect(applied.openingBalanceCents).toBeUndefined();
    expect(applied.balanceCheck).toBeUndefined();
    expect(applied.lines[0]).toMatchObject({ description: "SALDO ANTERIOR", amountCents: 100000 });
  });
});

describe("readOfx — casos tolerados", () => {
  it("lê tudo numa linha só, com vírgula decimal, NAME e entidades", () => {
    const text =
      "OFXHEADER:100<OFX><BANKACCTFROM><BANKID>999<ACCTID>1</BANKACCTFROM><BANKTRANLIST>" +
      "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-10,50<FITID>A1<NAME>Loja A &amp; B</STMTTRN>" +
      "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260106120000.000[-3:BRT]<TRNAMT>5<NAME>Fulano<MEMO>Pix</STMTTRN>" +
      "<STMTTRN><DTPOSTED>2026<TRNAMT>x</STMTTRN></BANKTRANLIST></OFX>";
    const parsed = readOfx(text);
    expect(parsed.lines).toEqual([
      { date: "2026-01-05", amountCents: -1050, description: "Loja A & B", externalId: "A1", trnType: "DEBIT", payee: "Loja A & B", sourceRow: 1 },
      { date: "2026-01-06", amountCents: 500, description: "Pix", counterparty: "Fulano", trnType: "CREDIT", payee: "Fulano", sourceRow: 1 },
    ]);
    expect(parsed.errors).toEqual([{ sourceRow: 1, message: 'DTPOSTED inválido "2026"; TRNAMT inválido "x".' }]);
    expect(parsed.periodFrom).toBe("2026-01-05");
    expect(parsed.signature).toBe("ofx:999");
  });

  it("lê REFNUM", () => {
    const parsed = readOfx("<OFX><BANKACCTFROM><BANKID>1</BANKACCTFROM><STMTTRN><TRNTYPE>payment<DTPOSTED>20260105<TRNAMT>-1<REFNUM>R-9<MEMO>Conta</STMTTRN></OFX>");
    expect(parsed.lines[0]).toMatchObject({ trnType: "PAYMENT", reference: "R-9" });
  });

  it("rejeita texto sem <OFX>", () => {
    expect(readOfx("Data;Valor\n").errors).toEqual([{ sourceRow: 1, message: "Arquivo OFX sem a tag <OFX>." }]);
  });

  it.each([
    ["20261031000000[-3:BRT]", "2026-10-31"],
    ["20261031", "2026-10-31"],
    ["20261031235959.123[-03:EST]", "2026-10-31"],
    ["20261332", null],
    [undefined, null],
  ])("parseOfxDate(%s)", (raw, expected) => {
    expect(parseOfxDate(raw)).toBe(expected);
  });
});
