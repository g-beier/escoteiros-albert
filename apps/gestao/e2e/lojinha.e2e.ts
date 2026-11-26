import { expect, test } from "@playwright/test";
import { literal, psql } from "./support/db";
import { E2E_ACCOUNTS, E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, entryRow, search, uniqueName } from "./support/entries";

// Lojinha (019): lançamento numa rubrica marcada "venda de itens" lista os itens vendidos; salvar dá baixa no lote e
// excluir devolve. Divisão, material, lote e rubrica criados direto no banco (nomes únicos) e apagados no fim.
test.describe.configure({ mode: "serial" });

const place = uniqueName("Lojinha");
const scarf = uniqueName("Lenço");
const category = uniqueName("Venda de lenços");
const entry = uniqueName("Venda na reunião");
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;
const material = `(select id from public.inventory_materials where group_id = ${group} and name = ${literal(scarf)})`;
const stock = () => Number(psql(`select sum(quantity) from public.inventory_lots where material_id = ${material};`));

test.beforeAll(() => {
  psql(`
    insert into public.inventory_locations(group_id, name, position) values (${group}, ${literal(place)}, 9999);
    insert into public.inventory_materials(group_id, name, tracking, for_sale, sale_price_cents) values (${group}, ${literal(scarf)}, 'lot', true, 2500);
    insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition)
    select ${group}, ${material}, l.id, 5, 'bom' from public.inventory_locations l where l.group_id = ${group} and l.name = ${literal(place)};
    insert into public.categories(group_id, name, parent_id, kind, position, sells_items)
    select ${group}, ${literal(category)}, c.id, 'receita', 999, true from public.categories c where c.group_id = ${group} and c.code = '1';
    select public.renumber_categories(${group});
  `);
});

test.afterAll(() => {
  psql(`
    delete from public.entry_sale_draws where material_id = ${material};
    delete from public.inventory_movements where material_id = ${material};
    delete from public.inventory_lots where material_id = ${material};
    delete from public.inventory_materials where id = ${material};
    delete from public.inventory_locations where group_id = ${group} and name = ${literal(place)};
    delete from public.categories where group_id = ${group} and name = ${literal(category)};
  `);
});

test("venda com itens dá baixa no inventário e a exclusão devolve", async ({ page }) => {
  await test.step("lança a venda com o item; o valor da rubrica vem dos itens", async () => {
    await page.goto("/financeiro/lancamentos/novo");
    await page.getByRole("radio", { name: "Entrada (receita)" }).click();
    await page.getByLabel("Histórico").fill(entry);
    await page.getByLabel(/^Valor total/).fill("50,00");
    await chooseOption(page, "Forma de pagamento", "PIX");
    await chooseOption(page, "Conta", E2E_ACCOUNTS[0]);
    const split = page.getByRole("group", { name: "Rubrica 1" });
    await split.getByRole("combobox", { name: "Rubrica" }).fill(category);
    await page.getByRole("option", { name: category }).first().click();
    await split.getByLabel("Descrição").fill("lenços da tropa");

    const items = page.getByRole("group", { name: "Itens vendidos da rubrica 1" });
    await items.getByRole("button", { name: "Adicionar item" }).click();
    await items.getByRole("combobox", { name: "Material" }).fill(scarf);
    await page.getByRole("option", { name: new RegExp(`${scarf} · 5 em estoque`) }).click();
    await expect(items.getByLabel("Preço unitário (R$)")).toHaveValue("25,00");
    await items.getByLabel("Quantidade").fill("2");
    await expect(split.getByLabel(/^Valor \(R\$\)/)).toHaveValue("50,00");
    await expect(page.getByText("✓ Valores conferem")).toBeVisible();
    await page.getByRole("button", { name: "Salvar lançamento" }).click();
    await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  });

  await test.step("o estoque baixou, com o motivo venda", async () => {
    expect(stock()).toBe(3);
    expect(psql(`select count(*) from public.inventory_movements where material_id = ${material} and kind = 'baixa' and write_off_reason = 'venda' and channel = 'financeiro';`)).toBe("1");
  });

  await test.step("excluir o lançamento devolve o item ao lote", async () => {
    await search(page, entry);
    await entryRow(page, entry).getByRole("link", { name: entry, exact: true }).click();
    await expect(page.getByRole("group", { name: "Itens vendidos da rubrica 1" }).getByRole("combobox", { name: "Material" })).toHaveValue(new RegExp(scarf));
    await page.getByRole("button", { name: "Excluir lançamento" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Lançamento excluído.")).toBeVisible();
    expect(stock()).toBe(5);
  });
});
