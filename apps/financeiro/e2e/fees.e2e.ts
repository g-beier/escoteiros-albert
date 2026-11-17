import { expect, test, type Page } from "@playwright/test";
import { cleanupE2eGroup, psql } from "./support/db";
import { E2E_ACCOUNTS, E2E_ADMIN_EMAIL } from "./support/env";
import { uniqueName } from "./support/entries";

// Mensalidades › Controle (018–022): rubrica de mensalidade em Configurações, pagamento lançado com o associado
// vira sugestão, confirmar sugestões, marcar e limpar uma caixinha, isentar e remover a isenção.
// Usa um ano antigo (sem valor configurado: um mês por rateio) para não cruzar com outros testes.
const YEAR = 2002;
const associate = uniqueName("Mensalista");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const cell = (page: Page, month: string) => page.getByRole("button", { name: new RegExp(`^${associate}, ${month}: `) });

test.beforeAll(() => {
  psql(`insert into public.associates(group_id, name, branch)
    select m.group_id, ${literal(associate)}, 'escoteiro' from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)};`);
});
test.afterAll(() => {
  cleanupE2eGroup();
  psql(`delete from public.associates where name = ${literal(associate)};`);
});

test("mensalidades: sugestão do lançamento, confirmar, marcar, limpar e isentar", async ({ page }) => {
  // Configurações › Mensalidades: a rubrica de mensalidade decide o que vira sugestão
  await page.goto("/configuracoes/mensalidades");
  const settings = page.getByRole("region", { name: "Mensalidades" });
  await settings.getByRole("combobox", { name: "Rubrica de mensalidade" }).fill("Mensalidades");
  await page.getByRole("option", { name: /Mensalidades/ }).first().click();
  await settings.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Configurações de mensalidade salvas.")).toBeVisible();

  // pagamento de abril lançado na rubrica de mensalidade, com o associado (pelas funções auditadas)
  psql(`
    begin;
    select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true) from auth.users u where u.email = ${literal(E2E_ADMIN_EMAIL)};
    set local role authenticated;
    select public.create_ledger_entry(a.group_id, '${YEAR}-04-10', ${literal(uniqueName("Mensalidade abril"))},
      (select id from public.payment_methods where group_id = a.group_id and name = 'PIX'), null, false, 6000,
      jsonb_build_array(jsonb_build_object('category_id', (select category_id from public.fee_settings where group_id = a.group_id),
        'amount_cents', 6000, 'description', 'mensalidade', 'associate_id', a.id)),
      (select id from public.accounts where group_id = a.group_id and name = ${literal(E2E_ACCOUNTS[0])}))
    from public.associates a where a.name = ${literal(associate)};
    commit;
  `);

  await page.goto(`/mensalidades/controle?ano=${YEAR}`);
  await page.getByRole("searchbox", { name: "Buscar associado" }).fill(associate);
  await expect(cell(page, "abril")).toHaveAccessibleName(`${associate}, abril: pagamento a confirmar`);

  await page.getByRole("button", { name: "Confirmar sugestões (1)" }).click();
  await expect(page.getByText("1 mensalidade confirmada.")).toBeVisible();
  await expect(cell(page, "abril")).toHaveAccessibleName(`${associate}, abril: pago`);

  // março: ano encerrado sem registro fica atrasado; marcar Não pago grava na hora e Limpar volta
  await expect(cell(page, "março")).toHaveAccessibleName(`${associate}, março: atrasado`);
  await cell(page, "março").click();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Não pago" }).click();
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cell(page, "março")).toHaveAccessibleName(`${associate}, março: não pago`);
  await page.reload();
  await page.getByRole("searchbox", { name: "Buscar associado" }).fill(associate);
  await expect(cell(page, "março")).toHaveAccessibleName(`${associate}, março: não pago`);
  await cell(page, "março").click();
  await page.getByRole("button", { name: "Limpar" }).click();
  await expect(cell(page, "março")).toHaveAccessibleName(`${associate}, março: atrasado`);

  // isentar tira da grade (só aparece com os ocultos); remover a isenção traz de volta
  await page.getByRole("button", { name: `Ações de ${associate}` }).click();
  await page.getByRole("menuitem", { name: `Isentar em ${YEAR}…` }).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Bolsa");
  await page.getByRole("dialog").getByRole("button", { name: "Isentar" }).click();
  await expect(page.getByText("Isenção registrada.")).toBeVisible();
  await expect(cell(page, "abril")).toHaveCount(0);
  await page.getByRole("checkbox", { name: /^Mostrar ocultos/ }).click();
  await expect(page.getByRole("rowheader", { name: new RegExp(associate) })).toContainText("isento: Bolsa");
  await page.getByRole("button", { name: `Ações de ${associate}` }).click();
  await page.getByRole("menuitem", { name: `Remover isenção de ${YEAR}` }).click();
  await expect(page.getByText("Isenção removida.")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: new RegExp(associate) })).not.toContainText("isento");
});
