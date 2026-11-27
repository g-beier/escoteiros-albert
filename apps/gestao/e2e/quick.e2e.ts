import { expect, test } from "@playwright/test";
import { ATTACHMENTS_ENABLED } from "../lib/features";
import { cleanupE2eGroup, psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, entryRow, search, uniqueName } from "./support/entries";

// Registro rápido comum (/rapido, 049) no celular, como o administrador E2E: o lançamento e o associado entram já,
// ficam para revisar e saem da lista de revisão ao marcar revisado. Nomes únicos; associados apagados no fim.
test.describe.configure({ mode: "serial" });

const person = uniqueName("Associado rápido");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;

test.afterAll(() => {
  const people = `(select id from public.associates where group_id = ${group} and name = ${literal(person)})`;
  psql(`
    delete from public.associate_movements where associate_id in ${people};
    delete from public.associates where id in ${people};
  `);
  cleanupE2eGroup();
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("lançamento rápido: entra para revisar e sai da lista ao revisar", async ({ page }) => {
  const name = uniqueName("Rápido");
  await page.goto("/rapido");
  await expect(page.locator("html")).toHaveAttribute("data-app", "gestao");
  await page.getByRole("link", { name: /Lançamento financeiro/ }).click();
  await page.getByRole("radio", { name: /Despesa/ }).click();
  // sem rubrica: entra em "2 Despesas" e quem revisa classifica
  await expect(page.getByRole("combobox", { name: "Rubrica" })).toHaveCount(0);
  await page.getByLabel("Valor (R$)").fill("12,34");
  await page.getByLabel("Histórico").fill(name);
  await chooseOption(page, "Forma de pagamento", "PIX");
  // comprovantes desligados por padrão (lib/features.ts): sem o campo de arquivo
  if (ATTACHMENTS_ENABLED) {
    await page.getByLabel("Comprovante (opcional)").setInputFiles({
      name: "recibo-rapido.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
    });
    await expect(page.getByText("recibo-rapido.pdf")).toBeVisible();
  } else {
    await expect(page.getByLabel("Comprovante (opcional)")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status")).toContainText("Lançamento registrado. Fica para revisar.");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/financeiro/lancamentos/movimentacoes?revisao=para_revisar&de=tudo");
  await search(page, name);
  const row = entryRow(page, name);
  await expect(row).toContainText("Revisar");
  await expect(row).toContainText("12,34");
  await row.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("combobox", { name: /Rubrica/ }).first()).toHaveValue(/Despesas/);
  // o comprovante enviado pelo celular já está no lançamento
  if (ATTACHMENTS_ENABLED)
    await expect(
      page.getByRole("region", { name: "Comprovantes" }).getByRole("link", { name: "recibo-rapido.pdf", exact: true }),
    ).toBeVisible();
  else await expect(page.getByRole("region", { name: "Comprovantes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Marcar como revisado" }).click();
  await expect(page.getByText("Lançamento marcado como revisado.")).toBeVisible();
  await expect(page.getByRole("note")).toHaveCount(0);

  await page.goto(`/financeiro/lancamentos/movimentacoes?revisao=para_revisar&de=tudo&q=${encodeURIComponent(name)}`);
  await expect(entryRow(page, name)).toHaveCount(0);
});

test("associado rápido: cadastrado para um editor revisar", async ({ page }) => {
  await page.goto("/rapido");
  await page.getByRole("link", { name: /Associado novo/ }).click();
  await page.getByLabel("Nome").fill(person);
  await chooseOption(page, "Ramo, seção e equipe", "Adulto");
  await page.getByRole("button", { name: "Cadastrar associado" }).click();
  await expect(page.getByRole("status")).toContainText("Associado cadastrado. Fica para revisar.");

  await page.goto("/associados?revisao=para_revisar");
  const row = page.getByRole("row").filter({ hasText: person });
  await expect(row).toContainText("Revisar");
  await row.getByRole("link", { name: person }).click();
  await page.getByRole("button", { name: "Marcar como revisado" }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.goto("/associados?revisao=para_revisar");
  await expect(page.getByRole("row").filter({ hasText: person })).toHaveCount(0);
});

test("busca única: acha o associado (sem acento nem maiúsculas) e o menu Registrar tem o material novo", async ({
  page,
}) => {
  await page.goto("/rapido");
  const register = page
    .getByRole("region", { name: "Registrar" })
    .or(page.locator("section").filter({ has: page.getByRole("heading", { name: "Registrar" }) }));
  await expect(register.getByRole("link", { name: /Material novo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cadastrar material novo/ })).toHaveCount(0);
  // o associado do teste anterior, buscado pela parte final do nome, sem acento e em minúsculas
  const words = person.split(" ");
  await page.getByLabel("Buscar material ou associado").fill(`associado rapido ${words.at(-1)!.toLowerCase()}`);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("heading", { name: "Associados" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(person) }).click();
  await expect(page).toHaveURL(/\/associados\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: person })).toBeVisible();
});
