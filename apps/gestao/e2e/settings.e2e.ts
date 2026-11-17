import { expect, test } from "@playwright/test";
import { psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";

// Configurações: cadastros que as outras telas leem (contas, formas de pagamento, associados por CSV).
// Tudo com nomes únicos, removido no fim direto no banco (nada disso tem lançamento).
const account = uniqueName("Conta");
const method = uniqueName("Forma");
const csvNames = [uniqueName("Associado CSV um"), uniqueName("Associado CSV dois")];
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;

test.afterAll(() => {
  psql(`
    delete from public.payment_methods where group_id = ${group} and name like ${literal(`${method}%`)};
    delete from public.accounts where group_id = ${group} and name like ${literal(`${account}%`)};
    delete from public.associates where group_id = ${group} and name in (${csvNames.map(literal).join(", ")});
  `);
});

test("contas: cadastrar, editar e inativar", async ({ page }) => {
  await page.goto("/financeiro/configuracoes");
  await expect(page).toHaveURL(/\/financeiro\/configuracoes\/contas$/);
  await page.getByRole("button", { name: "Nova conta" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(account);
  await chooseOption(page, "Tipo", "Poupança", dialog);
  await dialog.getByLabel("Banco (opcional)").fill("Banco E2E");
  await dialog.getByLabel("Saldo inicial (R$)").fill("1.234,56");
  await dialog.getByLabel("Data de início").fill("2026-01-01");
  await dialog.getByRole("button", { name: "Cadastrar conta" }).click();
  await expect(page.getByText(`Conta “${account}” cadastrada.`)).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: account });
  await expect(row).toContainText("Poupança");
  await expect(row).toContainText("R$ 1.234,56");
  await expect(row).toContainText("Ativa");

  await row.getByRole("button", { name: `Editar ${account}` }).click();
  await page.getByRole("dialog").getByLabel("Saldo inicial (R$)").fill("100,00");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText(`Conta “${account}” salva.`)).toBeVisible();
  await expect(row).toContainText("R$ 100,00");

  await row.getByRole("button", { name: "Inativar" }).click();
  await expect(page.getByText("Conta inativada.")).toBeVisible();
  await expect(row).toContainText("Inativa");
});

test("formas de pagamento: cadastrar, conta padrão, renomear e inativar", async ({ page }) => {
  await page.goto("/financeiro/configuracoes/formas");
  await page.getByLabel("Nova forma de pagamento").fill(method);
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText(`“${method}” cadastrada.`)).toBeVisible();

  const row = page.getByRole("row").filter({ has: page.getByLabel(`Nome de ${method}`) });
  await row.getByLabel(`Conta padrão de ${method}`).click();
  await page.getByRole("option", { name: "Conta E2E", exact: true }).click();
  await expect(page.getByText("Conta padrão salva.")).toBeVisible();

  const renamed = `${method} renomeada`;
  await row.getByLabel(`Nome de ${method}`).fill(renamed);
  await row.getByRole("button", { name: `Salvar ${method}` }).click();
  await expect(page.getByText(`“${renamed}” salva.`)).toBeVisible();

  const renamedRow = page.getByRole("row").filter({ has: page.getByLabel(`Nome de ${renamed}`) });
  await renamedRow.getByRole("button", { name: "Inativar" }).click();
  await expect(page.getByText("Forma de pagamento inativada.")).toBeVisible();
  await expect(renamedRow).toContainText("Inativa");
});

test("associados: importar CSV com conferência antes de gravar", async ({ page }) => {
  await page.goto("/financeiro/configuracoes/associados");
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const dialog = page.getByRole("dialog");
  const csv = `nome;ramo;seção;patrulha;status\r\n${csvNames[0]};Lobinho;;;ativo\r\n${csvNames[1]};Escoteiro;;;inativo\r\nSem Ramo E2E;Astronauta;;;ativo\r\n`;
  await dialog.getByLabel("Arquivo CSV").setInputFiles({ name: "associados.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });

  // a linha com ramo desconhecido aparece como erro e não entra
  await expect(dialog).toContainText("2 novos");
  await expect(dialog).toContainText("1 com erro");
  await expect(dialog.getByRole("row").filter({ hasText: "Sem Ramo E2E" })).toContainText("Erro");
  await dialog.getByRole("button", { name: "Importar 2 associados" }).click();
  await expect(page.getByText(/^Associados importados: /)).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // linhas editáveis: o nome está no campo, então a linha é achada pelo valor dele
  const row = (name: string) => page.getByRole("row").filter({ has: page.locator(`input[value="${name}"]`) });
  await expect(row(csvNames[0])).toContainText("Ativo");
  await expect(row(csvNames[1])).toContainText("Inativo");
});
