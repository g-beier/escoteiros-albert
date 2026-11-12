import { expect, test } from "@playwright/test";
import { cleanupE2eGroup } from "./support/db";
import { E2E_ACCOUNTS } from "./support/env";
import { createEntry, uniqueName } from "./support/entries";

// Realizado na tela: a despesa lançada aparece na rubrica e no mês, soma no pai e leva aos rateios.
// Usa um ano antigo para não somar com lançamentos de outros testes.
test.afterAll(() => cleanupE2eGroup());

test("Realizado mostra a rubrica no mês e detalha os rateios", async ({ page }) => {
  const name = uniqueName("Realizado");
  await createEntry(page, { name, direction: "saida", date: "2001-03-15", total: "40,00", account: E2E_ACCOUNTS[0], category: "Telefone", description: "conta de março" });

  await page.goto("/lancamentos/realizado?ano=2001");
  await expect(page.getByRole("navigation", { name: "Caminho" })).toContainText("Realizado 2001");
  const table = page.getByRole("table", { name: /Realizado de 2001/ });
  const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /Telefone$/ }) });
  // colunas: rubrica, jan…dez, total
  await expect(row.getByRole("cell").nth(2)).toHaveText("R$ 40,00");
  await expect(row.getByRole("cell").nth(12)).toHaveText("R$ 40,00");
  await expect(table.getByRole("row", { name: /^Saldo/ })).toContainText("-R$ 40,00");

  // recolher a raiz esconde as rubricas filhas
  await table.getByRole("button", { name: /^Recolher 2\. Despesas/ }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Expandir tudo" }).click();
  await expect(row).toHaveCount(1);

  // a raiz leva um só ID na URL (o filtro inclui as filhas) e mostra o rateio da filha
  const root = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /^Recolher 2\. Despesas/ }) });
  await root.getByRole("link", { name: "R$ 40,00" }).last().click();
  await expect(page).toHaveURL(/rubrica=[0-9a-f-]{36}(&|$)/);
  await expect(page.getByRole("region", { name: "Detalhamento" })).toContainText(name);
  await page.goBack();

  await row.getByRole("link", { name: "R$ 40,00" }).first().click();
  await expect(page).toHaveURL(/\/lancamentos\/detalhamento\?rubrica=.*de=2001-03-01.*ate=2001-03-31/);
  await expect(page.getByRole("region", { name: "Detalhamento" })).toContainText(name);
  await page.screenshot({ path: process.env.SHOT ?? "test-results/realizado.png" });
  await page.goto("/lancamentos/realizado?ano=2001");
  await page.screenshot({ path: process.env.SHOT_TABLE ?? "test-results/realizado-tabela.png" });

  // o seletor de ano troca o ano pela URL; o ano atual fica sem parâmetro
  await page.getByRole("combobox", { name: "Ano" }).click();
  await page.getByRole("option", { name: String(new Date().getFullYear()) }).click();
  await expect(page).toHaveURL(/\/lancamentos\/realizado$/);
});
