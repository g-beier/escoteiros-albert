import { expect, test, type Page } from "@playwright/test";
import { psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";

// Associados (040) no Gestão, como o administrador E2E (secretaria): seções e equipe, cadastro, passagem,
// desligamento e reingresso (a importação por CSV está em import.e2e.ts). Nomes únicos; tudo apagado no fim direto no banco.
test.describe.configure({ mode: "serial" });

const troop = uniqueName("Tropa");
const patrol = uniqueName("Patrulha");
const senior = uniqueName("Tropa Sênior");
const person = uniqueName("Associado");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;

test.afterAll(() => {
  const people = `(select id from public.associates where group_id = ${group} and name = ${literal(person)})`;
  psql(`
    delete from public.associate_moves where associate_id in ${people};
    delete from public.associate_movements where associate_id in ${people};
    delete from public.associates where id in ${people};
    delete from public.patrols where group_id = ${group} and name = ${literal(patrol)};
    delete from public.sections where group_id = ${group} and name in (${literal(troop)}, ${literal(senior)});
  `);
});

async function addSection(page: Page, branch: string, name: string) {
  await chooseOption(page, "Ramo", branch);
  await page.getByLabel("Nova seção").fill(name);
  await page.getByRole("button", { name: "Adicionar seção" }).click();
  await expect(page.getByText(`Seção “${name}” cadastrada.`)).toBeVisible();
}

test("secretaria: cadastrar, passagem, desligar e reingressar", async ({ page }) => {
  await page.goto("/associados/configuracoes");
  await expect(page).toHaveURL(/\/associados\/configuracoes\/secoes$/);
  await expect(page.locator("html")).toHaveAttribute("data-app", "associados");
  await addSection(page, "Escoteiro", troop);
  await addSection(page, "Sênior", senior);
  await page.getByLabel(`Nova equipe em ${troop}`).fill(patrol);
  await page.getByRole("row").filter({ has: page.getByLabel(`Nova equipe em ${troop}`) }).getByRole("button", { name: "Equipe" }).click();
  await expect(page.getByText(`Equipe “${patrol}” cadastrada.`)).toBeVisible();

  // cadastro só com o ramo (seção e equipe vêm depois, pela edição), com nascimento e entrada
  await page.goto("/associados/novo");
  await page.getByLabel("Nome").fill(person);
  await chooseOption(page, "Ramo, seção e equipe", "Escoteiro");
  await page.getByLabel("Nascimento").fill("2012-05-20");
  await page.getByLabel("Entrada no grupo").fill("2020-03-01");
  await page.getByRole("button", { name: "Cadastrar associado" }).click();
  await expect(page).toHaveURL(/\/associados\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: person })).toBeVisible();
  await expect(page.getByText("20/05/2012")).toBeVisible();
  await expect(page.getByText(/\(\d+ anos\)/)).toBeVisible();
  const periods = page.getByRole("table", { name: "Períodos de atividade do associado" });
  await expect(periods).toContainText("01/03/2020");
  await expect(periods).toContainText("em atividade");

  // cadastro novo começa com registro provisório; na edição, registro definitivo, apelido e a equipe (correção, sem passagem)
  const registro = page.locator("dt", { hasText: "Registro" }).locator("xpath=following-sibling::dd[1]");
  await expect(registro).toHaveText("Provisório");
  const detail = page.url();
  await page.getByRole("link", { name: "Editar" }).click();
  await chooseOption(page, "Ramo, seção e equipe", patrol);
  await page.getByRole("radio", { name: /Definitivo/ }).click();
  await page.getByLabel("Apelido (opcional)").fill("Teste");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(detail);
  await expect(registro).toHaveText("Definitivo");
  await expect(page.locator("dt", { hasText: "Apelido" }).locator("xpath=following-sibling::dd[1]")).toHaveText("Teste");
  await expect(page.getByText(troop)).toBeVisible();
  await expect(page.getByText("Nenhuma passagem registrada.")).toBeVisible();

  // na lista: aba do ramo, só por ramo (seção e equipe como texto pequeno na linha)
  await page.goto("/associados?ramo=escoteiro");
  await expect(page.getByRole("navigation", { name: "Ramos" }).getByRole("link", { name: "Escoteiro" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: person }) })).toContainText(`${troop} › ${patrol}`);
  await expect(page.getByRole("cell", { name: new RegExp(`^${troop}`) })).toHaveCount(0);
  await page.getByRole("link", { name: person }).click();

  // passagem (cerimônia) só para o ramo seguinte: o Sênior, com a seção dele
  await page.getByRole("button", { name: "Passagem" }).click();
  const move = page.getByRole("dialog");
  await move.getByLabel("Para", { exact: true }).click();
  await expect(page.getByRole("option", { name: troop, exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: senior, exact: true }).click();
  await move.getByRole("button", { name: "Registrar passagem" }).click();
  await expect(page.getByText("Passagem registrada.")).toBeVisible();
  const moves = page.getByRole("table", { name: "Passagens do associado" });
  await expect(moves).toContainText(`Escoteiro › ${troop}`);
  await expect(moves).toContainText(`Sênior › ${senior}`);

  // desligar: sai dos ativos e aparece em desligados
  await page.getByRole("button", { name: "Desligar" }).click();
  const leave = page.getByRole("dialog");
  await leave.getByLabel("Motivo (opcional)").fill("Mudou de cidade");
  await leave.getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByText("Associado desligado.")).toBeVisible();
  await expect(page.getByText(/^Desligado em \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  await expect(periods).toContainText("Mudou de cidade");
  await page.goto(`/associados?q=${encodeURIComponent(person)}`);
  await expect(page.getByRole("link", { name: person })).toHaveCount(0);
  await page.goto(`/associados?situacao=desligados&q=${encodeURIComponent(person)}`);
  await page.getByRole("link", { name: person }).click();

  // reingressar: novo período, ativo de novo
  await page.getByRole("button", { name: "Reingressar" }).click();
  const rejoin = page.getByRole("dialog");
  await rejoin.getByRole("button", { name: "Reingressar" }).click();
  await expect(page.getByText("Reingresso registrado.")).toBeVisible();
  await expect(periods.getByRole("row")).toHaveCount(3); // cabeçalho + 2 períodos
  await expect(page.getByRole("button", { name: "Desligar" })).toBeVisible();
});
