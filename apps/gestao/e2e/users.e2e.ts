import { expect, test } from "@playwright/test";
import { deleteUsers, findUser } from "./support/db";
import { chooseOption } from "./support/entries";

// Gestão de usuários do grupo E2E: cadastrar, mudar papel e remover. O cadastrado tem e-mail único
// (e2e.convite.*) e é apagado de auth.users no fim, mesmo se o teste falhar no meio.
const invited = `e2e.convite.${Date.now().toString(36)}@example.org`;
test.afterAll(() => deleteUsers([invited]));

test("cadastrar, mudar papel e remover um usuário", async ({ page }) => {
  const row = page.getByRole("row").filter({ hasText: invited });

  await test.step("cadastrar como tesoureiro", async () => {
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    await page.getByLabel("E-mail da conta Google").fill(invited);
    await chooseOption(page, "Papel no Financeiro", "Tesoureiro");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText(`${invited} cadastrado.`)).toBeVisible();
    await expect(row).toContainText("Ainda não entrou");
    await expect(row.getByRole("combobox", { name: `Papel no Financeiro de ${invited}` })).toContainText("Tesoureiro");
  });

  await test.step("mudar para consulta no Financeiro, chefe no Inventário e secretaria no Associados", async () => {
    await chooseOption(page, `Papel no Financeiro de ${invited}`, "Consulta", row);
    await chooseOption(page, `Papel no Inventário de ${invited}`, "Chefe", row);
    await chooseOption(page, `Papel no Associados de ${invited}`, "Secretaria", row);
    await row.getByRole("button", { name: `Salvar papéis de ${invited}` }).click();
    await expect(page.getByText(`Papéis de ${invited} salvos.`)).toBeVisible();
    await expect(async () => {
      await page.reload();
      await expect(row.getByRole("combobox", { name: `Papel no Financeiro de ${invited}` })).toContainText("Consulta", { timeout: 2_000 });
      await expect(row.getByRole("combobox", { name: `Papel no Inventário de ${invited}` })).toContainText("Chefe", { timeout: 2_000 });
      await expect(row.getByRole("combobox", { name: `Papel no Associados de ${invited}` })).toContainText("Secretaria", { timeout: 2_000 });
    }).toPass();
  });

  await test.step("remover o acesso", async () => {
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain(invited);
      void dialog.accept();
    });
    await row.getByRole("button", { name: `Remover acesso de ${invited}` }).click();
    await expect(row).toHaveCount(0);
    // sem outro grupo, o cadastro fica bloqueado (o vínculo com o grupo some)
    await expect.poll(() => findUser(invited)?.banned).toBe(true);
  });
});

test("não oferece remover nem rebaixar a si mesmo", async ({ page }) => {
  await page.goto("/usuarios");
  const own = page.getByRole("row").filter({ hasText: "(você)" });
  await expect(own).toHaveCount(1);
  await expect(own.getByRole("button", { name: /^Remover acesso/ })).toHaveCount(0);
});
