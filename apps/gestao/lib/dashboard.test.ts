import { describe, expect, it } from "vitest";
import { recentListStart, recentWindowStart } from "./dashboard";

describe("recentWindowStart", () => {
  it("volta 7 dias", () => {
    expect(recentWindowStart("2026-11-12")).toBe("2026-11-05");
  });
  it("atravessa mês e ano", () => {
    expect(recentWindowStart("2026-03-03")).toBe("2026-02-24");
    expect(recentWindowStart("2027-01-02")).toBe("2026-12-26");
  });
});

describe("recentListStart", () => {
  it("inclui o último dia com lançamentos antes da janela", () => {
    expect(recentListStart("2026-11-05", "2026-11-01")).toBe("2026-11-01");
  });
  it("sem lançamento anterior, fica na janela", () => {
    expect(recentListStart("2026-11-05", null)).toBe("2026-11-05");
  });
});
