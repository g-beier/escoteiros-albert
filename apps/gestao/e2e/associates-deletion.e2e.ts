import { expect, test } from "@playwright/test";
import { literal, psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { uniqueName } from "./support/entries";

// Excluir associado (018): o Editor pede a exclusão no detalhe, o cadastro some da lista, aparece em Configurações ›
// Excluídos e pode ser restaurado. Associado criado direto no banco (nome único) e apagado no fim.
test.describe.configure({ mode: "serial" });

const person = uniqueName("Duplicado");
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;
let id = "";

test.beforeAll(() => {
  id = psql(
    `insert into public.associates(group_id, name, branch) values (${group}, ${literal(person)}, 'adulto') returning id;`,
  );
});

test.afterAll(() => {
  psql(`delete from public.associates where id = ${literal(id)};`);
});

test("editor exclui um cadastro, ele some e volta ao restaurar", async ({ page }) => {
  await page.goto(`/associados/${id}`);
  await page.getByRole("button", { name: "Excluir" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("60 dias");
  await dialog.getByLabel("Motivo").fill("Cadastro em duplicidade");
  await dialog.getByRole("button", { name: "Excluir cadastro" }).click();

  await expect(page).toHaveURL(/\/associados\?excluido=1$/);
  await expect(page.getByRole("status").filter({ hasText: "Cadastro excluído" })).toBeVisible();
  await page.goto(`/associados?situacao=todos&q=${encodeURIComponent(person)}`);
  await expect(page.getByRole("link", { name: person })).toHaveCount(0);

  await page.goto("/associados/configuracoes/excluidos");
  const row = page.getByRole("row").filter({ hasText: person });
  await expect(row).toContainText("Cadastro em duplicidade");
  await row.getByRole("button", { name: `Restaurar ${person}` }).click();
  await expect(page.getByText("Associado restaurado.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: person })).toHaveCount(0);

  await page.goto(`/associados/${id}`);
  await expect(page.getByRole("heading", { name: person })).toBeVisible();
});
