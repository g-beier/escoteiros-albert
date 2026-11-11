import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyProfile } from "./apply";
import { readCsv, sniffCsv } from "./csv";
import { headerSignature, suggestKindPrefixes } from "./profile";
import { decodeBytes } from "./text";
import type { ProfileSettings } from "./types";

const fixtureBytes = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));
const fixture = (name: string) => decodeBytes(fixtureBytes(name)).text;

const mercadoPago: ProfileSettings = {
  encoding: "utf-8",
  delimiter: ";",
  headerRow: 4,
  dateFormat: "DD-MM-YYYY",
  decimal: "comma",
  columns: {
    date: "RELEASE_DATE",
    amount: "TRANSACTION_NET_AMOUNT",
    description: ["TRANSACTION_TYPE"],
    externalId: "REFERENCE_ID",
    balance: "PARTIAL_BALANCE",
  },
  kindPrefixes: ["Pix recebido", "Pix enviado", "Pagamento com QR Pix", "Pagamento de conta", "Pagamento"],
};

const cora: ProfileSettings = {
  encoding: "utf-8",
  delimiter: ",",
  headerRow: 1,
  dateFormat: "DD/MM/YYYY",
  decimal: "dot",
  columns: {
    date: "Data",
    amount: "Valor",
    nature: "Tipo Transação",
    debitValues: ["DÉBITO"],
    description: ["Transação", "Identificação"],
    counterparty: "Identificação",
  },
  kindPrefixes: ["Transf Pix enviada", "Transf Pix recebida", "Boleto pago"],
};

const latin1Bank: ProfileSettings = {
  encoding: "latin1",
  delimiter: ";",
  headerRow: 4,
  dateFormat: "DD/MM/YYYY",
  decimal: "comma",
  columns: {
    date: "data",
    credit: "Credito",
    debit: "DÉBITO",
    description: ["Histórico"],
    externalId: "Documento",
    balance: "Saldo",
  },
  kindPrefixes: ["TED RECEBIDA", "PAGTO BOLETO", "Deposito"],
  ignoreIf: ["saldo anterior", "S A L D O"],
};

describe("applyProfile — Mercado Pago", () => {
  const text = fixture("mercadopago.csv");
  const parsed = applyProfile(readCsv(text, mercadoPago), mercadoPago);

  it("lê todas as linhas com sinal, tipo, contraparte e id", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.ignored).toEqual([]);
    expect(parsed.lines).toHaveLength(12);
    expect(parsed.lines[0]).toEqual({
      date: "2026-10-01",
      amountCents: 5000,
      description: "Pix recebido MARIA DA SILVA TESTE",
      kind: "Pix recebido",
      counterparty: "MARIA DA SILVA TESTE",
      externalId: "900000000001",
      balanceCents: 155000,
      sourceRow: 5,
    });
    expect(parsed.lines[3]).toMatchObject({ kind: "Pagamento com QR Pix", counterparty: "MERCADINHO IMAGINARIO", amountCents: -3590 });
    expect(parsed.lines[5]).toMatchObject({ kind: "Pagamento de conta", amountCents: -131175 });
    expect(parsed.lines[9]).toMatchObject({ description: "Rendimentos" });
    expect(parsed.lines[9].kind).toBeUndefined();
  });

  it("confere totais, período e saldos com o bloco de resumo", () => {
    expect(parsed.totals).toEqual({ creditsCents: 277862, debitsCents: -161830, netCents: 116032 });
    expect(parsed.periodFrom).toBe("2026-10-01");
    expect(parsed.periodTo).toBe("2026-10-31");
    expect(parsed.openingBalanceCents).toBe(150000);
    expect(parsed.closingBalanceCents).toBe(266032);
    expect(parsed.balanceCheck).toEqual({ ok: true });
  });

  it("aceita o texto direto, lendo com as configurações do perfil", () => {
    expect(applyProfile(text, mercadoPago)).toEqual(parsed);
  });

  it("aponta a primeira linha em que o saldo não fecha", () => {
    const broken = text.replace("-120,00;1.505,50", "-12,00;1.505,50");
    const result = applyProfile(broken, mercadoPago);
    expect(result.balanceCheck).toEqual({ ok: false, firstMismatchRow: 7 });
  });

  it("acusa divergência entre o bloco de resumo e os saldos das linhas", () => {
    const result = applyProfile(text.replace("1.500,00;2.778,62", "1.400,00;2.778,62"), mercadoPago);
    expect(result.balanceCheck).toEqual({ ok: false });
    expect(result.openingBalanceCents).toBe(150000);
  });

  it("usa o bloco de resumo quando não há coluna de saldo", () => {
    const settings = { ...mercadoPago, columns: { ...mercadoPago.columns, balance: undefined } };
    const result = applyProfile(text, settings);
    expect(result.openingBalanceCents).toBe(150000);
    expect(result.closingBalanceCents).toBe(266032);
    expect(result.balanceCheck).toEqual({ ok: true });
    const missing = applyProfile(text.replace(/^.*Rendimentos.*\n/m, ""), settings);
    expect(missing.balanceCheck).toEqual({ ok: false });
  });

  it("aceita extrato do mais recente para o mais antigo", () => {
    const lines = text.trimEnd().split("\n");
    const reversed = [...lines.slice(0, 4), ...lines.slice(4).reverse()].join("\n");
    const result = applyProfile(reversed, mercadoPago);
    expect(result.balanceCheck).toEqual({ ok: true });
    expect(result.openingBalanceCents).toBe(150000);
    expect(result.closingBalanceCents).toBe(266032);
  });

  it("sugere os prefixos de tipo mais frequentes", () => {
    const table = readCsv(text, mercadoPago);
    expect(suggestKindPrefixes(table.rows.map((row) => row[1]))).toEqual([
      { prefix: "Pix recebido", count: 5 },
      { prefix: "Pagamento com QR Pix", count: 2 },
      { prefix: "Pagamento de conta", count: 2 },
      { prefix: "Pix enviado", count: 2 },
    ]);
  });
});

describe("applyProfile — Cora", () => {
  const parsed = applyProfile(fixture("cora.csv"), cora);

  it("usa a coluna DÉBITO/CRÉDITO para o sinal e a coluna de identificação como contraparte", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.lines.map((line) => line.amountCents)).toEqual([-15000, -15050, 20000, -131175, -8990]);
    expect(parsed.lines[2]).toEqual({
      date: "2026-05-19",
      amountCents: 20000,
      description: "Transf Pix recebida Beltrana Exemplo, ME",
      kind: "Transf Pix recebida",
      counterparty: "Beltrana Exemplo, ME",
      sourceRow: 4,
    });
    expect(parsed.totals).toEqual({ creditsCents: 20000, debitsCents: -170215, netCents: -150215 });
    expect(parsed.balanceCheck).toBeUndefined();
    expect(parsed.openingBalanceCents).toBeUndefined();
  });

  it("força o sinal pela natureza mesmo quando o valor vem sem sinal", () => {
    const text = "Data,Transação,Tipo Transação,Identificação,Valor\n01/06/2026,Transf Pix enviada,débito,X,150\n02/06/2026,Transf Pix recebida,CREDITO,Y,-20\n";
    expect(applyProfile(text, cora).lines.map((line) => line.amountCents)).toEqual([-15000, 2000]);
  });

  it("gera a mesma assinatura do cabeçalho independentemente de caixa e acentos", () => {
    const signature = headerSignature(readCsv(fixture("cora.csv"), cora).header);
    expect(signature).toBe("data|transacao|tipo transacao|identificacao|valor");
    expect(headerSignature([" DATA", "Transacao ", "TIPO TRANSAÇÃO", "Identificação", "valor"])).toBe(signature);
  });
});

describe("applyProfile — banco em latin1 com crédito/débito", () => {
  const bytes = fixtureBytes("latin1-bank.csv");
  const { text, encoding } = decodeBytes(bytes);

  it("detecta latin1 e ignora pseudo-linhas de saldo", () => {
    expect(encoding).toBe("latin1");
    expect(sniffCsv(text).headerRow).toBe(4);
    const parsed = applyProfile(text, latin1Bank);
    expect(parsed.errors).toEqual([]);
    expect(parsed.ignored).toEqual([
      { sourceRow: 5, reason: 'Contém "saldo anterior"' },
      { sourceRow: 10, reason: 'Contém "S A L D O"' },
    ]);
    expect(parsed.lines.map((line) => [line.amountCents, line.kind, line.counterparty])).toEqual([
      [35000, "Deposito", "EM DINHEIRO"],
      [-1290, undefined, undefined],
      [-123456, "PAGTO BOLETO", "Gráfica São José Fictícia"],
      [200000, "TED RECEBIDA", "Conceição Exemplo"],
    ]);
    expect(parsed.lines[0].externalId).toBe("000123");
    expect(parsed.openingBalanceCents).toBe(100000);
    expect(parsed.closingBalanceCents).toBe(210254);
    expect(parsed.balanceCheck).toEqual({ ok: true });
    expect(parsed.totals).toEqual({ creditsCents: 235000, debitsCents: -124746, netCents: 110254 });
  });

  it("registra erros por linha sem interromper a importação", () => {
    const broken = text
      .replace("05/03/2026;TARIFA", "35/03/2026;TARIFA")
      .replace("2.000,00;;2.102,54", "dois mil;;2.102,54")
      .replace("02/03/2026;DEPÓSITO EM DINHEIRO;000123;350,00;", "02/03/2026;DEPÓSITO EM DINHEIRO;000123;;");
    const parsed = applyProfile(broken, latin1Bank);
    expect(parsed.errors).toEqual([
      { sourceRow: 6, message: "Sem valor de crédito nem de débito." },
      { sourceRow: 7, message: 'Data inválida "35/03/2026".' },
      { sourceRow: 9, message: 'Crédito inválido "dois mil".' },
    ]);
    expect(parsed.lines).toHaveLength(1);
  });

  it("informa colunas inexistentes no cabeçalho", () => {
    const parsed = applyProfile(text, { ...latin1Bank, columns: { ...latin1Bank.columns, balance: "Saldo final", description: ["Memo"] } });
    expect(parsed.lines).toEqual([]);
    expect(parsed.errors).toEqual([{ sourceRow: 4, message: "Coluna não encontrada: Saldo final, Memo." }]);
  });

  it("exige coluna de valor ou de crédito/débito", () => {
    const parsed = applyProfile(text, { ...latin1Bank, columns: { date: "Data", description: ["Histórico"] } });
    expect(parsed.errors[0].message).toMatch(/coluna de valor/);
  });
});

describe("suggestKindPrefixes", () => {
  it("para no separador e não desce em nomes variados", () => {
    const values = [
      "PAY BOURBON 13 08",
      "PAY BOURBON 14 08",
      "PAY ZAFFARI 13 08",
      "PAY ZAFFARI 15 08",
      "PAY PADARIA 01 08",
      "PAY MERCADO 02 08",
      "PAY FARMACIA 03 08",
      "PIX TRANSF ANA 01 08",
      "PIX TRANSF BRUNO 02 08",
      "PIX QRS CARLA 03 08",
      "PIX QRS DIEGO 04 08",
      "Transferência enviada pelo Pix - FULANO - 123",
      "Transferência enviada pelo Pix - FULANO - 123",
      "Transferência enviada pelo Pix - CICRANO - 456",
      "SALDO ANTERIOR",
    ];
    expect(suggestKindPrefixes(values)).toEqual([
      { prefix: "PAY", count: 7 },
      { prefix: "Transferência enviada pelo Pix", count: 3 },
      { prefix: "PIX QRS", count: 2 },
      { prefix: "PIX TRANSF", count: 2 },
    ]);
  });
});
