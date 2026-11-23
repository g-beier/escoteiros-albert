import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "./support/env";

test.use({ storageState: { cookies: [], origins: [] } });

test("sem sessão, as páginas levam ao login com o caminho de volta", async ({ page }) => {
  await page.goto("/financeiro/lancamentos");
  await expect(page).toHaveURL(/\/login\?next=%2Ffinanceiro%2Flancamentos/);
  await expect(page.getByRole("link", { name: "Entrar com Google" })).toHaveAttribute("href", "/auth/google?next=%2Ffinanceiro%2Flancamentos");
});

test("e-mail sem cadastro é recusado; o cadastrado entra e volta para onde ia", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail (teste)").fill("ninguem@example.org");
  await page.getByRole("button", { name: "Entrar (teste)" }).click();
  await expect(page.getByRole("alert")).toHaveText("Este e-mail não tem acesso ao Gestão.");

  await page.goto("/login?next=%2Fassociados");
  await page.getByLabel("E-mail (teste)").fill(E2E_ADMIN_EMAIL);
  await page.getByRole("button", { name: "Entrar (teste)" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/associados");
});

test("cookie de sessão inventado não entra", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "geas_session", value: "inventado", url: baseURL! }]);
  await page.goto("/financeiro/lancamentos");
  await expect(page).toHaveURL(/\/login/);
});

test("a política de privacidade abre sem sessão e o login leva a ela", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Política de privacidade" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/privacidade");
  await expect(page.getByRole("heading", { level: 1, name: "Política de privacidade" })).toBeVisible();
});
