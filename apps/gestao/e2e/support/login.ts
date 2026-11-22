import { expect, type Page } from "@playwright/test";

/**
 * Entra pelo login de teste (/auth/e2e, ligado só com E2E_LOGIN=1 no `next dev` dos testes): o Google não é
 * automatizável. Termina no início (/).
 */
export async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail (teste)").fill(email);
  await page.getByRole("button", { name: "Entrar (teste)" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
}
