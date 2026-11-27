import { expect, test } from "@playwright/test";
import { cleanupE2eGroup } from "./support/db";
import { E2E_ACCOUNTS } from "./support/env";
import { createEntry, uniqueName } from "./support/entries";

// Início geral (/) e Resumo do Financeiro (/financeiro): alertas dos dois módulos com link, cartões por módulo e
// saldo das contas. O lançamento do teste fica sem documento na pasta, então o alerta aparece com pelo menos 1.
test.afterAll(() => cleanupE2eGroup());

test("Início mostra o que precisa de atenção e um cartão por módulo", async ({ page }) => {
  const name = uniqueName("Início");
  await createEntry(page, {
    name,
    direction: "saida",
    total: "15,00",
    account: E2E_ACCOUNTS[0],
    category: "Telefone",
    description: "alerta do início",
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Início" })).toBeAttached();
  const attention = page.getByRole("region", { name: "Precisa de atenção" });
  const docs = attention.getByRole("link", { name: /sem documento na pasta/ });
  await expect(docs).toContainText("Financeiro");
  await expect(page.getByRole("region", { name: "Financeiro" })).toContainText("Saldo nas contas hoje");
  await expect(page.getByRole("region", { name: "Inventário" })).toContainText("Materiais");
  await page.screenshot({ path: process.env.SHOT_HOME ?? "test-results/inicio.png", fullPage: true });

  await docs.click();
  await expect(page).toHaveURL(/\/financeiro\/lancamentos\/movimentacoes\?pasta=pendente/);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

  // o rótulo do módulo leva ao Resumo; o logo volta ao Início
  await page.getByRole("link", { name: "Grupo Escoteiro Albert Schweitzer — Início" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.getByRole("region", { name: "Financeiro" }).getByRole("link", { name: "Resumo do financeiro" }).click();
  await expect(page).toHaveURL(/\/financeiro$/);
});

test("Resumo do Financeiro mostra o saldo de cada conta e leva aos lançamentos dela", async ({ page }) => {
  await page.goto("/financeiro");
  await expect(page.getByRole("navigation", { name: "Caminho" })).toContainText("Financeiro");
  const accounts = page.getByRole("region", { name: "Contas" });
  const account = accounts.getByRole("link", { name: new RegExp(`^${E2E_ACCOUNTS[0]} -?R\\$`) });
  await expect(account).toContainText("R$");
  await page.screenshot({ path: process.env.SHOT_FINANCE ?? "test-results/resumo-financeiro.png", fullPage: true });
  await account.click();
  await expect(page).toHaveURL(/\/financeiro\/lancamentos\/movimentacoes\?conta=[0-9a-f-]{36}&de=/);
});
