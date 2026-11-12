import { expect, test } from "@playwright/test";
import { deleteUsers, findUser } from "./support/db";
import { chooseOption } from "./support/entries";
import { waitForMail } from "./support/mail";

// Gestão de usuários do grupo E2E: convidar, mudar papel e remover. O convidado tem e-mail único
// (e2e.convite.*) e é apagado do Auth no fim, mesmo se o teste falhar no meio.
const invited = `e2e.convite.${Date.now().toString(36)}@escoteirosalbert.com.br`;
test.afterAll(() => deleteUsers([invited]));

test("convidar, mudar papel e remover um usuário", async ({ page }) => {
  const row = page.getByRole("row").filter({ hasText: invited });

  await test.step("convidar como tesoureiro", async () => {
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();
    await page.getByLabel("E-mail institucional").fill(invited);
    await chooseOption(page, "Papel", "Tesoureiro");
    const since = new Date();
    await page.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByText(`Convite enviado para ${invited}.`)).toBeVisible();
    await expect(row).toContainText("Convite pendente");
    await expect(row.getByRole("combobox", { name: `Papel de ${invited}` })).toContainText("Tesoureiro");
    const mail = await waitForMail(invited, since);
    expect(mail.text).toContain("/auth/");
  });

  await test.step("mudar para consulta", async () => {
    await chooseOption(page, `Papel de ${invited}`, "Consulta", row);
    await row.getByRole("button", { name: `Salvar papel de ${invited}` }).click();
    await expect(async () => {
      await page.reload();
      await expect(row.getByRole("combobox", { name: `Papel de ${invited}` })).toContainText("Consulta", { timeout: 2_000 });
    }).toPass();
  });

  await test.step("remover o acesso", async () => {
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain(invited);
      void dialog.accept();
    });
    await row.getByRole("button", { name: `Remover acesso de ${invited}` }).click();
    await expect(row).toHaveCount(0);
    // a conta fica bloqueada no Auth (o vínculo com o grupo some)
    await expect.poll(async () => Boolean((await findUser(invited))?.banned_until)).toBe(true);
  });
});

test("não oferece remover nem rebaixar a si mesmo", async ({ page }) => {
  await page.goto("/usuarios");
  const own = page.getByRole("row").filter({ hasText: "(você)" });
  await expect(own).toHaveCount(1);
  await expect(own.getByRole("button", { name: /^Remover acesso/ })).toHaveCount(0);
});
