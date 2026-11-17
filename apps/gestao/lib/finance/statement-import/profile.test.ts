import { describe, expect, it } from "vitest";
import { headerSignature, suggestKindPrefixes } from "./profile";

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

describe("headerSignature", () => {
  it("usa a instituição ou o código do banco, sem caixa nem acentos", () => {
    expect(headerSignature({ org: "Banco Itaú" })).toBe("ofx:banco itau");
    expect(headerSignature({ bankId: "0341" })).toBe("ofx:0341");
    expect(headerSignature({})).toBe("ofx:");
  });
});
