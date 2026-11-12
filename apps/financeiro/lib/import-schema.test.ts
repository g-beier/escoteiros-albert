import { describe, expect, it } from "vitest";
import { fromRpcImportResult, importLinesSchema, importProfileSchema, importSummary, parseStatementLines, toRpcLines } from "./import-schema";

const id = "0b6c7a4e-5d1f-4c1e-9a8b-2f3d4e5f6a7b";

describe("parseStatementLines", () => {
  it("aceita linhas no formato da biblioteca de importação", () => {
    const result = parseStatementLines([
      { date: "2026-11-03", amountCents: -1500, description: " PIX ENVIADO ", counterparty: "Fulano", balanceCents: 1000 },
      { date: "2026-11-04", amountCents: 2500, description: "TED", externalId: "ABC1", kind: null },
    ]);
    expect("lines" in result && result.lines[0].description).toBe("PIX ENVIADO");
  });

  it("aponta a linha inválida", () => {
    expect(parseStatementLines([{ date: "2026-11-03", amountCents: 1, description: "a" }, { date: "03/11/2026", amountCents: 1, description: "a" }]))
      .toEqual({ error: "Linha 2: Data inválida." });
    expect(parseStatementLines([{ date: "2026-11-03", amountCents: 1.5, description: "a" }])).toEqual({ error: "Linha 1: Use centavos inteiros." });
    expect(parseStatementLines([{ date: "2026-11-03", amountCents: 0, description: "a" }])).toEqual({ error: "Linha 1: O valor não pode ser zero." });
    expect(parseStatementLines([{ date: "2026-11-03", amountCents: 5, description: " " }])).toEqual({ error: "Linha 1: Histórico obrigatório." });
  });
});

describe("toRpcLines", () => {
  it("omite campos opcionais vazios e mantém saldo zero", () => {
    expect(toRpcLines([{ date: "2026-11-03", amountCents: -1500, description: "PIX", kind: "", counterparty: null, externalId: undefined, balanceCents: 0 }]))
      .toEqual([{ date: "2026-11-03", amountCents: -1500, description: "PIX", balanceCents: 0 }]);
  });

  it("envia os campos do OFX", () => {
    expect(toRpcLines([{ date: "2026-11-03", amountCents: -1, description: "x", trnType: "PAYMENT", checkNumber: "12", reference: "R", payee: "Loja" }]))
      .toEqual([{ date: "2026-11-03", amountCents: -1, description: "x", trnType: "PAYMENT", checkNumber: "12", reference: "R", payee: "Loja" }]);
  });
});

describe("importLinesSchema", () => {
  const base = { accountId: id, fileName: "extrato.csv", lines: [{}] };
  it("exige conta e linhas", () => {
    expect(importLinesSchema.safeParse(base).success).toBe(true);
    expect(importLinesSchema.safeParse({ ...base, accountId: "" }).error?.issues[0]?.message).toBe("Escolha a conta.");
    expect(importLinesSchema.safeParse({ ...base, lines: [] }).error?.issues[0]?.message).toBe("Nenhuma linha para importar.");
  });

  it("rejeita período invertido", () => {
    expect(importLinesSchema.safeParse({ ...base, periodFrom: "2026-11-30", periodTo: "2026-11-01" }).error?.issues[0]?.message).toMatch(/período/);
  });
});

describe("importProfileSchema", () => {
  it("valida nome, formato e configurações", () => {
    expect(importProfileSchema.safeParse({ name: "Sicredi CSV", format: "csv", settings: { delimiter: ";" } }).success).toBe(true);
    expect(importProfileSchema.safeParse({ name: "Sicredi", format: "xls", settings: {} }).error?.issues[0]?.message).toBe("Formato de arquivo inválido.");
    expect(importProfileSchema.safeParse({ name: "Sicredi", format: "csv", settings: [] }).success).toBe(false);
  });
});

describe("resultado da importação", () => {
  it("converte o jsonb do banco", () => {
    expect(fromRpcImportResult({ import_id: id, inserted: 3, skipped_duplicates: 1 })).toEqual({ importId: id, inserted: 3, skippedDuplicates: 1 });
    expect(fromRpcImportResult(null)).toBeNull();
  });

  it("resume para o toast", () => {
    expect(importSummary({ inserted: 12, skippedDuplicates: 3 })).toBe("12 linhas importadas, 3 já existiam.");
    expect(importSummary({ inserted: 1, skippedDuplicates: 0 })).toBe("1 linha importada.");
    expect(importSummary({ inserted: 0, skippedDuplicates: 1 })).toBe("Nenhuma linha nova, 1 já existia.");
  });
});
