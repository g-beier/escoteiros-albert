import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cleanupE2eGroup } from "./support/db";
import { E2E_ACCOUNTS } from "./support/env";
import { chooseOption, createEntry, entryRow, search, uniqueName } from "./support/entries";

// Itens "No navegador" do BACKLOG (A verificar): mover em lote, comprovantes, importação OFX,
// conciliação ("Criar lançamento" a partir da linha) e filtro Conciliado. Tudo no grupo E2E e desfeito no fim.
test.afterAll(() => cleanupE2eGroup());

const FIXTURES = resolve(__dirname, "../lib/statement-import/__fixtures__");

async function deleteFromDetail(page: Page, name: string) {
  await page.goto("/lancamentos/movimentacoes?de=tudo");
  await search(page, name);
  await entryRow(page, name).getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: "Excluir lançamento" }).click();
  await page.getByRole("dialog", { name: "Excluir lançamento?" }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Lançamento excluído.")).toBeVisible();
}

test("mover lançamentos selecionados para outra conta", async ({ page }) => {
  const tag = uniqueName("Lote");
  const names = [`${tag} um`, `${tag} dois`];
  for (const name of names) {
    await createEntry(page, { name, direction: "saida", total: "12,00", account: E2E_ACCOUNTS[0], category: "Telefone", description: "recarga" });
  }
  await page.goto("/lancamentos/movimentacoes");
  await search(page, tag);
  for (const name of names) await page.getByRole("checkbox", { name: `Selecionar ${name}` }).click();
  const bar = page.getByRole("region", { name: "Ações em lote" });
  await expect(bar).toContainText("2 lançamentos selecionados");
  await chooseOption(page, "Mover para a conta", E2E_ACCOUNTS[1], bar);
  await bar.getByRole("button", { name: "Mover" }).click();
  await expect(page.getByText(`2 lançamentos movidos para ${E2E_ACCOUNTS[1]}.`)).toBeVisible();
  for (const name of names) await expect(entryRow(page, name)).toContainText(E2E_ACCOUNTS[1]);
  await page.reload();
  for (const name of names) await expect(entryRow(page, name)).toContainText(E2E_ACCOUNTS[1]);
  for (const name of names) await deleteFromDetail(page, name);
});

test("anexar, abrir e excluir um comprovante", async ({ page }) => {
  const name = uniqueName("Comprovante");
  await createEntry(page, { name, direction: "saida", total: "33,00", account: E2E_ACCOUNTS[0], category: "Telefone", description: "papelaria" });
  await page.goto("/lancamentos/movimentacoes");
  await search(page, name);
  await entryRow(page, name).getByRole("link", { name, exact: true }).click();
  const section = page.getByRole("region", { name: "Comprovantes" });
  await expect(section).toContainText("Nenhum comprovante anexado.");
  await section.getByLabel("Anexar comprovante").setInputFiles({
    name: "nota-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await expect(page.getByText("Comprovante anexado.")).toBeVisible();
  const link = section.getByRole("link", { name: "nota-e2e.pdf", exact: true });
  await expect(link).toBeVisible();
  // o download passa pela rota autenticada do app
  const response = await page.request.get(await section.getByRole("link", { name: "Baixar nota-e2e.pdf" }).getAttribute("href") ?? "");
  expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");
  // a lista mostra o clipe do comprovante
  await page.goto("/lancamentos/movimentacoes");
  await search(page, name);
  await expect(entryRow(page, name)).toContainText(/comprovante/i);
  await entryRow(page, name).getByRole("link", { name, exact: true }).click();
  await section.getByRole("button", { name: "Excluir nota-e2e.pdf" }).click();
  await page.getByRole("dialog", { name: "Excluir comprovante?" }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Comprovante excluído.")).toBeVisible();
  await expect(section).toContainText("Nenhum comprovante anexado.");
  await deleteFromDetail(page, name);
});

test("importar OFX, criar lançamento pela conciliação, filtrar Conciliado e desfazer", async ({ page }) => {
  const name = uniqueName("Conciliado");
  const account = E2E_ACCOUNTS[1];

  await test.step("importar nubank.ofx", async () => {
    await page.goto("/extrato/importar");
    await chooseOption(page, "Conta", account);
    await page.getByLabel("Arquivo do extrato").setInputFiles(resolve(FIXTURES, "nubank.ofx"));
    const review = page.getByRole("region", { name: "2. Conferência" });
    await expect(review).toContainText(/\d+ novas/);
    await review.getByRole("button", { name: /^Importar \d+ linhas$/ }).click();
    await expect(page).toHaveURL(/\/extrato\/conciliar\?/);
    await expect(page).toHaveURL(/de=2026-10-01/);
  });

  await test.step("criar o lançamento de uma linha do extrato", async () => {
    const line = page.getByRole("region", { name: "Extrato" }).getByRole("listitem").filter({ hasText: "1.500,00" });
    await line.getByRole("link", { name: "Criar lançamento" }).click();
    await expect(page).toHaveURL(/\/lancamentos\/novo\?linha=/);
    await expect(page.getByLabel(/^Valor total/)).toHaveValue("1500,00");
    await page.getByLabel("Histórico").fill(name);
    if (!(await page.getByLabel("Forma de pagamento", { exact: true }).textContent())?.includes("PIX")) await chooseOption(page, "Forma de pagamento", "PIX");
    const split = page.getByRole("group", { name: "Rubrica 1" });
    await split.getByRole("combobox", { name: "Rubrica" }).fill("Mensalidades");
    await page.getByRole("option", { name: /Mensalidades/ }).first().click();
    await split.getByLabel("Descrição").fill("mensalidades de outubro");
    await split.getByLabel(/^Valor \(R\$\)/).fill("1500,00");
    await page.getByRole("button", { name: "Salvar lançamento" }).click();
    await expect(page.getByText("Lançamento criado e conciliado.")).toBeVisible();
    await expect(page).toHaveURL(/\/extrato\/conciliar\?/);
    await page.locator("summary", { hasText: "Vinculados" }).click();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  });

  await test.step("filtro Conciliado na lista", async () => {
    await page.goto(`/lancamentos/movimentacoes?de=tudo&conciliado=sim`);
    await search(page, name);
    await expect(entryRow(page, name)).toBeVisible();
    await expect(entryRow(page, name).getByLabel("Conciliado com o extrato")).toBeVisible();
    await page.goto(`/lancamentos/movimentacoes?de=tudo&conciliado=nao`);
    await search(page, name);
    await expect(entryRow(page, name)).toHaveCount(0);
  });

  await test.step("desfazer a importação", async () => {
    await page.goto("/extrato/importar");
    await chooseOption(page, "Conta", account);
    const recent = page.getByRole("region", { name: "Importações recentes" });
    await recent.getByRole("row").filter({ hasText: "nubank.ofx" }).getByRole("button", { name: "Desfazer" }).click();
    await page.getByRole("dialog", { name: "Desfazer esta importação?" }).getByRole("button", { name: "Desfazer importação" }).click();
    await expect(recent).toContainText("Nenhum extrato importado nesta conta.");
    // o lançamento continua, agora sem conciliação
    await page.goto(`/lancamentos/movimentacoes?de=tudo&conciliado=nao`);
    await search(page, name);
    await expect(entryRow(page, name)).toBeVisible();
  });

  await deleteFromDetail(page, name);
});
