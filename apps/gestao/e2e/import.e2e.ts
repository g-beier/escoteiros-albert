import { expect, test } from "@playwright/test";
import { psql } from "./support/db";
import { E2E_ADMIN_EMAIL } from "./support/env";
import { uniqueName } from "./support/entries";

// Importação por CSV (/importar, docs/importacao.md) como o administrador E2E: seções e pessoas num envio só,
// pré-visualização com erro por linha, gravação e reenvio sem duplicar. Nomes únicos; tudo apagado no fim.
test.describe.configure({ mode: "serial" });

const troop = uniqueName("Tropa Importada");
const patrol = uniqueName("Patrulha Importada");
const names = [uniqueName("Importado um"), uniqueName("Importado dois"), uniqueName("Importada chefe")];
const item = uniqueName("Item importado");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)})`;

test.afterAll(() => {
  const people = `(select id from public.associates where group_id = ${group} and name in (${names.map(literal).join(", ")}))`;
  const relatives = `(select relative_id from public.relative_links where associate_id in ${people})`;
  psql(`
    delete from public.control_statuses where relative_id in ${relatives};
    delete from public.relatives where id in ${relatives};
    delete from public.associate_functions where associate_id in ${people};
    delete from public.control_statuses where associate_id in ${people};
    delete from public.associate_life_periods where associate_id in ${people};
    delete from public.associate_movements where associate_id in ${people};
    delete from public.associates where id in ${people};
    delete from public.patrols where group_id = ${group} and name = ${literal(patrol)};
    delete from public.sections where group_id = ${group} and name = ${literal(troop)};
    delete from public.control_statuses where item_id in (select id from public.control_items where group_id = ${group} and name = ${literal(item)});
    delete from public.control_item_audiences where item_id in (select id from public.control_items where group_id = ${group} and name = ${literal(item)});
    delete from public.control_items where group_id = ${group} and name = ${literal(item)};
  `);
});

const files = () => [
  { name: "secoes.csv", mimeType: "text/csv", buffer: Buffer.from(`ramo;seção;patrulha\r\nescoteiro;${troop};${patrol}\r\n`, "utf8") },
  {
    name: "pessoas.csv", mimeType: "text/csv", buffer: Buffer.from([
      "nome;nascimento;ramo;seção;patrulha;entrada;situação;desligado em",
      `${names[0]};14/05/2013;escoteiro;${troop};${patrol};10/03/2022;;`,
      `${names[1]};02/09/2012;escoteiro;${troop};;05/02/2021;desligado;20/12/2025`,
      "Sem Ramo E2E;;astronauta;;;;;",
    ].join("\r\n"), "utf8"),
  },
];

test("importar seções e pessoas com conferência; reenviar não duplica; endereços antigos redirecionam", async ({ page }) => {
  await page.goto("/financeiro/configuracoes/associados");
  await expect(page).toHaveURL(/\/associados$/);
  await page.goto("/associados/configuracoes/importar");
  await expect(page).toHaveURL(/\/importar$/);

  await page.getByLabel("Arquivos CSV").setInputFiles(files());
  const pessoas = page.locator("section").filter({ has: page.getByRole("heading", { name: /^pessoas\.csv/ }) });
  await expect(pessoas).toContainText("2 novas");
  await expect(pessoas).toContainText("1 com erro");
  await expect(pessoas.getByRole("row").filter({ hasText: "Sem Ramo E2E" })).toContainText("não é um valor aceito");
  await expect(page.getByText(`Nova seção "${troop}" (escoteiro)`)).toBeVisible();
  await page.getByRole("button", { name: "Importar 3 linhas" }).click();
  await expect(page.getByText(/^Importado\. /)).toBeVisible();

  await page.goto(`/associados?situacao=todos&q=${encodeURIComponent("Importado")}`);
  await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: names[0]! }) })).not.toContainText("Desligado");
  await expect(page.getByRole("row").filter({ has: page.getByRole("link", { name: names[1]! }) })).toContainText("Desligado");

  // reenviar o mesmo envio: tudo igual, nada a gravar
  await page.goto("/importar");
  await page.getByLabel("Arquivos CSV").setInputFiles(files());
  await expect(pessoas).toContainText("2 iguais");
  await expect(page.getByRole("button", { name: "Nada a importar" })).toBeDisabled();
});

test("importar funções e responsáveis de pessoas do mesmo envio", async ({ page }) => {
  await page.goto("/importar");
  await page.getByLabel("Arquivos CSV").setInputFiles([
    { name: "pessoas.csv", mimeType: "text/csv", buffer: Buffer.from(`nome;nascimento;ramo\r\n${names[2]};21/11/1985;adulto\r\n`, "utf8") },
    { name: "funcoes.csv", mimeType: "text/csv", buffer: Buffer.from(`pessoa;tipo;cargo;seção;início\r\n${names[2]};escotista;Assistente;${troop};01/03/2019\r\n`, "utf8") },
    { name: "responsaveis.csv", mimeType: "text/csv", buffer: Buffer.from(`jovem;nascimento do jovem;responsável;parentesco;descrição do parentesco;legal;associado\r\n${names[0]};14/05/2013;${names[2]};outro;tia;sim;${names[2]}\r\n`, "utf8") },
  ]);
  await page.getByRole("button", { name: "Importar 3 linhas" }).click();
  await expect(page.getByText(/^Importado\. /)).toBeVisible();

  await page.goto(`/associados?situacao=todos&q=${encodeURIComponent(names[0]!)}`);
  await page.getByRole("link", { name: names[0]! }).click();
  await expect(page.getByText(names[2]!).first()).toBeVisible();
});

test("importar item de controle e situações (Doc 22)", async ({ page }) => {
  const files = () => [
    { name: "itens-controle.csv", mimeType: "text/csv", buffer: Buffer.from(`item;diretoria;tipo;jovem;responsável\r\n${item};comunicação;canal;não;convidado\r\n`, "utf8") },
    { name: "controle.csv", mimeType: "text/csv", buffer: Buffer.from(`público;pessoa;jovem;nascimento do jovem;${item}\r\nresponsável;${names[2]};${names[0]};14/05/2013;OK - entrou no grupo\r\n`, "utf8") },
  ];
  await page.goto("/importar");
  await page.getByLabel("Arquivos CSV").setInputFiles(files());
  const controle = page.locator("section").filter({ has: page.getByRole("heading", { name: /^controle\.csv/ }) });
  await expect(controle).toContainText("1 atualiza");
  await page.getByRole("button", { name: "Importar 2 linhas" }).click();
  await expect(page.getByText(/^Importado\. /)).toBeVisible();
  await page.getByLabel("Arquivos CSV").setInputFiles(files());
  await expect(page.getByRole("button", { name: "Nada a importar" })).toBeDisabled();
});
