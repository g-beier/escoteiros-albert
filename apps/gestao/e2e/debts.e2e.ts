import { expect, test } from "@playwright/test";
import { cleanupE2eGroup, psql } from "./support/db";
import { E2E_ACCOUNTS, E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";

// Mensalidades › Devedores (023, 024): conta a receber por associado — linhas numa rubrica cada, pagas só por rateios
// ligados a elas, com pagamento parcial livre ("Receber…", "Receber da conta…"); a diferença de um lançamento vira linha
// de dívida. A ocultação do associado para a consulta e a mensalidade "Não pago" são cobertas em db/tests/debts.test.sql.
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

test("devedores: nova dívida com duas linhas, acordo da conta, receber uma e excluir a outra", async ({ page }) => {
  const description = uniqueName("Acampamento");
  const other = uniqueName("Lanche");
  await page.goto("/financeiro/mensalidades");
  await page.getByRole("link", { name: "Devedores" }).first().click();
  await expect(page).toHaveURL(/\/financeiro\/mensalidades\/devedores$/);

  await test.step("nova dívida com duas linhas", async () => {
    await page.getByRole("button", { name: "Nova dívida" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Associado" }).fill(associate);
    await page.getByRole("option", { name: new RegExp(associate) }).click();
    await dialog.getByLabel("Data").fill("2026-03-01");
    for (const [index, [text, value]] of [[description, "150,00"], [other, "10,00"]].entries()) {
      if (index > 0) await dialog.getByRole("button", { name: "Adicionar linha" }).click();
      const line = dialog.getByRole("group", { name: `Linha ${index + 1}` });
      await line.getByRole("combobox", { name: "Rubrica" }).fill(category);
      await page.getByRole("option", { name: new RegExp(category) }).first().click();
      await line.getByLabel("Descrição").fill(text);
      await line.getByLabel("Valor (R$)").fill(value);
    }
    await expect(dialog).toContainText("Total: R$ 160,00");
    await dialog.getByRole("button", { name: "Anotar dívida" }).click();
    await expect(page.getByText("Dívida anotada.")).toBeVisible();
  });

  const account = page.getByRole("button", { name: new RegExp(`^${associate}`) });
  const accountRow = page.getByRole("row").filter({ has: account });
  await expect(accountRow).toContainText("falta R$ 160,00");

  await test.step("acordo na conta", async () => {
    await page.getByRole("button", { name: `Ações de ${associate}` }).click();
    await page.getByRole("menuitem", { name: "Acordo de pagamento…" }).click();
    await page.getByRole("dialog").getByLabel("Acordo (opcional)").fill("3x de R$ 50,00");
    await page.getByRole("dialog").getByRole("button", { name: "Salvar acordo" }).click();
    await expect(page.getByText("Acordo salvo.")).toBeVisible();
    await expect(accountRow).toContainText("Acordo: 3x de R$ 50,00");
  });

  await test.step("receber só uma linha: lançamento já ligado a ela, na rubrica dela", async () => {
    await account.click();
    const row = page.getByRole("row").filter({ hasText: description });
    await expect(row).toContainText(category);
    await row.getByRole("button", { name: /^Ações da dívida/ }).click();
    await page.getByRole("menuitem", { name: "Receber só esta…" }).click();
    await expect(page.getByRole("heading", { name: "Receber dívida" })).toBeVisible();
    await expect(page.getByLabel("Histórico")).toHaveValue(associate);
    await expect(page.getByRole("group", { name: "Rubrica 1" }).getByLabel("Paga a dívida (opcional)")).toContainText(description);
    await page.getByLabel("Histórico").fill(uniqueName("Recebimento"));
    await chooseOption(page, "Forma de pagamento", "PIX");
    await chooseOption(page, "Conta", E2E_ACCOUNTS[0]);
    await page.getByRole("button", { name: "Receber", exact: true }).click();
    await expect(page.getByText("Recebimento lançado na conta (Devedores).")).toBeVisible();
    await expect(page).toHaveURL(/\/financeiro\/mensalidades\/devedores$/);
    await expect(accountRow).toContainText("falta R$ 10,00");
  });

  await test.step("excluir a outra (sem pagamento); a conta fica quitada", async () => {
    if (await account.getAttribute("aria-expanded") === "false") await account.click();
    const otherRow = page.getByRole("row").filter({ hasText: other });
    await otherRow.getByRole("button", { name: /^Ações da dívida/ }).click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Dívida excluída.")).toBeVisible();
    await expect(accountRow).toHaveCount(0);
    await page.getByRole("checkbox", { name: /^Mostrar quitadas/ }).click();
    if (await account.getAttribute("aria-expanded") === "false") await account.click();
    await expect(page.getByRole("row").filter({ hasText: description })).toContainText("Pago em");
  });
});

test("lançamento: a diferença vira linha de dívida; depois, Receber da conta reparte o pagamento", async ({ page }) => {
  const name = uniqueName("Pagou parte");
  await test.step("recebeu R$ 60 de R$ 100: R$ 40 ficam na conta", async () => {
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
    await expect(page.getByRole("group", { name: "Dívida 1" }).getByLabel("Valor (R$)")).toHaveValue("40,00");
    await expect(split.getByLabel(/^Valor \(R\$\)/)).toHaveValue("60,00");
    await expect(page.getByText("✓ Valores conferem")).toBeVisible();
    await page.getByRole("button", { name: "Salvar lançamento" }).click();
    await expect(page.getByText("Lançamento salvo; as linhas de dívida foram para Devedores.")).toBeVisible();
    expect(psql(`select (d.amount_cents, d.origin, e.total_cents)::text from public.debts d join public.ledger_entries e on e.id = d.origin_entry_id
      where e.name = ${literal(name)};`)).toBe("(4000,lancamento,6000)");
  });

  await test.step("Receber da conta: R$ 30 abatem a linha", async () => {
    const receipt = uniqueName("Recebe parte");
    await page.goto("/financeiro/lancamentos/novo");
    await page.getByRole("radio", { name: "Entrada (receita)" }).click();
    await page.getByRole("button", { name: "Receber da conta…" }).click();
    const dialog = page.getByRole("dialog");
    // já vem escolhido quando só ele tem dívida em aberto
    const who = dialog.getByRole("combobox", { name: "Associado" });
    if ((await who.inputValue()) !== associate) {
      await who.fill(associate);
      await page.getByRole("option", { name: associate }).click();
    }
    await dialog.getByLabel("Valor recebido (R$)").fill("30,00");
    await expect(dialog).toContainText("Repartido: R$ 30,00");
    await dialog.getByRole("button", { name: "Adicionar ao lançamento" }).click();
    await page.getByLabel("Histórico").fill(receipt);
    await chooseOption(page, "Forma de pagamento", "PIX");
    await chooseOption(page, "Conta", E2E_ACCOUNTS[0]);
    await expect(page.getByText("✓ Valores conferem")).toBeVisible();
    await page.getByRole("button", { name: "Salvar lançamento" }).click();
    await expect(page.getByText("Lançamento salvo.")).toBeVisible();
    expect(psql(`select sum(s.amount_cents) from public.entry_splits s join public.ledger_entries e on e.id = s.entry_id
      where e.name = ${literal(receipt)} and s.debt_id is not null;`)).toBe("3000");
  });
});
