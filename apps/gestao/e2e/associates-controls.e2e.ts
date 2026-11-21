import { expect, test, type Page } from "@playwright/test";
import { psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";

// Controle de dados (041) no Associados, como o administrador E2E: item de controle novo, situação na matriz única
// (abas Jovens | Adultos, diretorias ocultáveis), desligamento abrindo "a remover", função de escotista separando o
// adulto na lista e o layout da matriz (só a área dos itens rola de lado). Tudo apagado no fim.
test.describe.configure({ mode: "serial" });

const item = uniqueName("Canal");
const youth = uniqueName("Jovem controle");
const adult = uniqueName("Adulto controle");
const troop = uniqueName("Tropa função");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;

test.beforeAll(() => {
  psql(`insert into public.sections(group_id, branch, name) values (${group}, 'escoteiro', ${literal(troop)});`);
});

test.afterAll(() => {
  const people = `(select id from public.associates where group_id = ${group} and name in (${[youth, adult].map(literal).join(", ")}))`;
  psql(`
    delete from public.control_statuses where associate_id in ${people};
    delete from public.associate_functions where associate_id in ${people};
    delete from public.associate_moves where associate_id in ${people};
    delete from public.associate_movements where associate_id in ${people};
    delete from public.associates where id in ${people};
    delete from public.control_items where group_id = ${group} and name = ${literal(item)};
    delete from public.sections where group_id = ${group} and name = ${literal(troop)};
  `);
});

async function createAssociate(page: Page, name: string, branch: string) {
  await page.goto("/associados/novo");
  await page.getByLabel("Nome").fill(name);
  await chooseOption(page, "Ramo, seção e equipe", branch);
  await page.getByRole("button", { name: "Cadastrar associado" }).click();
  await expect(page).toHaveURL(/\/associados\/[0-9a-f-]{36}$/);
}

const matrixCell = (page: Page, person: string) => page.getByRole("button", { name: new RegExp(`^Editar ${item}, ${person}: `) });

const matrixUrl = (publico: string, person: string, extra = "") => `/associados/controle?publico=${publico}&q=${encodeURIComponent(person)}${extra}`;

/** A página não rola de lado; a área dos itens rola e o nome fica parado. */
async function expectMatrixLayout(page: Page, person: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const scroller = page.getByTestId("control-matrix-scroll");
  const name = page.getByRole("rowheader").filter({ has: page.getByRole("link", { name: person }) });
  const before = await name.boundingBox();
  await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  const after = await name.boundingBox();
  expect(Math.round(after!.x)).toBe(Math.round(before!.x));
  expect(after!.width).toBeLessThanOrEqual(12 * 16);
}

test("item de controle, situação na matriz e desligamento com a remover", async ({ page }) => {
  // novo item na Comunicação, para jovem (valor inicial pendente) e adulto (sem registro), removido no desligamento
  await page.goto("/associados/configuracoes/itens");
  await page.getByRole("button", { name: "Novo item" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Nome").fill(item);
  await chooseOption(page, "Diretoria", "Comunicação", form);
  await chooseOption(page, "Tipo", "Canal", form);
  await form.getByRole("checkbox", { name: "Jovem" }).click();
  await form.getByRole("checkbox", { name: "Adulto" }).click();
  await chooseOption(page, "Valor inicial: Adulto", "Sem registro", form);
  await form.getByRole("checkbox", { name: /^Remover no desligamento/ }).click();
  await form.getByRole("button", { name: "Criar item" }).click();
  await expect(page.getByText(`Item “${item}” criado.`)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: item })).toContainText("Jovem: Pend. · Adulto: —");

  // jovem novo: começa com o valor inicial (pendente) na matriz única; marcar ok
  await createAssociate(page, youth, "Lobinho");
  await page.goto(matrixUrl("jovens", youth));
  await expect(page.getByRole("navigation", { name: "Público" }).getByRole("link", { name: "Jovens" })).toHaveAttribute("aria-current", "page");
  for (const directorate of ["Métodos Educativos", "Administrativa", "Comunicação"]) {
    await expect(page.getByRole("columnheader", { name: directorate, exact: true })).toBeVisible();
  }
  await expect(matrixCell(page, youth)).toHaveAccessibleName(new RegExp(`${youth}: Pendente$`));
  await matrixCell(page, youth).click();
  const dialog = page.getByRole("dialog");
  await chooseOption(page, "Situação", "OK", dialog);
  await dialog.getByLabel("Observação (opcional)").fill("grupo da seção");
  await dialog.getByRole("button", { name: "Salvar situação" }).click();
  await expect(page.getByText("Situação salva: OK.")).toBeVisible();
  await expect(matrixCell(page, youth)).toHaveAccessibleName(new RegExp(`${youth}: OK$`));
  await expect(page.getByRole("checkbox", { name: "Só pendências" })).toBeVisible();

  // ocultar a Comunicação esconde as colunas dela e fica na URL, mantendo a busca
  const hide = page.getByRole("group", { name: "Ocultar diretoria" });
  await hide.getByRole("button", { name: "Comunicação" }).click();
  await expect(page).toHaveURL(/ocultar=comunicacao/);
  await expect(page).toHaveURL(/q=/);
  await expect(matrixCell(page, youth)).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Comunicação", exact: true })).toHaveCount(0);
  await expect(hide.getByRole("button", { name: "Comunicação" })).toHaveAttribute("aria-pressed", "true");
  // a aba Adultos mantém o ocultar
  await expect(page.getByRole("navigation", { name: "Público" }).getByRole("link", { name: "Adultos" })).toHaveAttribute("href", /ocultar=comunicacao/);
  await hide.getByRole("button", { name: "Comunicação" }).click();
  await expect(page).not.toHaveURL(/ocultar=/);
  await expect(matrixCell(page, youth)).toBeVisible();

  // no detalhe: a situação aparece no Controle de dados
  await page.getByRole("link", { name: youth }).click();
  await expect(page.getByRole("table", { name: "Controle de dados do associado" }).getByRole("row").filter({ hasText: item })).toContainText("grupo da seção");

  // desligar: o item vira "a remover", visível com "Incluir desligados"
  await page.getByRole("button", { name: "Desligar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByText("Associado desligado.")).toBeVisible();
  await page.goto(matrixUrl("jovens", youth));
  await expect(matrixCell(page, youth)).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Incluir desligados" }).click();
  await expect(matrixCell(page, youth)).toHaveAccessibleName(new RegExp(`${youth}: A remover$`));
  await page.getByRole("checkbox", { name: "Só pendências" }).click();
  await expect(matrixCell(page, youth)).toBeVisible();
});

test("adulto: na matriz de Adultos com ou sem função; a função o leva para Escotistas na lista", async ({ page }) => {
  await createAssociate(page, adult, "Adulto");
  const detail = page.url();

  // sem função, o adulto já está no público Adultos; a rota antiga redireciona mantendo a busca
  await page.goto(`/associados/controle/comunicacao?publico=escotista&q=${encodeURIComponent(adult)}`);
  await expect(page).toHaveURL(/\/associados\/controle\?.*publico=adultos/);
  await expect(page.getByRole("navigation", { name: "Público" }).getByRole("link", { name: "Adultos" })).toHaveAttribute("aria-current", "page");
  await expect(matrixCell(page, adult)).toHaveAccessibleName(new RegExp(`${adult}: Sem registro$`));
  await expect(page.getByRole("rowheader").filter({ hasText: adult })).toContainText("Sem função");

  const groupOf = async () => {
    await page.goto(`/associados?ramo=adulto&q=${encodeURIComponent(adult)}`);
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: adult }) });
    await expect(row).toHaveCount(1);
    return row.locator("xpath=preceding-sibling::tr[td[@colspan]][1]");
  };
  await expect(await groupOf()).toContainText("Sem função");

  await page.goto(detail);
  await page.getByRole("button", { name: "Adicionar função" }).click();
  const dialog = page.getByRole("dialog");
  // escotista exige a seção; o erro não apaga o que foi digitado (ActionForm)
  await dialog.getByLabel("Cargo (opcional)").fill("Assistente");
  await dialog.getByRole("button", { name: "Adicionar função" }).click();
  await expect(page.getByText("Escolha a seção do escotista.")).toBeVisible();
  await expect(dialog.getByLabel("Cargo (opcional)")).toHaveValue("Assistente");
  await chooseOption(page, "Seção", new RegExp(`^${troop}`), dialog);
  await dialog.getByRole("button", { name: "Adicionar função" }).click();
  await expect(page.getByText("Função adicionada.")).toBeVisible();
  const functionsTable = page.getByRole("table", { name: "Funções do associado" });
  await expect(functionsTable).toContainText("Escotista: Assistente");
  await expect(functionsTable).toContainText(troop);

  // a função é editável
  await page.getByRole("button", { name: "Editar Escotista: Assistente" }).click();
  await page.getByRole("dialog").getByLabel("Cargo (opcional)").fill("Assistente de seção");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar função" }).click();
  await expect(page.getByText("Função salva.")).toBeVisible();
  await expect(functionsTable).toContainText("Escotista: Assistente de seção");

  // na lista, entre os escotistas, com a seção; e contado na seção
  await expect(await groupOf()).toContainText("Escotistas");
  await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: adult }) })).toContainText(troop);
  await page.goto("/associados/configuracoes/secoes");
  const troopRow = page.getByRole("row").filter({ has: page.getByRole("textbox", { name: `Nome da seção ${troop}` }) });
  await expect(troopRow.getByRole("cell").nth(1)).toHaveText("0"); // jovens
  await expect(troopRow.getByRole("cell").nth(2)).toHaveText("1"); // escotistas

  // a função aparece abaixo do nome na matriz; o item continua se aplicando
  await page.goto(matrixUrl("adultos", adult));
  await expect(page.getByRole("rowheader").filter({ hasText: adult })).toContainText(`Escotista (${troop})`);
  await expect(matrixCell(page, adult)).toHaveAccessibleName(new RegExp(`${adult}: Sem registro$`));

  // itens que mostram um valor (Doc 22): o ano e a data curta aparecem na célula, situação ok pelo valor
  const valueCell = (name: string) => page.getByRole("button", { name: new RegExp(`^Editar ${name}, ${adult}: `) });
  const year = String(new Date().getFullYear());
  await valueCell("Ano-base do registro").click();
  const dialog2 = page.getByRole("dialog");
  await dialog2.getByLabel("Ano", { exact: true }).fill(year);
  await dialog2.getByRole("button", { name: "Salvar situação" }).click();
  await expect(valueCell("Ano-base do registro")).toContainText(year);
  await expect(valueCell("Ano-base do registro")).toHaveAccessibleName(new RegExp(`: ${year} \\(OK\\)$`));
  await valueCell("Validade do registro").click();
  await dialog2.getByLabel("Data", { exact: true }).fill("2099-03-31");
  await dialog2.getByRole("button", { name: "Salvar situação" }).click();
  await expect(valueCell("Validade do registro")).toContainText("31/03/99");
  await expect(valueCell("Validade do registro")).toHaveAccessibleName(/: 31\/03\/99 \(OK\)$/);

  // na tabela de funções, só "Editar"; encerrar e apagar ficam no diálogo de edição
  await page.goto(detail);
  const fnRow = page.getByRole("table", { name: "Funções do associado" }).getByRole("row").filter({ hasText: "Assistente de seção" });
  await expect(fnRow.getByRole("button")).toHaveCount(1);
  await fnRow.getByRole("button", { name: "Editar Escotista: Assistente de seção" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Encerrar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Encerrar função" }).click();
  await expect(page.getByText("Função encerrada.")).toBeVisible();
  await expect(fnRow).not.toContainText("em exercício");
});

for (const width of [1280, 390]) {
  test(`matriz a ${width} px: nome fixo e sem rolagem lateral da página`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(matrixUrl("adultos", adult));
    await expect(matrixCell(page, adult)).toBeVisible();
    await expectMatrixLayout(page, adult);
  });
}
