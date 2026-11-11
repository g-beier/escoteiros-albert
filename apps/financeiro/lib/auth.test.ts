import { describe, expect, it } from "vitest";
import { canManageEntries, isAllowedEmail } from "./auth";

describe("isAllowedEmail", () => {
  it("aceita o domínio institucional sem distinguir maiúsculas", () => {
    expect(isAllowedEmail(" Pessoa@EscoteirosAlbert.com.br ")).toBe(true);
  });

  it.each([
    "pessoa@example.com",
    "pessoa@sub.escoteirosalbert.com.br",
    "pessoa@escoteirosalbert.com.br.evil.test",
    "@escoteirosalbert.com.br",
    "duplo@@escoteirosalbert.com.br",
  ])("rejeita %s", (email) => expect(isAllowedEmail(email)).toBe(false));
});

describe("canManageEntries", () => {
  it("permite administrador e tesoureiro", () => {
    expect(canManageEntries("admin")).toBe(true);
    expect(canManageEntries("treasurer")).toBe(true);
  });

  it("mantém consulta somente leitura", () => expect(canManageEntries("viewer")).toBe(false));
});
