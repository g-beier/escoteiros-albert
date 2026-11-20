import { expect, test, type Locator, type Page } from "@playwright/test";
import { psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";

// Responsáveis e valor inicial dos itens de controle (041), como o administrador E2E: itens com valor inicial por
// público, jovem novo já com as situações iniciais, mãe cadastrada num jovem e vinculada ao irmão, situação da mãe
// marcada na matriz aparecendo sob os dois irmãos, célula cinza fora do público. Nomes fictícios; tudo apagado no fim.
test.describe.configure({ mode: "serial" });

const shared = uniqueName("Canal família");
const onlyRelative = uniqueName("Termo responsável");
const first = uniqueName("Jovem irmão um");
const second = uniqueName("Jovem irmão dois");
const mother = uniqueName("Mãe fictícia");
const father = uniqueName("Pai associado fictício");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.afterAll(() => {
  const people = `(select id from public.associates where group_id = ${group} and name in (${[first, second, father].map(literal).join(", ")}))`;
  const relatives = `(select id from public.relatives where group_id = ${group} and name in (${literal(mother)}, ${literal(father)}))`;
  psql(`
    delete from public.control_statuses where associate_id in ${people} or relative_id in ${relatives};
    delete from public.relative_links where associate_id in ${people} or relative_id in ${relatives};
    delete from public.relatives where id in ${relatives};
    delete from public.associate_moves where associate_id in ${people};
    delete from public.associate_movements where associate_id in ${people};
    delete from public.associates where id in ${people};
    delete from public.control_items where group_id = ${group} and name in (${literal(shared)}, ${literal(onlyRelative)});
  `);
});

/**
 * Como chooseOption, mas só a opção visível: o Base UI deixa montada (sem tamanho) a lista do select anterior.
 * Espera a lista anterior terminar de fechar (animação) antes de abrir a próxima: com a máquina carregada, o clique
 * no select seguinte caía durante o fechamento e se perdia, e a opção achada era a da lista que sumia.
 */
async function choose(page: Page, scope: Locator, label: string, option: string) {
  const visibleLists = page.getByRole("listbox").filter({ visible: true });
  await expect(visibleLists).toHaveCount(0);
  const trigger = scope.getByLabel(label, { exact: true });
  await expect(async () => {
    if (await visibleLists.count() === 0) await trigger.click();
    await expect(visibleLists).toHaveCount(1, { timeout: 1_000 });
  }).toPass();
  const choice = visibleLists.getByRole("option", { name: option, exact: true });
  await expect(choice).toBeVisible();
  await choice.click();
}

async function newItem(page: Page, name: string, audiences: { audience: string; initial: string }[]) {
  await page.getByRole("button", { name: "Novo item" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Nome").fill(name);
  await chooseOption(page, "Diretoria", "Comunicação", form);
  for (const { audience, initial } of audiences) {
    await form.getByRole("checkbox", { name: audience, exact: true }).click();
    await choose(page, form, `Valor inicial: ${audience}`, initial);
  }
  await form.getByRole("button", { name: "Criar item" }).click();
  await expect(page.getByText(`Item “${name}” criado.`)).toBeVisible();
}

async function createYouth(page: Page, name: string, branch = "Lobinho") {
  await page.goto("/associados/novo");
  await page.getByLabel("Nome").fill(name);
  await chooseOption(page, "Ramo, seção e equipe", branch);
  await page.getByRole("button", { name: "Cadastrar associado" }).click();
  await expect(page).toHaveURL(/\/associados\/[0-9a-f-]{36}$/);
}

const relativesTable = (page: Page) => page.getByRole("table", { name: "Responsáveis do jovem" });
const cell = (page: Page, item: string, person: string) => page.getByRole("button", { name: new RegExp(`^Editar ${escape(item)}, ${escape(person)}: `) });
const motherCell = (page: Page, item: string, youth: string) => cell(page, item, `${mother} (responsável de ${youth})`);

test("valor inicial, mãe compartilhada por irmãos e situação dela na matriz", async ({ page }) => {
  // itens: um de jovem (pendente) e responsável (convidado); outro só de responsável (sem registro)
  await page.goto("/associados/configuracoes/itens");
  await newItem(page, shared, [{ audience: "Jovem", initial: "Pendente" }, { audience: "Responsável", initial: "Convidado" }]);
  await newItem(page, onlyRelative, [{ audience: "Responsável", initial: "Sem registro" }]);
  await expect(page.getByRole("row").filter({ hasText: shared })).toContainText("Jovem: Pend. · Responsável: Conv.");
  await expect(page.getByRole("row").filter({ hasText: onlyRelative })).toContainText("Responsável: —");

  // pai que também é associado (adulto ativo)
  await createYouth(page, father, "Adulto");
  const fatherUrl = page.url();

  // jovem novo: a situação inicial já está gravada
  await createYouth(page, first);
  const firstUrl = page.url();
  await expect(page.getByRole("table", { name: "Controle de dados do associado" }).getByRole("row").filter({ hasText: shared })).toContainText("Pendente");

  // mãe nova, com descrição livre só quando "outro"
  await page.getByRole("button", { name: "Adicionar responsável" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill(mother);
  await expect(dialog.getByLabel("Qual parentesco")).toHaveCount(0);
  await dialog.getByRole("checkbox", { name: "Responsável financeiro" }).click();
  await dialog.getByRole("button", { name: "Adicionar responsável" }).click();
  await expect(page.getByText(`Responsável “${mother}” adicionado.`)).toBeVisible();
  const firstRow = relativesTable(page).getByRole("row").filter({ hasText: mother });
  await expect(firstRow).toContainText("Mãe");
  await expect(firstRow).toContainText("responsável legal · financeiro");

  // irmão: vincular a mesma mãe
  await createYouth(page, second);
  await page.getByRole("button", { name: "Vincular existente" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Responsável", exact: true }).fill(mother);
  await page.getByRole("option", { name: new RegExp(escape(mother)) }).click();
  await dialog.getByRole("button", { name: "Vincular responsável" }).click();
  await expect(page.getByText("Responsável vinculado.")).toBeVisible();
  await expect(relativesTable(page).getByRole("row").filter({ hasText: mother })).toContainText("compartilhado com 1 irmão");

  // matriz: a busca pelo nome da mãe mostra os dois irmãos, cada um com a mãe logo abaixo
  await page.goto(`/associados/controle?publico=jovens&q=${encodeURIComponent(mother)}`);
  await expect(page.getByRole("rowheader").filter({ has: page.getByRole("link", { name: first }) })).toBeVisible();
  await expect(page.getByRole("rowheader").filter({ has: page.getByRole("link", { name: second }) })).toBeVisible();
  await expect(cell(page, shared, first)).toHaveAccessibleName(/: Pendente$/);
  await expect(motherCell(page, shared, first)).toHaveAccessibleName(/: Convidado$/);
  await expect(motherCell(page, shared, second)).toHaveAccessibleName(/: Convidado$/);
  // item só de responsável: célula do jovem cinza (sem botão), a da mãe sem registro
  await expect(cell(page, onlyRelative, first)).toHaveCount(0);
  await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: first }) })).toContainText("não se aplica a este tipo de pessoa");
  await expect(motherCell(page, onlyRelative, first)).toHaveAccessibleName(/: Sem registro$/);

  // marcar a situação da mãe sob um irmão aparece sob o outro
  await motherCell(page, shared, first).click();
  dialog = page.getByRole("dialog");
  await choose(page, dialog, "Situação", "OK");
  await dialog.getByRole("button", { name: "Salvar situação" }).click();
  await expect(page.getByText("Situação salva: OK.")).toBeVisible();
  await expect(motherCell(page, shared, first)).toHaveAccessibleName(/: OK$/);
  await expect(motherCell(page, shared, second)).toHaveAccessibleName(/: OK$/);

  // a busca por um irmão traz o bloco dele, com a mãe
  await page.goto(`/associados/controle?publico=jovens&q=${encodeURIComponent(second)}`);
  await expect(motherCell(page, shared, second)).toBeVisible();
  await expect(motherCell(page, shared, first)).toHaveCount(0);

  // pai que também é associado ativo: aparece no detalhe, com o link, mas não na matriz de Jovens
  await page.goto(firstUrl);
  await page.getByRole("button", { name: "Adicionar responsável" }).click();
  dialog = page.getByRole("dialog");
  await choose(page, dialog, "Parentesco", "Pai");
  await dialog.getByRole("combobox", { name: "Também é associado (opcional)" }).fill(father);
  await page.getByRole("option", { name: new RegExp(escape(father)) }).click();
  await expect(dialog.getByLabel("Nome")).toHaveValue(father);
  await dialog.getByRole("button", { name: "Adicionar responsável" }).click();
  await expect(page.getByText(`Responsável “${father}” adicionado.`)).toBeVisible();
  const fatherRow = relativesTable(page).getByRole("row").filter({ hasText: father });
  await expect(fatherRow).toContainText("Pai");
  await expect(fatherRow.getByRole("link", { name: "também é associado" })).toHaveAttribute("href", new URL(fatherUrl).pathname);
  const fatherCell = (item: string) => cell(page, item, `${father} (responsável de ${first})`);
  await page.goto(`/associados/controle?publico=jovens&q=${encodeURIComponent(first)}`);
  await expect(motherCell(page, shared, first)).toBeVisible();
  await expect(fatherCell(shared)).toHaveCount(0);

  // associado desligado: a linha do responsável volta, com as situações próprias (nenhuma: cadastrado como associado
  // ativo, não recebeu os valores iniciais de responsável)
  await page.goto(fatherUrl);
  await page.getByRole("button", { name: "Desligar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByText("Associado desligado.")).toBeVisible();
  await page.goto(`/associados/controle?publico=jovens&q=${encodeURIComponent(first)}`);
  await expect(fatherCell(shared)).toHaveAccessibleName(/: Sem registro$/);
});
