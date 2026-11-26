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
const badge = `${scarf} distintivo`;
const material = `(select id from public.inventory_materials where group_id = ${group} and name = ${literal(scarf)})`;
const ours = `(select id from public.inventory_materials where group_id = ${group} and name in (${literal(scarf)}, ${literal(badge)}))`;
const stock = () => Number(psql(`select sum(quantity) from public.inventory_lots where material_id = ${material};`));

test.beforeAll(() => {
  psql(`
    insert into public.inventory_locations(group_id, name, position) values (${group}, ${literal(place)}, 9999);
    insert into public.inventory_materials(group_id, name, tracking, for_sale, sale_price_cents) values (${group}, ${literal(scarf)}, 'lot', true, 2500);
    insert into public.inventory_materials(group_id, name, tracking) values (${group}, ${literal(badge)}, 'lot');
    insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition)
    select ${group}, ${material}, l.id, 5, 'bom' from public.inventory_locations l where l.group_id = ${group} and l.name = ${literal(place)};
    insert into public.categories(group_id, name, parent_id, kind, position)
    select ${group}, ${literal(category)}, c.id, 'receita', 999 from public.categories c where c.group_id = ${group} and c.code = '1';
    select public.renumber_categories(${group});
  `);
});

test.afterAll(() => {
  // Venda que ficou de um teste interrompido: excluir pela função devolve o estoque e apaga os itens.
  const gid = psql(`select ${group};`);
  psql(`
    begin;
    select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true)
      from auth.users u where u.email = ${literal(E2E_ADMIN_EMAIL)};
    set local role authenticated;
    select public.delete_ledger_entry(e.id) from public.ledger_entries e where e.group_id = ${literal(gid)} and e.name = ${literal(entry)};
    commit;`);
  psql(`
    delete from public.entry_sale_draws where material_id = ${material};
    delete from public.inventory_movements where material_id in ${ours};
    delete from public.inventory_lots where material_id in ${ours};
    delete from public.inventory_materials where id in ${ours};
    delete from public.inventory_locations where group_id = ${group} and name = ${literal(place)};
    delete from public.categories where group_id = ${group} and name = ${literal(category)};
  `);
});

test("venda com itens dá baixa no inventário e a exclusão devolve", async ({ page }) => {
  await test.step("marca a rubrica como venda de itens e salva", async () => {
    await page.goto("/financeiro/configuracoes/rubricas");
    const escaped = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await page.getByRole("button", { name: new RegExp(`^Ações de [\\d.]+ ${escaped}$`) }).click();
    await page.getByRole("menuitem", { name: "Marcar venda de itens (Lojinha)" }).click();
    await page.getByRole("region", { name: "Alterações não salvas" }).getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Rubricas salvas.")).toBeVisible();
    expect(psql(`select sells_items from public.categories where group_id = ${group} and name = ${literal(category)};`)).toBe("t");
  });

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

  await test.step("detalhe do material: Lojinha e link para o lançamento no histórico", async () => {
    await page.goto(`/inventario/materiais/${psql(`select ${material};`)}`);
    await expect(page.getByText("À venda · R$ 25,00")).toBeVisible();
    await page.getByRole("link", { name: "ver lançamento" }).first().click();
    await expect(page).toHaveURL(/\/financeiro\/lancamentos\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: entry })).toBeVisible();
  });

  await test.step("excluir o lançamento devolve o item ao lote", async () => {
    await page.goto("/financeiro/lancamentos/movimentacoes");
    await search(page, entry);
    await entryRow(page, entry).getByRole("link", { name: entry, exact: true }).click();
    await expect(page.getByRole("group", { name: "Itens vendidos da rubrica 1" }).getByRole("combobox", { name: "Material" })).toHaveValue(new RegExp(scarf));
    await page.getByRole("button", { name: "Excluir lançamento" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Lançamento excluído.")).toBeVisible();
    expect(stock()).toBe(5);
  });
});

test("marca à venda em lote, ícone ao lado do nome e filtro Só à venda", async ({ page }) => {
  const sale = page.getByRole("checkbox", { name: "Só à venda" });
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(scarf)}`);
  await expect(page.getByTitle(/^À venda na Lojinha/)).toHaveCount(1);

  await test.step("os dois em lote: só o distintivo muda", async () => {
    await page.getByRole("checkbox", { name: new RegExp(`^Selecionar ${scarf} em `) }).check();
    await page.getByRole("checkbox", { name: `Selecionar ${badge} (sem estoque)` }).check();
    await page.getByRole("region", { name: "Ações com os materiais selecionados" }).getByRole("button", { name: "À venda" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Lojinha atualizada: 1 material.")).toBeVisible();
    await expect(page.getByTitle(/^À venda na Lojinha/)).toHaveCount(2);
    expect(psql(`select sale_price_cents from public.inventory_materials where id = ${material};`)).toBe("2500");
  });

  await test.step("Só à venda e tirar da venda em lote", async () => {
    await sale.click();
    await expect(page).toHaveURL(/venda=1/);
    await expect(page.getByRole("link", { name: badge, exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: "Selecionar todas as linhas da lista" }).check();
    await page.getByRole("region", { name: "Ações com os materiais selecionados" }).getByRole("button", { name: "À venda" }).click();
    await page.getByRole("dialog").getByLabel("À venda na Lojinha").click();
    await page.getByRole("option", { name: /^Não/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Lojinha atualizada: 2 materiais.")).toBeVisible();
    await expect(page.getByText("Nenhum material encontrado.")).toBeVisible();
  });
});
