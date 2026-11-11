import { describe, expect, it } from "vitest";
import {
  closingCheck, guessPaymentMethod, ignoreReasonText, parsePeriod, safeReconciliationHref, selectionSummary, similarity,
  suggestedEntryName, suggestMatches, type OpenEntry, type OpenLine,
} from "./reconciliation";

const line = (id: string, date: string, amountCents: number, counterparty: string | null = null, description = counterparty ?? "linha"): OpenLine =>
  ({ id, date, amountCents, counterparty, description, kind: null });
const entry = (id: string, date: string, totalCents: number, name = id): OpenEntry => ({ id, date, totalCents, name });

describe("suggestMatches", () => {
  it("pairs a single candidate on each side with same date and signed amount", () => {
    const result = suggestMatches(
      [line("l1", "2026-05-18", -23990, "Lucas T F"), line("l2", "2026-05-18", -15000, "Comunidade")],
      [entry("e1", "2026-05-18", -23990, "Lucas material"), entry("e2", "2026-05-18", -15000, "Aluguel salão"), entry("e3", "2026-05-19", -15000)],
    );
    expect(result.exact).toEqual([{ lineId: "l2", entryId: "e2" }, { lineId: "l1", entryId: "e1" }]);
    expect(result.ambiguous).toEqual([]);
  });

  it("does not match opposite signs or different dates", () => {
    const result = suggestMatches([line("l1", "2026-05-18", 5000)], [entry("e1", "2026-05-18", -5000), entry("e2", "2026-05-17", 5000)]);
    expect(result).toEqual({ exact: [], ambiguous: [] });
  });

  it("groups several candidates without auto pairing, ranked by name similarity", () => {
    const result = suggestMatches(
      [line("l-ana", "2026-05-20", 2000, "ANA SOUZA"), line("l-bia", "2026-05-20", 2000, "Beatriz Lima")],
      [entry("e-bia", "2026-05-20", 2000, "Mensalidade Beatriz"), entry("e-ana", "2026-05-20", 2000, "Mensalidade Ana Souza"), entry("e-x", "2026-05-20", 2000, "Outro")],
    );
    expect(result.exact).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
    const [group] = result.ambiguous;
    expect(group.lineIds).toEqual(["l-ana", "l-bia"]);
    expect(group.candidates["l-ana"][0]).toBe("e-ana");
    expect(group.candidates["l-bia"][0]).toBe("e-bia");
    expect(group.entryIds).toEqual(["e-ana", "e-bia", "e-x"]);
  });

  it("excludes rejected pairs, which can turn an ambiguous group into exact pairs", () => {
    const lines = [line("l1", "2026-05-20", 2000), line("l2", "2026-05-20", 2000)];
    const entries = [entry("e1", "2026-05-20", 2000), entry("e2", "2026-05-20", 2000)];
    const result = suggestMatches(lines, entries, [{ lineId: "l1", entryId: "e2" }, { lineId: "l2", entryId: "e1" }]);
    expect(result.exact).toEqual([{ lineId: "l1", entryId: "e1" }, { lineId: "l2", entryId: "e2" }]);
    expect(result.ambiguous).toEqual([]);
  });

  it("never suggests a rejected 1:1 pair again", () => {
    const result = suggestMatches([line("l1", "2026-05-18", -100)], [entry("e1", "2026-05-18", -100)], [{ lineId: "l1", entryId: "e1" }]);
    expect(result).toEqual({ exact: [], ambiguous: [] });
  });

  it("keeps one line with two candidate entries ambiguous", () => {
    const result = suggestMatches([line("l1", "2026-05-18", -100, "Papelaria")], [entry("e1", "2026-05-18", -100, "Mercado"), entry("e2", "2026-05-18", -100, "Papelaria Central")]);
    expect(result.exact).toEqual([]);
    expect(result.ambiguous[0].candidates.l1).toEqual(["e2", "e1"]);
  });
});

describe("similarity", () => {
  it("ignores accents and case and accepts truncated prefixes", () => {
    expect(similarity("PIX TRANSF MARC", "Márcia")).toBe(1);
    expect(similarity("PIX TRANSF MARCIA 14 08", "Márcia Oliveira")).toBe(0.5);
    expect(similarity("Comunidade São José", "Aluguel salão")).toBe(0);
    expect(similarity("", "x")).toBe(0);
  });
});

describe("selectionSummary", () => {
  it("enables linking only when sums match and selection is not many-to-many", () => {
    expect(selectionSummary([-60000], [-40000, -20000])).toMatchObject({ canLink: true, difference: 0 });
    expect(selectionSummary([-60000], [-40000])).toMatchObject({ canLink: false, difference: -20000 });
    expect(selectionSummary([1000, 1000], [1000, 1000])).toMatchObject({ canLink: false, manyToMany: true });
    expect(selectionSummary([], [])).toMatchObject({ canLink: false });
  });
});

describe("parsePeriod", () => {
  const now = new Date("2026-02-10T15:00:00Z");
  it("defaults to the current month", () => {
    expect(parsePeriod(undefined, undefined, now)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("accepts valid dates and swaps inverted ones", () => {
    expect(parsePeriod("2026-05-01", "2026-05-31", now)).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(parsePeriod("2026-05-31", "2026-05-01", now)).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(parsePeriod("lixo", "2026-13-01", now)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("safeReconciliationHref", () => {
  it("keeps only known, valid params", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(safeReconciliationHref(`?conta=${id}&de=2026-05-01&ate=2026-05-31&x=1`)).toBe(`/conciliacao?conta=${id}&de=2026-05-01&ate=2026-05-31`);
    expect(safeReconciliationHref("conta=https://mal.com")).toBe("/conciliacao");
    expect(safeReconciliationHref(undefined)).toBe("/conciliacao");
  });
});

describe("guessPaymentMethod", () => {
  const methods = [
    { id: "pix", name: "PIX", active: true }, { id: "boleto", name: "Boleto", active: true },
    { id: "tarifa", name: "Tarifa bancária", active: true }, { id: "transf", name: "Transferência", active: false },
  ];
  it("maps statement kinds to existing active methods", () => {
    expect(guessPaymentMethod({ kind: "Pix enviado", description: "Pix enviado Fulano" }, methods)).toBe("pix");
    expect(guessPaymentMethod({ kind: "Pagamento de conta", description: "Pagamento de conta Enel" }, methods)).toBe("boleto");
    expect(guessPaymentMethod({ kind: null, description: "TARIFA PACOTE" }, methods)).toBe("tarifa");
    expect(guessPaymentMethod({ kind: null, description: "TED recebida" }, methods)).toBeUndefined();
    expect(guessPaymentMethod({ kind: null, description: "Compra" }, methods)).toBeUndefined();
  });
});

describe("helpers", () => {
  it("suggests the counterparty, else the description, as entry name", () => {
    expect(suggestedEntryName({ counterparty: " Fulano ", description: "Pix" })).toBe("Fulano");
    expect(suggestedEntryName({ counterparty: null, description: "TARIFA" })).toBe("TARIFA");
  });
  it("builds the ignore reason", () => {
    expect(ignoreReasonText("Linha duplicada", "")).toBe("Linha duplicada");
    expect(ignoreReasonText("Outro", "teste de banco")).toBe("Outro: teste de banco");
    expect(ignoreReasonText("Outro", " ")).toBe("");
  });
});

describe("closingCheck", () => {
  const period = { from: "2026-05-01", to: "2026-05-31" };
  const lines = [
    { date: "2026-05-02", amountCents: -1000, status: "conciliada" as const, ignoredReason: null },
    { date: "2026-05-03", amountCents: 500, status: "ignorada" as const, ignoredReason: "Estorno que se anula" },
    { date: "2026-05-03", amountCents: -500, status: "ignorada" as const, ignoredReason: "Estorno que se anula" },
    { date: "2026-05-04", amountCents: -999, status: "ignorada" as const, ignoredReason: "Linha duplicada" },
    { date: "2026-05-05", amountCents: -300, status: "aberta" as const, ignoredReason: null },
  ];
  it("compares opening + resolved movements with the statement closing balance", () => {
    const result = closingCheck(period, [{ periodFrom: "2026-05-01", periodTo: "2026-05-31", openingCents: 10000, closingCents: 8700 }], { openingBalanceCents: 0, openingDate: null }, lines);
    expect(result).toMatchObject({ ok: true, openingCents: 10000, movementsCents: -1000, pendingCents: -300, closingCents: 8700, differenceCents: -300 });
  });
  it("falls back to the account opening balance when it starts in the period", () => {
    const result = closingCheck(period, [{ periodFrom: "2026-05-01", periodTo: "2026-05-31", openingCents: null, closingCents: 9000 }], { openingBalanceCents: 10000, openingDate: "2026-05-01" }, lines);
    expect(result).toMatchObject({ ok: true, differenceCents: 0 });
  });
  it("says why it cannot compute", () => {
    expect(closingCheck(period, [], { openingBalanceCents: 0, openingDate: null }, lines)).toMatchObject({ ok: false });
    const noClosing = closingCheck(period, [{ periodFrom: "2026-05-01", periodTo: "2026-05-31", openingCents: 100, closingCents: null }], { openingBalanceCents: 0, openingDate: null }, lines);
    expect(noClosing.ok).toBe(false);
  });
});
