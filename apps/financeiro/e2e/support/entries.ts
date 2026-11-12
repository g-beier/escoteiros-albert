import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_PREFIX } from "./env";

/** Histórico único por teste/execução: "E2E <rótulo> <sufixo>". */
export const uniqueName = (label: string) => `${E2E_PREFIX} ${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Escolhe uma opção num select (Base UI) pelo rótulo do campo. */
export async function chooseOption(page: Page, label: string | RegExp, option: string | RegExp, scope: Page | Locator = page) {
  await scope.getByLabel(label, { exact: typeof label === "string" }).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

export type NewEntry = { name: string; direction: "entrada" | "saida"; total: string; account: string; category: string; description: string; date?: string };

/** Preenche e salva /lancamentos/novo; termina de volta na lista. */
export async function createEntry(page: Page, entry: NewEntry) {
  await page.goto("/lancamentos/novo");
  await page.getByRole("radio", { name: entry.direction === "entrada" ? "Entrada (receita)" : "Saída (despesa)" }).click();
  if (entry.date) await page.getByLabel("Data", { exact: true }).fill(entry.date);
  await page.getByLabel("Histórico").fill(entry.name);
  await page.getByLabel(/^Valor total/).fill(entry.total);
  await chooseOption(page, "Forma de pagamento", "PIX");
  await chooseOption(page, "Conta", entry.account);
  const split = page.getByRole("group", { name: "Rubrica 1" });
  await split.getByRole("combobox", { name: "Rubrica" }).fill(entry.category);
  await page.getByRole("option", { name: entry.category }).first().click();
  await split.getByLabel("Descrição").fill(entry.description);
  await split.getByLabel(/^Valor \(R\$\)/).fill(entry.total);
  await expect(page.getByText("✓ Valores conferem")).toBeVisible();
  await page.getByRole("button", { name: "Salvar lançamento" }).click();
  await expect(page.getByText("Lançamento salvo.")).toBeVisible();
  await expect(page).toHaveURL(/\/lancamentos\/movimentacoes(\?|$)/);
}

/** Lista de lançamentos (desktop: tabela). */
export const entriesTable = (page: Page) => page.getByRole("region", { name: "Movimentações" }).getByRole("table");
export const entryRow = (page: Page, name: string) => entriesTable(page).getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });

/** Busca pelo campo de busca dos filtros e espera a URL refletir o termo. */
export async function search(page: Page, term: string) {
  await page.getByRole("searchbox", { name: "Buscar por histórico, descrição ou ID OFX" }).fill(term);
  await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(term).replace(/%20/g, "(\\+|%20)")}`));
}

/** Barra de filtros da lista. */
export const filters = (page: Page) => page.getByRole("region", { name: "Filtros" });
