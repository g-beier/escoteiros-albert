import { resolve } from "node:path";
import { ATTACHMENTS_ENABLED } from "../lib/features";
import { expect, test, type Page } from "@playwright/test";
import { cleanupE2eGroup } from "./support/db";
import { E2E_ACCOUNTS } from "./support/env";
import { chooseOption, createEntry, entriesTable, entryRow, search, uniqueName } from "./support/entries";

// Itens "No navegador" do BACKLOG (A verificar): mover em lote, comprovantes, importação OFX,
// conciliação ("Criar lançamento" a partir da linha) e filtro Conciliado. Tudo no grupo E2E e desfeito no fim.
test.afterAll(() => cleanupE2eGroup());

const FIXTURES = resolve(__dirname, "../lib/finance/statement-import/__fixtures__");

async function deleteFromDetail(page: Page, name: string) {
  await page.goto("/financeiro/lancamentos/movimentacoes?de=tudo");
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
  await page.goto("/financeiro/lancamentos/movimentacoes");
  await search(page, tag);
  for (const name of names) await page.getByRole("checkbox", { name: `Selecionar ${name}` }).click();
  const bar = page.getByRole("region", { name: "Ações em lote" });
  await expect(bar).toContainText("2 lançamentos selecionados");
  await bar.getByRole("button", { name: "Mover de conta" }).click();
  const dialog = page.getByRole("dialog");
  await chooseOption(page, "Conta", E2E_ACCOUNTS[1], dialog);
  await dialog.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(page.getByText(`2 lançamentos movidos para ${E2E_ACCOUNTS[1]}.`)).toBeVisible();
  for (const name of names) await expect(entryRow(page, name)).toContainText(E2E_ACCOUNTS[1]);
  await page.reload();
  for (const name of names) await expect(entryRow(page, name)).toContainText(E2E_ACCOUNTS[1]);
  for (const name of names) await deleteFromDetail(page, name);
});

test("em lote: forma de pagamento e documentos (Movimentações); rubrica dos rateios (Detalhamento) e histórico", async ({ page }) => {
  const tag = uniqueName("Lote2");
  const names = [`${tag} um`, `${tag} dois`];
  for (const name of names) {
    await createEntry(page, { name, direction: "saida", total: "8,00", account: E2E_ACCOUNTS[0], category: "Telefone", description: "recarga" });
  }
  await page.goto("/financeiro/lancamentos/movimentacoes");
  await search(page, tag);
  for (const name of names) await page.getByRole("checkbox", { name: `Selecionar ${name}` }).click();
  const bar = page.getByRole("region", { name: "Ações em lote" });
  await bar.getByRole("button", { name: "Forma de pagamento" }).click();
  await chooseOption(page, "Forma de pagamento", "Dinheiro", page.getByRole("dialog"));
  await page.getByRole("dialog").getByRole("button", { name: "Trocar" }).click();
  await expect(page.getByText("Forma de pagamento de 2 lançamentos trocada para Dinheiro.")).toBeVisible();
  for (const name of names) await expect(entryRow(page, name)).toContainText("Dinheiro");
  for (const name of names) await page.getByRole("checkbox", { name: `Selecionar ${name}` }).click();
  await bar.getByRole("button", { name: "Documentos" }).click();
  await page.getByRole("menuitem", { name: "Arquivados na pasta" }).click();
  await expect(page.getByText("2 lançamentos com documentos arquivados.")).toBeVisible();

  await page.goto("/financeiro/lancamentos/detalhamento");
  await search(page, tag);
  for (const name of names) await page.getByRole("checkbox", { name: `Selecionar ${name}: recarga` }).click();
  await expect(bar).toContainText("2 rateios selecionados");
  await bar.getByRole("button", { name: "Trocar rubrica" }).click();
  await page.getByRole("dialog").getByLabel("Rubrica").fill("Redes sociais");
  await page.getByRole("option", { name: /Redes sociais/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Trocar rubrica" }).click();
  await expect(page.getByText("Rubrica trocada em 2 lançamentos.")).toBeVisible();
  const splits = page.getByRole("region", { name: "Detalhamento" }).getByRole("table");
  for (const name of names) await expect(splits.getByRole("row").filter({ hasText: name })).toContainText("Redes sociais");
  await page.reload();
  for (const name of names) await expect(splits.getByRole("row").filter({ hasText: name })).toContainText("Redes sociais");

  // o histórico do lançamento registra a mudança em lote
  await splits.getByRole("link", { name: names[0], exact: true }).first().click();
  await expect(page.getByText("Lançamento alterado em lote").first()).toBeVisible();
  for (const name of names) await deleteFromDetail(page, name);
});

test("importar lancamentos.csv, agrupar no Detalhamento e desagrupar", async ({ page }) => {
  const tag = uniqueName("Planilha");
  const [one, two] = [`${tag} um`, `${tag} dois`];
  const csv = ["histórico;data;conta;forma de pagamento;valor;rubrica;descrição", `${one};15/03/2026;${E2E_ACCOUNTS[0]};PIX;12,00;2.1.2. Telefone;recarga um`,
    `${two};15/03/2026;${E2E_ACCOUNTS[0]};PIX;8,00;2.1.2;recarga dois`].join("\n");
  await page.goto("/importar");
  await page.getByLabel("Arquivos CSV").setInputFiles({ name: "lancamentos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.getByRole("button", { name: "Importar 2 linhas" }).click();
  await expect(page.getByText(/lancamentos\.csv: 2 novas/)).toBeVisible();

  await page.goto("/financeiro/lancamentos/detalhamento");
  await search(page, tag);
  const splits = page.getByRole("region", { name: "Detalhamento" }).getByRole("table");
  await expect(splits.getByRole("row").filter({ hasText: "recarga dois" })).toContainText("-R$ 8,00");
  await page.getByRole("checkbox", { name: `Selecionar ${one}: recarga um` }).click();
  await page.getByRole("checkbox", { name: `Selecionar ${two}: recarga dois` }).click();
  const bar = page.getByRole("region", { name: "Ações em lote" });
  await bar.getByRole("button", { name: "Agrupar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  // o formulário começa com os dados do lançamento do primeiro rateio marcado; o histórico é escolhido aqui
  await expect(dialog.getByLabel("Histórico")).toHaveValue(one);
  await dialog.getByLabel("Histórico").fill(`${tag} junto`);
  await dialog.getByRole("button", { name: "Agrupar", exact: true }).click();
  await expect(page.getByText("2 lançamentos agrupados em um só.")).toBeVisible();
  const merged = `${tag} junto`;
  await expect(splits.getByRole("row").filter({ hasText: "recarga dois" })).toContainText(merged);
  await expect(splits.getByRole("row").filter({ hasText: "recarga um" })).toContainText(merged);
  await expect(splits.getByRole("row").filter({ hasText: two })).toHaveCount(0);

  await page.getByRole("checkbox", { name: `Selecionar ${merged}: recarga dois` }).click();
  await bar.getByRole("button", { name: "Desagrupar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desagrupar", exact: true }).click();
  await expect(page.getByText("1 lançamento novo, um por rateio.")).toBeVisible();
  await page.goto("/financeiro/lancamentos/movimentacoes");
  await search(page, tag);
  await expect(entriesTable(page).getByRole("row").filter({ has: page.getByRole("link", { name: merged, exact: true }) })).toHaveCount(2);
});

test("anexar, abrir e excluir um comprovante", async ({ page }) => {
  // comprovantes desligados por padrão (lib/features.ts); para testar: NEXT_PUBLIC_FEATURE_ATTACHMENTS=on npm run test:e2e
  test.skip(!ATTACHMENTS_ENABLED, "comprovantes desligados");
  const name = uniqueName("Comprovante");
  await createEntry(page, { name, direction: "saida", total: "33,00", account: E2E_ACCOUNTS[0], category: "Telefone", description: "papelaria" });
  await page.goto("/financeiro/lancamentos/movimentacoes");
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
  await page.goto("/financeiro/lancamentos/movimentacoes");
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
    await page.goto("/financeiro/extrato/importar");
    await chooseOption(page, "Conta", account);
    await page.getByLabel("Arquivo do extrato").setInputFiles(resolve(FIXTURES, "nubank.ofx"));
    const review = page.getByRole("region", { name: "2. Conferência" });
    await expect(review).toContainText(/\d+ novas/);
    await review.getByRole("button", { name: /^Importar \d+ linhas$/ }).click();
    await expect(page).toHaveURL(/\/financeiro\/extrato\/conciliar\?/);
    await expect(page).toHaveURL(/de=2026-10-01/);
  });

  await test.step("criar o lançamento de uma linha do extrato", async () => {
    const line = page.getByRole("region", { name: "Extrato" }).getByRole("listitem").filter({ hasText: "1.500,00" });
    await line.getByRole("link", { name: "Criar lançamento" }).click();
    await expect(page).toHaveURL(/\/financeiro\/lancamentos\/novo\?linha=/);
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
    await expect(page).toHaveURL(/\/financeiro\/extrato\/conciliar\?/);
    await page.locator("summary", { hasText: "Vinculados" }).click();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  });

  await test.step("filtro Conciliado na lista", async () => {
    await page.goto(`/financeiro/lancamentos/movimentacoes?de=tudo&conciliado=sim`);
    await search(page, name);
    await expect(entryRow(page, name)).toBeVisible();
    // conciliado = a coluna ID OFX mostra o FITID da linha vinculada
    await expect(entryRow(page, name).getByRole("button", { name: /^Copiar ID OFX / })).toBeVisible();
    await page.goto(`/financeiro/lancamentos/movimentacoes?de=tudo&conciliado=nao`);
    await search(page, name);
    await expect(entryRow(page, name)).toHaveCount(0);
  });

  await test.step("desfazer a importação", async () => {
    await page.goto("/financeiro/extrato/importar");
    await chooseOption(page, "Conta", account);
    const recent = page.getByRole("region", { name: "Importações recentes" });
    await recent.getByRole("row").filter({ hasText: "nubank.ofx" }).getByRole("button", { name: "Desfazer" }).click();
    await page.getByRole("dialog", { name: "Desfazer esta importação?" }).getByRole("button", { name: "Desfazer importação" }).click();
    await expect(recent).toContainText("Nenhum extrato importado nesta conta.");
    // o lançamento continua, agora sem conciliação
    await page.goto(`/financeiro/lancamentos/movimentacoes?de=tudo&conciliado=nao`);
    await search(page, name);
    await expect(entryRow(page, name)).toBeVisible();
    await expect(entryRow(page, name).getByRole("button", { name: /^Copiar ID OFX / })).toHaveCount(0);
  });

  await deleteFromDetail(page, name);
});
