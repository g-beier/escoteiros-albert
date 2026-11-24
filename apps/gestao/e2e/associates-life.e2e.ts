import { expect, test } from "@playwright/test";
import { psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { chooseOption, uniqueName } from "./support/entries";

// Vida escoteira (004), como o administrador E2E (Diretoria de Métodos Educativos): o cadastro abre o período
// vigente, o perfil mostra a barra e a estrela a entregar, a linha do tempo recebe períodos e eventos, a entrega do
// certificado tira o aviso; visão do grupo e PDF. Nomes únicos; tudo apagado no fim direto no banco.
test.describe.configure({ mode: "serial" });

const person = uniqueName("Escoteiro Vida");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;
const PROMISE = "2022-03-01";
let id = "";

/** Anos completos desde a promessa (sem lacunas). */
function yearsSince(iso: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return Number(today.slice(0, 4)) - Number(iso.slice(0, 4)) - (today.slice(5) < iso.slice(5) ? 1 : 0);
}

test.beforeAll(() => {
  // Cadastro direto no banco: a entrada dispara o acompanhamento automático (período vigente desde a entrada).
  id = psql(`
    with a as (insert into public.associates(group_id, name, branch, promise_date, joined_on)
      values (${group}, ${literal(person)}, 'escoteiro', '${PROMISE}', '${PROMISE}') returning id, group_id)
    insert into public.associate_movements(group_id, associate_id, movement_date, kind, reason)
    select group_id, id, '${PROMISE}', 'entrada', 'Cadastro' from a returning associate_id;
  `);
});

test.afterAll(() => {
  psql(`delete from public.associate_movements where associate_id = ${literal(id)}; delete from public.associates where id = ${literal(id)};`);
});

test("perfil: barra, anos e estrela a entregar", async ({ page }) => {
  const years = yearsSince(PROMISE);
  await page.goto(`/associados/${id}`);
  const card = page.getByRole("region", { name: "Vida escoteira" });
  await expect(card.getByText(`${years} anos`).first()).toBeVisible();
  await expect(card.getByRole("img", { name: /Vida escoteira de 2022/ })).toBeVisible();
  await expect(card.getByRole("note", { name: "Estrela de atividade a entregar" })).toContainText(`${years}ª estrela de atividade`);
  await card.getByRole("link", { name: "Linha do tempo" }).click();
  await expect(page).toHaveURL(new RegExp(`/associados/${id}/vida-escoteira$`));
});

test("linha do tempo: período antigo, evento e entrega do certificado", async ({ page }) => {
  await page.goto(`/associados/${id}/vida-escoteira`);
  const timeline = page.getByRole("region", { name: "Linha do tempo" });
  await expect(timeline.getByRole("heading", { name: /^2022/ })).toBeVisible();
  await expect(timeline.getByText("Início da contagem do tempo de atividade.")).toBeVisible();

  // Período antes da promessa: aparece, mas não conta.
  await page.getByRole("button", { name: "Incluir período" }).click();
  const periodDialog = page.getByRole("dialog", { name: "Incluir período" });
  await chooseOption(page, "Ramo", "Lobinho", periodDialog);
  await periodDialog.getByLabel("Início").fill("2019-03-01");
  await periodDialog.getByLabel("Fim (opcional)").fill("2022-03-01");
  await periodDialog.getByRole("button", { name: "Incluir período" }).click();
  await expect(page.getByText("Período incluído.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Períodos" }).getByRole("row")).toHaveCount(3);
  await expect(timeline.getByRole("heading", { name: /^2019/ })).toBeVisible();
  await expect(page.getByText(`${yearsSince(PROMISE)} anos`).first()).toBeVisible();

  // Evento do histórico.
  await page.getByRole("button", { name: "Incluir evento" }).click();
  const eventDialog = page.getByRole("dialog", { name: "Incluir evento" });
  await eventDialog.getByLabel("Data").fill("2023-10-16");
  await eventDialog.getByLabel("Título").fill("Cruzeiro do Sul");
  await eventDialog.getByRole("button", { name: "Incluir evento" }).click();
  await expect(page.getByText("Evento incluído.")).toBeVisible();
  await expect(timeline.getByText("Cruzeiro do Sul")).toBeVisible();

  // Entrega: quita a estrela e as anteriores.
  const notice = page.getByRole("note", { name: "Estrela de atividade a entregar" });
  await notice.getByRole("button", { name: "Certificado entregue" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar entrega" }).click();
  await expect(page.getByText(/Certificado da \d+ª estrela entregue\./)).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Estrelas de atividade" }).getByText("entregue").first()).toBeVisible();
});

test("visão do grupo e relatório", async ({ page }) => {
  await page.goto("/associados/vida-escoteira");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Vida escoteira" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: person })).toBeVisible();
  const pdf = await page.request.get("/associados/relatorios/vida-escoteira");
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});
