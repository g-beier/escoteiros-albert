import { expect, test, type Page } from "@playwright/test";
import { deleteUsers, psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";
import { ensureInventoryMember, pageAs } from "./support/members";

// Inventário (032–045) no Gestão: o administrador E2E é gestor; um chefe registra, o movimento fica para revisar e o
// gestor revisa; o registro rápido fica para revisar mesmo do gestor; a
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

  // material por quantidade cadastrado já com a primeira entrada: lote de 10 a R$ 1.234,56 na divisão de cima
  await page.goto("/inventario/materiais/novo");
  await page.getByLabel("Nome").fill(lotMaterial);
  await page.getByRole("radio", { name: /^Por quantidade/ }).click();
  await page.getByLabel("Estoque mínimo").fill("8");
  await page.getByRole("checkbox", { name: "Registrar a primeira entrada agora" }).click();
  await chooseOption(page, "Divisão", root);
  await page.getByLabel("Quantidade", { exact: true }).fill("10");
  await page.getByLabel("Valor estimado (unidade)").fill("1.234,56");
  await page.getByRole("button", { name: "Cadastrar material" }).click();
  await expect(page).toHaveURL(/\/inventario\/materiais\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: lotMaterial })).toBeVisible();
  await expect(lotRow(page, root)).toContainText("R$ 1.234,56");

  // transferir 4 para a subdivisão: dois lotes (6 e 4)
  await page.getByRole("button", { name: `Mais ações do lote em ${root}` }).click();
  await page.getByRole("menuitem", { name: "Transferir" }).click();
  const transfer = page.getByRole("dialog");
  await chooseOption(page, "Para a divisão", `${root} › ${sub}`, transfer);
  await transfer.getByLabel("Quantidade").fill("4");
  await transfer.getByRole("button", { name: "Transferir" }).click();
  await expect(page.getByText("Lote transferido.")).toBeVisible();
  await expect(lotRow(page, `${root} › ${sub}`).getByRole("cell").nth(1)).toHaveText("4");
  await expect(lotRow(page, root).first().getByRole("cell").nth(1)).toHaveText("6");

  // condição e ajuste do lote da subdivisão: Movimentações mostram de → para
  await page.getByRole("button", { name: `Mais ações do lote em ${root} › ${sub}` }).click();
  await page.getByRole("menuitem", { name: "Mudar condição" }).click();
  const change = page.getByRole("dialog");
  await chooseOption(page, "Nova condição", "Em manutenção", change);
  await change.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: `Mais ações do lote em ${root} › ${sub}` }).click();
  await page.getByRole("menuitem", { name: "Corrigir contagem…" }).click();
  const adjust = page.getByRole("dialog");
  await adjust.getByLabel("Quantidade contada").fill("5");
  await expect(adjust.getByRole("note")).toHaveCount(0); // contagem maior: é correção, sem sugerir baixa
  await adjust.getByLabel("Por que o registro estava errado?").fill("recontado");
  await adjust.getByRole("button", { name: "Corrigir" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`/inventario/movimentacoes`);
  const moves = page.getByRole("table", { name: "Movimentações do inventário" }).getByRole("row").filter({ hasText: lotMaterial });
  await expect(moves.filter({ hasText: "Condição" })).toContainText("Bom→paraEm manutenção");
  const adjusted = moves.filter({ hasText: "Ajuste" });
  await expect(adjusted).toContainText("4 → 5");
  await expect(adjusted).toContainText("+1");
  await expect(adjusted).toContainText(`${root} › ${sub}`);
  await page.goBack();

  // corrigir para menos sugere a baixa da diferença; a baixa leva o lote todo: sai da lista e o total (6) fica
  // abaixo do mínimo (8)
  await page.getByRole("button", { name: `Mais ações do lote em ${root} › ${sub}` }).click();
  await page.getByRole("menuitem", { name: "Corrigir contagem…" }).click();
  const fix = page.getByRole("dialog");
  await fix.getByLabel("Quantidade contada").fill("0");
  await expect(fix.getByRole("note")).toContainText("Faltam 5");
  await fix.getByRole("button", { name: "Registrar 5 como baixa" }).click();
  const writeOff = page.getByRole("dialog");
  await expect(writeOff.getByLabel(/^Quantidade/)).toHaveValue("5");
  await chooseOption(page, "Motivo", "Consumo", writeOff);
  await writeOff.getByRole("button", { name: "Dar baixa" }).click();
  await expect(page.getByText("Baixa registrada.")).toBeVisible();
  await expect(lotRow(page, sub)).toHaveCount(0);
  const history = page.getByRole("table", { name: "Histórico de movimentos do material" });
  await expect(history).toContainText("Transferência");
  await expect(history).toContainText("Consumo");
  await expect(page.getByLabel("Abaixo do mínimo")).toBeVisible();

  // lista por local: sem divisão escolhida, a aba é "Todos" (a primeira); a divisão filtra
  await page.goto("/inventario/materiais");
  const tabs = page.getByRole("navigation", { name: "Locais" });
  await expect(tabs.getByRole("link").first()).toHaveText("Todos");
  await expect(tabs.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Todos os locais" })).toBeVisible();
  await tabs.getByRole("link", { name: root }).click();
  await expect(page).toHaveURL(/divisao=[0-9a-f-]{36}/);
  await expect(page.getByRole("link", { name: lotMaterial })).toBeVisible();
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  const line = page.getByRole("row").filter({ has: page.getByRole("link", { name: lotMaterial }) });
  await expect(line).toContainText("6");
  await page.goto("/inventario/movimentacoes?tipo=transferencia");
  await expect(page.getByRole("table", { name: "Movimentações do inventário" })).toContainText(`${root} → ${root} › ${sub}`);
  await page.goto("/inventario/movimentacoes?tipo=baixa");
  await expect(page.getByRole("table", { name: "Movimentações do inventário" })).toContainText(lotMaterial);
});

test("gestor: material por peça com etiqueta da família", async ({ page }) => {
  await page.goto("/inventario/materiais/novo");
  await page.getByLabel("Nome").fill(unitMaterial);
  await chooseOption(page, "Família", `${family} ${code}`);
  await page.getByRole("radio", { name: /^Por peça/ }).click();
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

test("lista: filtros por estado e valor, ordem e colunas; o detalhe volta com tudo", async ({ page }) => {
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  const line = page.getByRole("row").filter({ has: page.getByRole("link", { name: lotMaterial }) });
  await expect(line).toContainText("Bom");
  await expect(line).toContainText("R$ 1.234,56");

  // menu da coluna Estado: só "Ruim" esconde o material (lote bom); com "Bom" também, volta
  const columnMenu = (name: string) => page.getByRole("columnheader", { name: new RegExp(`^${name}`) }).getByRole("button");
  await columnMenu("Estado").click();
  await page.getByRole("dialog").getByRole("button", { name: "Limpar", exact: true }).click();
  await page.getByRole("checkbox", { name: "Ruim" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/estado=ruim/);
  await expect(page.getByText("Nenhum material encontrado.")).toBeVisible();
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}&estado=bom,ruim`);
  await expect(line).toBeVisible();

  // menu da Quantidade: o material está abaixo do mínimo (6 de 8)
  await columnMenu("Quantidade").click();
  await page.getByRole("dialog").getByRole("button", { name: "Limpar", exact: true }).click();
  await page.getByRole("checkbox", { name: "No mínimo ou acima" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/minimo=ok/);
  await expect(page.getByText("Nenhum material encontrado.")).toBeVisible();
  await columnMenu("Quantidade").click();
  await page.getByRole("checkbox", { name: "Abaixo do mínimo" }).click();
  await page.getByRole("checkbox", { name: "No mínimo ou acima" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/minimo=abaixo/);
  await expect(line).toBeVisible();

  // menu da Validade: o lote não tem validade
  await columnMenu("Validade").click();
  await page.getByRole("checkbox", { name: "Sem validade" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/validade=vencido%2Cvalido/);
  await expect(page.getByText("Nenhum material encontrado.")).toBeVisible();
  await columnMenu("Validade").click();
  await page.getByRole("button", { name: "Remover filtro" }).click();
  await expect(line).toBeVisible();

  // menu do Valor unitário: faixa acima do valor do lote some; abaixo aparece
  await columnMenu("Valor unitário").click();
  await page.getByLabel("De (R$)").fill("2.000");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("Nenhum material encontrado.")).toBeVisible();
  await columnMenu("Valor unitário").click();
  await expect(page.getByLabel("De (R$)")).toHaveValue("2.000");
  await page.getByLabel("De (R$)").fill("1.000");
  await page.getByLabel("De (R$)").press("Enter");
  await expect(page).toHaveURL(/unitario_de=1\.000/);
  await expect(line).toBeVisible();

  // ordem pelo menu da Quantidade; colunas sem filtro ordenam com um clique
  await columnMenu("Quantidade").click();
  await page.getByRole("button", { name: "Do maior ao menor", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: /^Quantidade/ })).toHaveAttribute("aria-sort", "descending");
  await expect(page).toHaveURL(/ordem=quantidade&dir=desc/);
  const total = page.getByRole("columnheader", { name: /^Valor total/ });
  await total.getByRole("link").click();
  await expect(total).toHaveAttribute("aria-sort", "ascending");
  await columnMenu("Quantidade").click();
  await page.getByRole("button", { name: "Do maior ao menor", exact: true }).click();
  await expect(page).toHaveURL(/ordem=quantidade&dir=desc/);
  const listUrl = page.url();

  // detalhe e edição voltam para a lista com busca, filtros e ordem
  await line.getByRole("link", { name: lotMaterial }).click();
  await expect(page.getByRole("heading", { name: lotMaterial })).toBeVisible();
  await page.getByRole("link", { name: "Editar material" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("heading", { name: lotMaterial })).toBeVisible();
  await page.getByRole("navigation", { name: "Caminho" }).getByRole("link", { name: "Materiais" }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByRole("columnheader", { name: /^Valor unitário.*filtrada/ })).toBeVisible();

  // colunas: ocultar "Valor total" vale depois de recarregar
  await page.getByRole("button", { name: "Colunas" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Valor total" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: /^Valor total/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("columnheader", { name: /^Valor total/ })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: /^Valor unitário/ })).toBeVisible();
});

test("busca ampliada: acha pela família e pela etiqueta, sem diferenciar caixa", async ({ page }) => {
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(family.toUpperCase())}`);
  await expect(page.getByRole("link", { name: unitMaterial })).toBeVisible();
  await expect(page.getByRole("link", { name: lotMaterial })).toHaveCount(0);
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(`geas-${code}-0001`)}`);
  await expect(page.getByRole("link", { name: unitMaterial })).toBeVisible();
});

test("chefe registra, fica para revisar, e o gestor revisa", async ({ browser, page }) => {
  const chief = await pageAs(browser, CHIEF);
  await chief.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  await chief.getByRole("link", { name: lotMaterial }).click();
  await expect(chief.getByText("O que você registrar vale na hora e fica para revisar")).toBeVisible();
  await chief.getByRole("button", { name: "Adicionar lote" }).click();
  const add = chief.getByRole("dialog");
  await chooseOption(chief, "Divisão", root, add);
  await add.getByLabel("Quantidade").fill("2");
  await add.getByRole("button", { name: "Adicionar" }).click();
  await expect(chief.getByText(/^(Lote adicionado|Somado ao lote igual que já existia)\.$/)).toBeVisible();
  const history = chief.getByRole("table", { name: "Histórico de movimentos do material" });
  const mine = history.getByRole("row").nth(1); // mais novo primeiro
  await expect(mine).toContainText("Para revisar");
  await mine.getByRole("button", { name: "Detalhes da revisão" }).click();
  await expect(chief.getByRole("dialog")).toContainText("por você");
  await chief.keyboard.press("Escape");

  // o chefe não altera divisões
  await chief.goto("/inventario/configuracoes/divisoes");
  await expect(chief.getByText("Só o gestor do inventário altera as divisões.")).toBeVisible();
  await expect(chief.getByRole("button", { name: "Nova divisão" })).toHaveCount(0);
  await chief.context().close();

  // o gestor vê o aviso em Materiais (entrada do Inventário) e revisa
  await page.goto("/inventario");
  await page.getByRole("link", { name: /^\d+ para revisar$/ }).click();
  await expect(page).toHaveURL(/\/inventario\/movimentacoes\?revisao=para_revisar$/);
  const list = page.getByRole("table", { name: "Movimentações do inventário" });
  const row = list.getByRole("row").filter({ hasText: lotMaterial });
  await expect(row).toHaveCount(1);
  await row.getByRole("checkbox").click();
  await page.getByLabel("Nota da revisão (opcional)").fill("conferido com o chefe");
  await page.getByRole("button", { name: "Marcar como revisado (1)" }).click();
  await expect(page.getByText("Movimento revisado.")).toBeVisible();
  await expect(list.getByRole("row").filter({ hasText: lotMaterial })).toHaveCount(0);
  await page.goto(`/inventario/movimentacoes?revisao=revisado`);
  const reviewed = page.getByRole("table", { name: "Movimentações do inventário" }).getByRole("row").filter({ hasText: lotMaterial }).first();
  await reviewed.getByRole("button", { name: "Ver a nota da revisão" }).click();
  await expect(page.getByRole("dialog")).toContainText("conferido com o chefe");
});

test("registro rápido (celular): fica para revisar mesmo do gestor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/rapido");
  await page.getByLabel("Buscar material").fill(lotMaterial);
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("link", { name: new RegExp(lotMaterial) }).click();
  await page.getByRole("link", { name: /Retirar \/ consumir/ }).click();
  await page.getByRole("radio").first().click();
  await expect(page.getByLabel(/Quantidade retirada/)).toHaveValue("1");
  await chooseOption(page, "Motivo", "Consumo");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status")).toContainText("Retirada registrada. Fica para revisar.");

  await page.goto("/inventario/movimentacoes?revisao=para_revisar");
  const row = page.getByRole("table", { name: "Movimentações do inventário" }).getByRole("row").filter({ hasText: lotMaterial });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Baixa");
  await row.getByRole("button", { name: "Detalhes da revisão" }).click();
  await expect(page.getByRole("dialog")).toContainText("Registro rápido");
});

test("lista: um botão ± na linha inclui ou remove, sem abrir o material", async ({ page }) => {
  await page.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  const stock = page.getByRole("button", { name: `Incluir ou remover: ${lotMaterial}` }).first();

  await stock.click();
  const add = page.getByRole("dialog");
  await expect(add.getByRole("radio", { name: /Retirar/ })).toBeChecked(); // com saldo, abre em retirar
  await add.getByRole("radio", { name: "Incluir" }).click();
  await add.getByLabel("Quantidade", { exact: true }).fill("3");
  await add.getByRole("button", { name: "Incluir" }).last().click();
  await expect(page.getByText(/^(Lote adicionado|Somado ao lote igual que já existia)\.$/)).toBeVisible();

  // a mesma entrada de novo soma no lote que acabou de ganhar as 3 unidades
  await stock.click();
  await add.getByRole("radio", { name: "Incluir" }).click();
  await add.getByLabel("Quantidade", { exact: true }).fill("1");
  await add.getByRole("button", { name: "Incluir" }).last().click();
  await expect(page.getByText("Somado ao lote igual que já existia.")).toBeVisible();

  await stock.click();
  const out = page.getByRole("dialog");
  const lotChoice = out.getByRole("radio", { name: /un\./ }); // cartões só quando há mais de um lote na divisão
  if (await lotChoice.count()) await lotChoice.first().click();
  await expect(out.getByLabel(/^Quantidade/)).toHaveValue("1");
  await chooseOption(page, "Motivo", "Perda", out);
  await out.getByRole("button", { name: "Dar baixa" }).click();
  await expect(page.getByText("Baixa registrada.")).toBeVisible();
  await page.goto("/inventario/movimentacoes?tipo=baixa");
  await expect(page.getByRole("table", { name: "Movimentações do inventário" }).getByRole("row").filter({ hasText: lotMaterial }).first()).toContainText("Perda");
});

test("consulta: só vê, sem cadastrar nem movimentar", async ({ browser }) => {
  const viewer = await pageAs(browser, VIEWER);
  await viewer.goto(`/inventario/materiais?q=${encodeURIComponent(lotMaterial)}`);
  await expect(viewer.getByRole("link", { name: lotMaterial })).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Novo material" })).toHaveCount(0);
  await viewer.getByRole("link", { name: lotMaterial }).click();
  await expect(viewer.getByRole("heading", { name: lotMaterial })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Adicionar lote" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /ações do lote/i })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /^Incluir ou remover/ })).toHaveCount(0);
  await viewer.goto("/inventario/materiais/novo");
  await expect(viewer).toHaveURL(/\/inventario\/materiais$/);
  await viewer.goto("/rapido/inventario/novo");
  await expect(viewer).toHaveURL(/\/rapido$|\/$/);
  await expect(viewer.getByLabel("Buscar material")).toHaveCount(0);
  await viewer.context().close();
});
