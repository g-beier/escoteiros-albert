import { describe, expect, it } from "vitest";
import { formatLedgerCode, isLedgerCode, parseLedgerCode } from "./ledger-code";

describe("ledger code", () => {
  it("validates the mask", () => {
    expect(isLedgerCode("3.1.2.1.0005")).toBe(true);
    expect(isLedgerCode("3.1.2.1.005")).toBe(false);
    expect(isLedgerCode("3.1.2.10.0005")).toBe(false);
    expect(isLedgerCode("")).toBe(false);
  });

  it("formats while typing", () => {
    expect(formatLedgerCode("3")).toBe("3");
    expect(formatLedgerCode("3121")).toBe("3.1.2.1");
    expect(formatLedgerCode("31210")).toBe("3.1.2.1.0");
    expect(formatLedgerCode("3.1.2.1.00051")).toBe("3.1.2.1.0005");
    expect(formatLedgerCode("abc")).toBe("");
  });

  it("parses form values", () => {
    expect(parseLedgerCode("  ")).toEqual({ ok: true, value: null });
    expect(parseLedgerCode("3.1.2.1.0005")).toEqual({ ok: true, value: "3.1.2.1.0005" });
    expect(parseLedgerCode("31")).toMatchObject({ ok: false });
  });
});
