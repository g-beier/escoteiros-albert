import { expect, test } from "@playwright/test";

// Rotas do Gestão (docs/consolidacao-gestao.md): módulo no 1º segmento, endereços antigos redirecionam e URL
// sem rota mostra o 404 global (vários layouts raiz).

test("endereços antigos do financeiro redirecionam com a query", async ({ page }) => {
  await page.goto("/lancamentos/movimentacoes?q=antigo");
  await expect(page).toHaveURL(/\/financeiro\/lancamentos\/movimentacoes\?q=antigo$/);
  await page.goto("/configuracoes/contas");
  await expect(page).toHaveURL(/\/financeiro\/configuracoes\/contas$/);
  await page.goto("/mensalidades");
  await expect(page).toHaveURL(/\/financeiro\/mensalidades\/controle$/);
});

test("raiz de cada módulo é o resumo dele e cada layout marca o módulo", async ({ page }) => {
  await page.goto("/financeiro");
  await expect(page.getByRole("heading", { name: /^Resumo de \d{4}$/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Resumo" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("html")).toHaveAttribute("data-app", "financeiro");
  await page.goto("/inventario");
  await expect(page.getByRole("heading", { name: "Estado dos Materiais" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("html")).toHaveAttribute("data-app", "inventario");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app", "gestao");
});

test("URL sem rota mostra o 404 global", async ({ page }) => {
  const response = await page.goto("/nao-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao Início" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
});
