import { expect, test, type Page } from "@playwright/test";
import { cleanupE2eGroup } from "./support/db";
import { E2E_ACCOUNTS } from "./support/env";
import { createEntry, uniqueName } from "./support/entries";

// Rubricas (036): rascunho no navegador (criar, arrastar, renomear, excluir) gravado só ao salvar.
// Cria tudo no fim de "2 Despesas" e exclui no final, então o plano do grupo E2E volta como estava.
test.afterAll(() => cleanupE2eGroup());

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Campo de nome da rubrica (rótulo "Nome de <código> <nome>"). */
const nameField = (page: Page, name: string, code = "[\\d.]+") => page.getByLabel(new RegExp(`^Nome de ${code} ${escape(name)}$`));
const row = (page: Page, name: string) => page.getByRole("row").filter({ has: nameField(page, name) });
async function pick(page: Page, name: string, item: string | RegExp) {
  await page.getByRole("button", { name: new RegExp(`^Ações de [\\d.]+ ${escape(name)}$`) }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
const bar = (page: Page) => page.getByRole("region", { name: "Alterações não salvas" });

/** Pai com duas filhas, no rascunho (a nova entra com o nome selecionado: digitar substitui). */
async function draftFamily(page: Page, parent: string, first: string, second: string) {
  await page.getByRole("button", { name: "Nova rubrica", exact: true }).click();
  await page.keyboard.type(parent);
  await pick(page, parent, "Nova rubrica dentro desta");
  await page.keyboard.type(first);
  await pick(page, parent, "Nova rubrica dentro desta");
  await page.keyboard.type(second);
}

test("rubricas: rascunho com arrastar, salvar e excluir levando os rateios para a rubrica pai", async ({ page }) => {
  const parent = uniqueName("Rubrica pai");
  const first = uniqueName("Filha um");
  const second = uniqueName("Filha dois");
  const entry = uniqueName("Rubrica excluída");

  await page.goto("/financeiro/configuracoes/rubricas");
  await draftFamily(page, parent, first, second);
  await expect(bar(page)).toContainText("3 novas");

  // descartar volta ao gravado
  await bar(page).getByRole("button", { name: "Descartar" }).click();
  await expect(nameField(page, parent)).toHaveCount(0);
  await expect(bar(page)).toHaveCount(0);

  // de novo, agora salvando
  await draftFamily(page, parent, first, second);
  await bar(page).getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Rubricas salvas.")).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  const parentCode = (await row(page, parent).locator(".num").first().innerText()).trim();
  expect(parentCode).toMatch(/^2\.\d+$/);
  await expect(nameField(page, second, escape(`${parentCode}.2`))).toBeVisible();

  // arrastar a segunda para o alto da primeira troca os códigos (só no rascunho até salvar)
  await row(page, second).getByTitle("Arraste para mover").dragTo(row(page, first), { targetPosition: { x: 40, y: 3 } });
  await expect(nameField(page, second, escape(`${parentCode}.1`))).toBeVisible();
  await expect(nameField(page, first, escape(`${parentCode}.2`))).toBeVisible();
  await expect(bar(page)).toContainText("2 códigos mudam");
  await bar(page).getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Rubricas salvas.")).toBeVisible();

  // um rateio na filha; excluir a pai (com as de baixo) leva o rateio para 2 Despesas
  await createEntry(page, { name: entry, direction: "saida", total: "12,00", account: E2E_ACCOUNTS[0], category: second, description: "e2e rubrica" });
  await page.goto("/financeiro/configuracoes/rubricas");
  await pick(page, parent, /^Excluir/);
  await expect(nameField(page, second)).toHaveCount(0);
  await expect(bar(page)).toContainText("3 excluídas (1 rateio muda de rubrica)");
  await bar(page).getByRole("button", { name: "Salvar alterações" }).click();
  const review = page.getByRole("dialog", { name: "Salvar alterações nas rubricas" });
  await expect(review).toContainText("1 rateio vai para 2 Despesas");
  await page.screenshot({ path: process.env.SHOT ?? "test-results/rubricas.png" });
  await review.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Rubricas salvas. 1 rateio de 1 lançamento mudou de rubrica.")).toBeVisible();

  // o lançamento mostra a troca no histórico
  await page.goto("/financeiro/lancamentos/movimentacoes?de=tudo");
  await page.getByRole("link", { name: entry, exact: true }).first().click();
  await expect(page.getByText("Rubrica excluída: rateios movidos")).toBeVisible();
});
