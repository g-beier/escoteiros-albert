import { expect, test } from "@playwright/test";
import { literal, psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { uniqueName } from "./support/entries";

// Ordem dos materiais numa divisão (017): o gestor arrasta na tela Ordenar, salva e a lista segue a ordem escolhida.
// Divisão e materiais criados direto no banco (nomes únicos) e apagados no fim.
test.describe.configure({ mode: "serial" });

const place = uniqueName("Armário ordem");
const first = uniqueName("Alfa ordem");
const second = uniqueName("Zeta ordem");
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;
const materials = `(select id from public.inventory_materials where group_id = ${group} and name in (${literal(first)}, ${literal(second)}))`;

test.beforeAll(() => {
  psql(`
    insert into public.inventory_locations(group_id, name, position) values (${group}, ${literal(place)}, 9999);
    insert into public.inventory_materials(group_id, name, tracking) values (${group}, ${literal(first)}, 'lot'), (${group}, ${literal(second)}, 'lot');
    insert into public.inventory_lots(group_id, material_id, location_id, quantity, condition)
    select m.group_id, m.id, l.id, 1, 'bom' from public.inventory_materials m
    join public.inventory_locations l on l.group_id = m.group_id and l.name = ${literal(place)}
    where m.id in ${materials};
  `);
});

test.afterAll(() => {
  psql(`
    delete from public.inventory_lots where material_id in ${materials};
    delete from public.inventory_materials where id in ${materials};
    delete from public.inventory_locations where group_id = ${group} and name = ${literal(place)};
  `);
});

const names = async (page: import("@playwright/test").Page, within: string) =>
  (await page.locator(within).getByRole("link").filter({ hasText: /ordem/ }).allTextContents()).filter((text) => text === first || text === second);

test("gestor ordena os materiais da divisão e a lista segue a ordem", async ({ page }) => {
  await page.goto("/inventario/materiais");
  await page.getByRole("link", { name: place, exact: true }).first().click();
  await expect.poll(() => names(page, "table")).toEqual([first, second]);

  await page.getByRole("link", { name: `Ordenar ${place}` }).click();
  await expect(page.getByRole("heading", { name: `Ordenar ${place}` })).toBeVisible();
  const rows = page.getByRole("table", { name: "Materiais da divisão, na ordem escolhida" }).getByRole("row");
  const target = rows.filter({ hasText: first });
  const box = await target.boundingBox();
  await rows.filter({ hasText: second }).locator("[draggable=true]").dragTo(target, { targetPosition: { x: 40, y: Math.max(2, (box?.height ?? 20) / 4) } });
  await expect(rows.nth(1)).toContainText(second);
  await page.getByRole("button", { name: "Salvar ordem" }).click();
  await expect(page.getByText("Ordem salva.")).toBeVisible();
  await expect(page).toHaveURL(/\/inventario\/materiais\?divisao=/);
  await expect.poll(() => names(page, "table")).toEqual([second, first]);

  // Pelo nome (cabeçalho Material) volta a A→Z.
  await page.getByRole("link", { name: /^Material/ }).click();
  await expect.poll(() => names(page, "table")).toEqual([first, second]);
});
