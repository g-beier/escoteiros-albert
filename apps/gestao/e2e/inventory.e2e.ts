import { expect, test, type Page } from "@playwright/test";
import { deleteUsers, psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";
import { ensureInventoryMember, pageAs } from "./support/members";

// Inventário (032–037) no Gestão: o administrador E2E é gestor; um chefe registra e o movimento fica pendente; a
// consulta só vê. Nomes únicos; tudo apagado no fim direto no banco (movimentos, lotes, peças, materiais,
// famílias e divisões do teste).
test.describe.configure({ mode: "serial" });

const root = uniqueName("Almoxarifado");
const sub = uniqueName("Prateleira");
const family = uniqueName("Barracas");
const code = String(900 + Math.floor(Math.random() * 100));
const lotMaterial = uniqueName("Caneca");
const unitMaterial = uniqueName("Barraca iglu");
const CHIEF = "e2e.chefe.inventario@escoteirosalbert.com.br";
const VIEWER = "e2e.consulta.inventario@escoteirosalbert.com.br";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;

test.beforeAll(async () => {
  await ensureInventoryMember(CHIEF, "chief");
  await ensureInventoryMember(VIEWER, "viewer");
});

test.afterAll(async () => {
  const materials = `(select id from public.inventory_materials where group_id = ${group} and name in (${literal(lotMaterial)}, ${literal(unitMaterial)}))`;
  psql(`
    delete from public.inventory_movements where material_id in ${materials};
    delete from public.inventory_lots where material_id in ${materials};
    delete from public.inventory_units where material_id in ${materials};
    delete from public.inventory_counts where material_id in ${materials};
    delete from public.inventory_materials where id in ${materials};
    delete from public.inventory_families where group_id = ${group} and name = ${literal(family)};
    delete from public.inventory_locations where group_id = ${group} and name = ${literal(sub)};
    delete from public.inventory_locations where group_id = ${group} and name = ${literal(root)};
  `);
  await deleteUsers([CHIEF, VIEWER]);
});

const lotRow = (page: Page, path: string) => page.getByRole("table", { name: "Lotes do material" }).getByRole("row").filter({ hasText: path });

test("gestor: divisões, família, material por quantidade com lote, transferência e baixa", async ({ page }) => {
  await page.goto("/inventario/configuracoes");
  await expect(page).toHaveURL(/\/inventario\/configuracoes\/divisoes$/);
  await expect(page.locator("html")).toHaveAttribute("data-app", "inventario");

  await page.getByRole("button", { name: "Nova divisão" }).click();
  await page.getByRole("dialog").getByLabel("Nome").fill(root);
  await page.getByRole("dialog").getByRole("button", { name: "Cadastrar divisão" }).click();
  await expect(page.getByText("Divisão cadastrada.")).toBeVisible();
  await page.getByRole("button", { name: `Nova subdivisão em ${root}` }).click();
  await page.getByRole("dialog").getByLabel("Nome").fill(sub);
  await page.getByRole("dialog").getByRole("button", { name: "Cadastrar divisão" }).click();
  await expect(page.getByRole("link", { name: sub })).toBeVisible();

  await page.getByRole("link", { name: "Famílias" }).first().click();
  await page.getByRole("button", { name: "Nova família" }).click();
  await page.getByRole("dialog").getByLabel("Nome").fill(family);
  await page.getByRole("dialog").getByLabel("Código").fill(code);
  await page.getByRole("dialog").getByRole("button", { name: "Cadastrar família" }).click();
  await expect(page.getByText("Família cadastrada.")).toBeVisible();

  // material por quantidade: lote de 10 a R$ 1.234,56 na divisão de cima
  await page.goto("/inventario/materiais/novo");
  await page.getByLabel("Nome").fill(lotMaterial);
  await chooseOption(page, "Controle", "Por quantidade");
  await page.getByLabel("Estoque mínimo").fill("8");
  await page.getByRole("button", { name: "Cadastrar material" }).click();
  await expect(page).toHaveURL(/\/inventario\/materiais\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: lotMaterial })).toBeVisible();

  await page.getByRole("button", { name: "Adicionar lote" }).click();
  const add = page.getByRole("dialog");
  await chooseOption(page, "Divisão", root, add);
  await add.getByLabel("Quantidade").fill("10");
  await add.getByLabel("Valor estimado (unidade)").fill("1.234,56");
  await add.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Lote adicionado.")).toBeVisible();
  await expect(lotRow(page, root)).toContainText("R$ 1.234,56");

  // transferir 4 para a subdivisão: dois lotes (6 e 4)
  await page.getByRole("button", { name: `Ações do lote em ${root}` }).click();
  await page.getByRole("menuitem", { name: "Transferir" }).click();
  const transfer = page.getByRole("dialog");
  await chooseOption(page, "Para a divisão", `${root} › ${sub}`, transfer);
  await transfer.getByLabel("Quantidade").fill("4");
  await transfer.getByRole("button", { name: "Transferir" }).click();
  await expect(page.getByText("Lote transferido.")).toBeVisible();
  await expect(lotRow(page, `${root} › ${sub}`).getByRole("cell").nth(1)).toHaveText("4");
  await expect(lotRow(page, root).first().getByRole("cell").nth(1)).toHaveText("6");

  // baixa do lote da subdivisão: sai da lista; o total (6) fica abaixo do mínimo (8)
  await page.getByRole("button", { name: `Ações do lote em ${root} › ${sub}` }).click();
  await page.getByRole("menuitem", { name: "Dar baixa" }).click();
  const writeOff = page.getByRole("dialog");
  await chooseOption(page, "Motivo", "Consumo", writeOff);
  await writeOff.getByRole("button", { name: "Dar baixa" }).click();
  await expect(page.getByText("Baixa registrada.")).toBeVisible();
  await expect(lotRow(page, sub)).toHaveCount(0);
  const history = page.getByRole("table", { name: "Histórico de movimentos do material" });
  await expect(history).toContainText("Transferência");
  await expect(history).toContainText("Consumo");
  await expect(page.getByLabel("Abaixo do mínimo")).toBeVisible();

  // lista por local (busca mostra todos) e movimentações filtradas por tipo
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  const line = page.getByRole("row").filter({ has: page.getByRole("link", { name: lotMaterial }) });
  await expect(line).toContainText("6");
  await page.goto("/inventario/movimentacoes?tipo=baixa");
  await expect(page.getByRole("table", { name: "Movimentações do inventário" })).toContainText(lotMaterial);
});

test("gestor: material por peça com etiqueta da família", async ({ page }) => {
  await page.goto("/inventario/materiais/novo");
  await page.getByLabel("Nome").fill(unitMaterial);
  await chooseOption(page, "Família", `${family} (${code})`);
  await chooseOption(page, "Controle", "Por peça");
  await page.getByRole("button", { name: "Cadastrar material" }).click();
  await expect(page.getByRole("heading", { name: unitMaterial })).toBeVisible();

  await page.getByRole("button", { name: "Adicionar peça" }).click();
  const add = page.getByRole("dialog");
  await chooseOption(page, "Divisão", `${root} › ${sub}`, add);
  await expect(add).toContainText(`Próxima livre: GEAS-${code}-0001`);
  await add.getByLabel("Etiqueta").fill(`GEAS-${code}-0001`);
  await add.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Peça adicionada.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Peças do material" })).toContainText(`GEAS-${code}-0001`);
});

test("chefe: o que registra fica pendente de revisão do gestor", async ({ browser, page }) => {
  const chief = await pageAs(browser, CHIEF);
  await chief.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  await chief.getByRole("link", { name: lotMaterial }).click();
  await expect(chief.getByText("O que você registrar vale na hora e fica pendente de revisão")).toBeVisible();
  await chief.getByRole("button", { name: "Adicionar lote" }).click();
  const add = chief.getByRole("dialog");
  await chooseOption(chief, "Divisão", root, add);
  await add.getByLabel("Quantidade").fill("2");
  await add.getByRole("button", { name: "Adicionar" }).click();
  await expect(chief.getByText("Lote adicionado.")).toBeVisible();
  const history = chief.getByRole("table", { name: "Histórico de movimentos do material" });
  await expect(history.getByRole("row").filter({ hasText: "por você" })).toContainText("Pendente de revisão");

  // o chefe não altera divisões
  await chief.goto("/inventario/configuracoes/divisoes");
  await expect(chief.getByText("Só o gestor do inventário altera as divisões.")).toBeVisible();
  await expect(chief.getByRole("button", { name: "Nova divisão" })).toHaveCount(0);
  await chief.context().close();

  // o gestor vê a pendência no resumo e na lista
  await page.goto("/inventario");
  await page.getByRole("link", { name: /Pendentes de revisão/ }).click();
  await expect(page).toHaveURL(/\/inventario\/movimentacoes\?revisao=pendente$/);
  await expect(page.getByRole("table", { name: "Movimentações do inventário" })).toContainText(lotMaterial);
});

test("consulta: só vê, sem cadastrar nem movimentar", async ({ browser }) => {
  const viewer = await pageAs(browser, VIEWER);
  await viewer.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  await expect(viewer.getByRole("link", { name: lotMaterial })).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Novo material" })).toHaveCount(0);
  await viewer.getByRole("link", { name: lotMaterial }).click();
  await expect(viewer.getByRole("heading", { name: lotMaterial })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Adicionar lote" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /^Ações do lote/ })).toHaveCount(0);
  await viewer.goto("/inventario/materiais/novo");
  await expect(viewer).toHaveURL(/\/inventario\/materiais$/);
  await viewer.context().close();
});
