import { expect, type Page } from "@playwright/test";
import { waitForOtp } from "./mail";

/** Login real por código: pede o OTP, lê no Mailpit e confirma. Termina no início (/). */
export async function loginWithOtp(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  const since = new Date();
  await page.getByRole("button", { name: "Enviar código de acesso" }).click();
  await expect(page.getByRole("status")).toContainText("Enviamos um código");
  const code = await waitForOtp(email, since);
  await page.getByLabel("Código de acesso").fill(code);
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
}
