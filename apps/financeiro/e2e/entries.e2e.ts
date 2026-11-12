import { expect, test } from "@playwright/test";
import { cleanupE2eGroup } from "./support/db";
import { E2E_ACCOUNTS } from "./support/env";
import { chooseOption, createEntry, entriesTable, entryRow, filters, search, uniqueName } from "./support/entries";

// Lançamentos do grupo E2E: criar, filtrar, editar e excluir pela interface. Cada teste usa históricos únicos
// e apaga o que criou; o afterAll só recolhe sobras de um teste interrompido.
test.afterAll(() => cleanupE2eGroup());

test("criar, filtrar, editar e excluir lançamentos", async ({ page }) => {
  const tag = uniqueName("Lanc");
  const income = `${tag} entrada`;
  const expense = `${tag} saída`;

  await test.step("criar uma entrada e uma saída", async () => {
    await createEntry(page, { name: income, direction: "entrada", total: "123,45", account: E2E_ACCOUNTS[0], category: "Mensalidades", description: "mensalidade março" });
    await createEntry(page, { name: expense, direction: "saida", total: "40,00", account: E2E_ACCOUNTS[1], category: "Telefone", description: "conta de celular" });
  });

  await test.step("buscar pelo histórico", async () => {
    await page.goto("/lancamentos");
    await search(page, tag);
    await expect(entryRow(page, income)).toBeVisible();
    await expect(entryRow(page, expense)).toBeVisible();
    await expect(entryRow(page, income)).toContainText("123,45");
    await expect(entryRow(page, expense)).toContainText(E2E_ACCOUNTS[1]);
  });

  await test.step("filtrar por conta", async () => {
    await filters(page).getByRole("button", { name: /^Conta/ }).click();
    const panel = page.getByRole("dialog");
    await panel.getByRole("button", { name: "Limpar" }).click();
    await panel.getByRole("checkbox", { name: E2E_ACCOUNTS[0], exact: true }).click();
    await panel.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/[?&]conta=/);
    await expect(entryRow(page, income)).toBeVisible();
    await expect(entryRow(page, expense)).toHaveCount(0);
  });

  await test.step("filtrar por rubrica (só despesas)", async () => {
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(page).not.toHaveURL(/[?&]conta=/);
    await search(page, tag);
    await filters(page).getByRole("button", { name: /^Rubrica/ }).click();
    const panel = page.getByRole("dialog");
    await panel.getByRole("button", { name: "Só despesas" }).click();
    await panel.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/[?&]rubrica=/);
    await expect(entryRow(page, expense)).toBeVisible();
    await expect(entryRow(page, income)).toHaveCount(0);
  });

  await test.step("editar pela página de detalhes", async () => {
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(page).not.toHaveURL(/[?&]rubrica=/);
    await search(page, tag);
    await entryRow(page, income).getByRole("link", { name: income }).click();
    await expect(page.getByRole("heading", { name: income })).toBeVisible();
    await page.getByLabel("Histórico", { exact: true }).fill(`${income} editada`);
    await page.getByLabel("Documento (opcional)").fill("Recibo 7");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Alterações salvas.")).toBeVisible();
    await expect(page.getByRole("heading", { name: `${income} editada` })).toBeVisible();
    // o histórico de alterações registra a edição
    await expect(page.getByRole("region", { name: "Histórico de alterações" })).toContainText(/edit|alter/i);
    await page.getByRole("link", { name: "Voltar aos lançamentos" }).click();
    await expect(entryRow(page, `${income} editada`)).toBeVisible();
  });

  await test.step("excluir pela lista", async () => {
    await entryRow(page, expense).getByRole("button", { name: "Ações do lançamento" }).click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    await page.getByRole("dialog", { name: "Excluir lançamento?" }).getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Lançamento excluído.")).toBeVisible();
    await expect(entryRow(page, expense)).toHaveCount(0);
  });

  await test.step("excluir pela página de detalhes", async () => {
    await entryRow(page, `${income} editada`).getByRole("link").first().click();
    await page.getByRole("button", { name: "Excluir lançamento" }).click();
    await page.getByRole("dialog", { name: "Excluir lançamento?" }).getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Lançamento excluído.")).toBeVisible();
    await expect(page).toHaveURL(/\/lancamentos(\?|$)/);
    await search(page, tag);
    await expect(entriesTable(page).getByRole("link", { name: new RegExp(tag) })).toHaveCount(0);
  });
});

test("o formulário não salva enquanto o rateio não confere", async ({ page }) => {
  await page.goto("/lancamentos/novo");
  await page.getByRole("radio", { name: "Saída (despesa)" }).click();
  await page.getByLabel("Histórico").fill(uniqueName("Rascunho"));
  await page.getByLabel(/^Valor total/).fill("10,00");
  await chooseOption(page, "Conta", E2E_ACCOUNTS[0]);
  await page.getByRole("group", { name: "Rubrica 1" }).getByLabel(/^Valor \(R\$\)/).fill("4,00");
  await expect(page.getByRole("status").filter({ hasText: "Diferença" })).toContainText("6,00");
  await expect(page.getByRole("button", { name: "Salvar lançamento" })).toBeDisabled();
  await page.getByRole("button", { name: "Lançar diferença na última rubrica" }).click();
  await expect(page.getByRole("group", { name: "Rubrica 1" }).getByLabel(/^Valor \(R\$\)/)).toHaveValue("10,00");
});
