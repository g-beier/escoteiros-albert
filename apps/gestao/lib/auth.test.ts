import { describe, expect, it } from "vitest";
import { canManageEntries, isValidEmail } from "./auth";

describe("isValidEmail", () => {
  it.each([" Pessoa@Example.com ", "nome.sobrenome@gmail.com", "x@sub.exemplo.org"])("aceita %s, de qualquer domínio", (email) =>
    expect(isValidEmail(email)).toBe(true));

  it.each(["@exemplo.org", "duplo@@exemplo.org", "sem-arroba", "nome@semponto", "com espaço@exemplo.org"])("rejeita %s", (email) =>
    expect(isValidEmail(email)).toBe(false));
});

describe("canManageEntries", () => {
  it("permite administrador e tesoureiro", () => {
    expect(canManageEntries("admin")).toBe(true);
    expect(canManageEntries("treasurer")).toBe(true);
  });

  it("mantém consulta somente leitura", () => expect(canManageEntries("viewer")).toBe(false));
});
