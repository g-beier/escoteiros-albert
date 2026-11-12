import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { waitForOtp } from "./support/mail";

test.use({ storageState: { cookies: [], origins: [] } });

test("sem sessão, as páginas levam ao login", async ({ page }) => {
  await page.goto("/lancamentos");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Enviar código de acesso" })).toBeVisible();
});

test("código errado é recusado e o certo entra", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_ADMIN_EMAIL);
  const since = new Date();
  await page.getByRole("button", { name: "Enviar código de acesso" }).click();
  const code = await waitForOtp(E2E_ADMIN_EMAIL, since);
  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("Código de acesso").fill(wrong);
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Código inválido" })).toHaveText("Código inválido ou expirado.");
  await page.getByLabel("Código de acesso").fill(code);
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
});
