import { expect, test } from "@playwright/test";
import { cleanupE2eGroup, psql } from "./support/db";
import { E2E_ACCOUNTS, E2E_ADMIN_EMAIL } from "./support/env";
import { uniqueName } from "./support/entries";

// Mensalidades › Devedores (038, 039): anotar, ver no grupo do devedor, editar o acordo, excluir e registrar
// um pagamento que cobre duas dívidas.
// A ocultação do associado para a consulta é coberta em db/tests/debts.sql.
const associate = uniqueName("Devedor");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

test.beforeAll(() => {
  psql(`insert into public.associates(group_id, name, branch)
    select m.group_id, ${literal(associate)}, 'escoteiro' from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)};`);
});
test.afterAll(() => {
  cleanupE2eGroup();
  psql(`delete from public.associates where name = ${literal(associate)};`);
});

test("devedores: anotar, editar o acordo e excluir", async ({ page }) => {
  const description = uniqueName("Acampamento");
  await page.goto("/financeiro/mensalidades");
  await expect(page).toHaveURL(/\/financeiro\/mensalidades\/controle$/);
  await page.getByRole("link", { name: "Devedores" }).first().click();
  await expect(page).toHaveURL(/\/financeiro\/mensalidades\/devedores$/);

  await page.getByRole("button", { name: "Nova dívida" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Associado" }).fill(associate);
  await page.getByRole("option", { name: new RegExp(associate) }).click();
  await expect(dialog.getByText("Nenhum lançamento de receita com este associado.")).toBeVisible();
  await dialog.getByLabel("Data").fill("2026-03-01");
  await dialog.getByLabel("Valor (R$)").fill("150,00");
  await dialog.getByLabel("Descrição").fill(description);
  await dialog.getByRole("button", { name: "Anotar dívida" }).click();
  await expect(page.getByText("Dívida anotada.")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: description });
  // devedor recolhido: só o resumo; abrir mostra a dívida
  const debtor = page.getByRole("button", { name: new RegExp(`^${associate}`) });
  await expect(debtor).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("row").filter({ has: debtor })).toContainText("falta R$ 150,00");
  await expect(row).toHaveCount(0);
  await debtor.click();
  await expect(row).toContainText("R$ 150,00");
  await expect(row).toContainText("Em aberto");

  await row.getByRole("button", { name: /^Ações da dívida/ }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await page.getByRole("dialog").getByLabel("Acordo de pagamento (opcional)").fill("3x de R$ 50,00");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar dívida" }).click();
  await expect(page.getByText("Dívida salva.")).toBeVisible();
  await expect(row).toContainText("Acordo: 3x de R$ 50,00");

  await row.getByRole("button", { name: /^Ações da dívida/ }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Dívida excluída.")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("devedores: um lançamento paga duas dívidas pelo devedor", async ({ page }) => {
  const entry = uniqueName("Pagamento devedor");
  const lanche = uniqueName("Lanche");
  const acampamento = uniqueName("Acampamento");
  // lançamento de R$ 240 com o associado e duas dívidas (10 + 230), pelas funções auditadas, como o administrador E2E
  psql(`
    begin;
    select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true) from auth.users u where u.email = ${literal(E2E_ADMIN_EMAIL)};
    set local role authenticated;
    select public.create_ledger_entry(a.group_id, '2026-05-12', ${literal(entry)},
      (select id from public.payment_methods where group_id = a.group_id and name = 'PIX'), null, false, 24000,
      jsonb_build_array(jsonb_build_object('category_id', (select id from public.categories where group_id = a.group_id and kind = 'receita' and parent_id is not null order by code limit 1),
        'amount_cents', 24000, 'description', 'lanche e acampamento', 'associate_id', a.id)), (select id from public.accounts where group_id = a.group_id and name = ${literal(E2E_ACCOUNTS[0])}))
    from public.associates a where a.name = ${literal(associate)};
    select public.save_debt(a.group_id, null, a.id, '2026-04-01', 1000, ${literal(lanche)}, null, '[]') from public.associates a where a.name = ${literal(associate)};
    select public.save_debt(a.group_id, null, a.id, '2026-04-02', 23000, ${literal(acampamento)}, null, '[]') from public.associates a where a.name = ${literal(associate)};
    commit;
  `);

  await page.goto("/financeiro/mensalidades/devedores");
  const debtorRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: new RegExp(`^${associate}`) }) });
  await expect(debtorRow).toContainText("falta R$ 240,00");
  await debtorRow.getByRole("button", { name: `Ações de ${associate}` }).click();
  await page.getByRole("menuitem", { name: "Registrar pagamento" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Lançamento").click();
  await page.getByRole("option", { name: new RegExp(entry) }).click();
  // repartido da mais antiga para a mais nova
  await expect(dialog.getByLabel(`Valor para ${lanche}`)).toHaveValue("10,00");
  await expect(dialog.getByLabel(`Valor para ${acampamento}`)).toHaveValue("230,00");
  await expect(dialog).toContainText("Usado: R$ 240,00 de R$ 240,00");
  await dialog.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(page.getByText("Pagamento registrado.")).toBeVisible();

  // quitado: some da lista até mostrar as quitadas
  await expect(debtorRow).toHaveCount(0);
  await page.getByRole("checkbox", { name: /^Mostrar quitadas/ }).click();
  await expect(debtorRow).toContainText("Quitado");
  await debtorRow.getByRole("button", { name: new RegExp(`^${associate}`) }).click();
  await expect(page.getByRole("row").filter({ hasText: lanche })).toContainText("R$ 10,00 de R$ 240,00");
  await expect(page.getByRole("row").filter({ hasText: acampamento })).toContainText("R$ 230,00 de R$ 240,00");
});
