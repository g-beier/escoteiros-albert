import { describe, expect, it } from "vitest";
import { MODULE_ROLES, roleAtLeast } from "@geas/ui/lib/roles";
import { isValidEmail } from "./auth";

describe("isValidEmail", () => {
  it.each([" Pessoa@Example.com ", "nome.sobrenome@gmail.com", "x@sub.exemplo.org"])(
    "aceita %s, de qualquer domínio",
    (email) => expect(isValidEmail(email)).toBe(true),
  );

  it.each(["@exemplo.org", "duplo@@exemplo.org", "sem-arroba", "nome@semponto", "com espaço@exemplo.org"])(
    "rejeita %s",
    (email) => expect(isValidEmail(email)).toBe(false),
  );
});

describe("roleAtLeast", () => {
  it("segue a ordem Sem acesso < Consulta < Colaborador < Editor < Administrador", () => {
    expect(MODULE_ROLES).toEqual(["none", "viewer", "contributor", "editor", "admin"]);
    expect(roleAtLeast("contributor", "viewer")).toBe(true);
    expect(roleAtLeast("contributor", "editor")).toBe(false);
    expect(roleAtLeast("admin", "editor")).toBe(true);
    expect(roleAtLeast("none", "viewer")).toBe(false);
  });
});
