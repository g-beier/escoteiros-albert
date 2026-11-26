import { expect, test } from "@playwright/test";
import { cleanupE2eGroup, psql } from "./support/db";
import { E2E_ACCOUNTS, E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";

// Mensalidades › Devedores (023): dívida numa rubrica, paga só por rateio ligado a ela ("Receber…"); a diferença de um
// lançamento vira dívida. A ocultação do associado para a consulta e a mensalidade "Não pago" são cobertas em
// db/tests/debts.test.sql.
test.describe.configure({ mode: "serial" });

const associate = uniqueName("Devedor");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;
let category = "";

test.beforeAll(() => {
  psql(`insert into public.associates(group_id, name, branch) select ${group}, ${literal(associate)}, 'escoteiro';`);
  // uma rubrica de receita que não é de mensalidade
  category = psql(`select name from public.categories where group_id = ${group} and kind = 'receita' and parent_id is not null and active
    and not (id = any(public.fee_category_ids(${group}))) order by code limit 1;`);
});
test.afterAll(() => {
  cleanupE2eGroup();
  psql(`delete from public.associates where name = ${literal(associate)};`);
});

test("devedores: anotar na rubrica, editar o acordo, receber e excluir", async ({ page }) => {
  const description = uniqueName("Acampamento");
  const other = uniqueName("Lanche");
  await page.goto("/financeiro/mensalidades");
  await page.getByRole("link", { name: "Devedores" }).first().click();
  await expect(page).toHaveURL(/\/financeiro\/mensalidades\/devedores$/);

  for (const [text, value] of [[description, "150,00"], [other, "10,00"]]) {
    await page.getByRole("button", { name: "Nova dívida" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Associado" }).fill(associate);
    await page.getByRole("option", { name: new RegExp(associate) }).click();
    await dialog.getByRole("combobox", { name: "Rubrica" }).fill(category);
    await page.getByRole("option", { name: new RegExp(category) }).first().click();
    await dialog.getByLabel("Data").fill("2026-03-01");
    await dialog.getByLabel("Valor (R$)").fill(value);
    await dialog.getByLabel("Descrição").fill(text);
    await dialog.getByRole("button", { name: "Anotar dívida" }).click();
    await expect(page.getByText("Dívida anotada.")).toBeVisible();
  }

  const debtor = page.getByRole("button", { name: new RegExp(`^${associate}`) });
  await expect(page.getByRole("row").filter({ has: debtor })).toContainText("falta R$ 160,00");
  await debtor.click();
  const row = page.getByRole("row").filter({ hasText: description });
  await expect(row).toContainText(category);
  await expect(row).toContainText("Em aberto");

  await test.step("editar o acordo", async () => {
    await row.getByRole("button", { name: /^Ações da dívida/ }).click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    await page.getByRole("dialog").getByLabel("Acordo de pagamento (opcional)").fill("3x de R$ 50,00");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar dívida" }).click();
    await expect(page.getByText("Dívida salva.")).toBeVisible();
    await expect(row).toContainText("Acordo: 3x de R$ 50,00");
  });

  await test.step("receber: lançamento já ligado à dívida, na rubrica dela", async () => {
    await row.getByRole("button", { name: /^Ações da dívida/ }).click();
    await page.getByRole("menuitem", { name: "Receber…" }).click();
    await expect(page.getByRole("heading", { name: "Receber dívida" })).toBeVisible();
    await expect(page.getByLabel("Histórico")).toHaveValue(associate);
    await expect(page.getByRole("group", { name: "Rubrica 1" }).getByLabel("Paga a dívida (opcional)")).toContainText(description);
    await page.getByLabel("Histórico").fill(uniqueName("Recebimento"));
    await chooseOption(page, "Forma de pagamento", "PIX");
    await chooseOption(page, "Conta", E2E_ACCOUNTS[0]);
    await page.getByRole("button", { name: "Receber", exact: true }).click();
    await expect(page.getByText("Recebimento lançado na dívida (Devedores).")).toBeVisible();
    await expect(page).toHaveURL(/\/financeiro\/mensalidades\/devedores$/);
    await expect(page.getByRole("row").filter({ has: debtor })).toContainText("falta R$ 10,00");
  });

  await test.step("excluir a outra (sem pagamento)", async () => {
    await debtor.click();
    const otherRow = page.getByRole("row").filter({ hasText: other });
    await otherRow.getByRole("button", { name: /^Ações da dívida/ }).click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Dívida excluída.")).toBeVisible();
    await expect(otherRow).toHaveCount(0);
  });

  await test.step("quitada: some até mostrar as quitadas, com o pagamento", async () => {
    await expect(page.getByRole("row").filter({ has: debtor })).toHaveCount(0);
    await page.getByRole("checkbox", { name: /^Mostrar quitadas/ }).click();
    if (await debtor.getAttribute("aria-expanded") === "false") await debtor.click();
    await expect(page.getByRole("row").filter({ hasText: description })).toContainText("Pago em");
  });
});

test("lançamento: a diferença vira dívida do associado na mesma rubrica", async ({ page }) => {
  const name = uniqueName("Pagou parte");
  await page.goto("/financeiro/lancamentos/novo");
  await page.getByRole("radio", { name: "Entrada (receita)" }).click();
  await page.getByLabel("Histórico").fill(name);
  await page.getByLabel(/^Valor total/).fill("60,00");
  await chooseOption(page, "Forma de pagamento", "PIX");
  await chooseOption(page, "Conta", E2E_ACCOUNTS[0]);
  const split = page.getByRole("group", { name: "Rubrica 1" });
  await split.getByRole("combobox", { name: "Rubrica" }).fill(category);
  await page.getByRole("option", { name: new RegExp(category) }).first().click();
  await split.getByLabel("Descrição").fill(name);
  await split.getByRole("combobox", { name: "Associado (opcional)" }).fill(associate);
  await page.getByRole("option", { name: associate }).click();
  await split.getByLabel(/^Valor \(R\$\)/).fill("100,00");
  await page.getByRole("button", { name: new RegExp(`^Criar dívida com a diferença \\(R\\$\\s40,00\\) de ${associate}`) }).click();
  await expect(split).toContainText("a pagar R$ 40,00");
  await expect(page.getByText("✓ Valores conferem")).toBeVisible();
  await page.getByRole("button", { name: "Salvar lançamento" }).click();
  await expect(page.getByText("Lançamento salvo; o que ficou a pagar virou dívida em Devedores.")).toBeVisible();
  expect(psql(`select (d.amount_cents, d.origin, e.total_cents)::text from public.debts d join public.ledger_entries e on e.id = d.origin_entry_id
    where e.name = ${literal(name)};`)).toBe("(4000,lancamento,6000)");
});
