import { expect, test } from "@playwright/test";

// Relatórios em PDF do Associados, como o administrador E2E: diálogo na lista de associados e os PDFs gerados pelo
// servidor (react-pdf).

test("relatórios: diálogo na lista e PDFs dos documentos", async ({ page }) => {
  await page.goto("/associados");
  await page.getByRole("button", { name: "Relatórios" }).click();
  const dialog = page.getByRole("dialog", { name: "Relatórios" });
  await expect(dialog.getByRole("link", { name: "Abrir Documento 10 - Lista simples de efetivo" })).toHaveAttribute(
    "href",
    "/associados/relatorios/doc-10",
  );
  await expect(dialog.getByRole("link", { name: "Baixar Documento 14a - Datas de promessa" })).toHaveAttribute(
    "href",
    "/associados/relatorios/doc-14a?baixar=1",
  );
  await expect(page).toHaveURL(/\/associados$/);

  const response = await page.request.get("/associados/relatorios/doc-10");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["content-disposition"]).toMatch(
    /^inline; filename="doc-10-lista-simples-de-efetivo-\d{4}-\d{2}-\d{2}\.pdf"$/,
  );
  expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");

  const download = await page.request.get("/associados/relatorios/doc-10?baixar=1");
  expect(download.headers()["content-disposition"]).toMatch(/^attachment;/);
  const doc13 = await page.request.get("/associados/relatorios/doc-13");
  expect(doc13.status()).toBe(200);
  expect((await doc13.body()).subarray(0, 4).toString()).toBe("%PDF");
  const doc14 = await page.request.get("/associados/relatorios/doc-14a");
  expect(doc14.status()).toBe(200);
  expect(doc14.headers()["content-disposition"]).toMatch(
    /filename="doc-14a-datas-de-promessa-\d{4}-\d{2}-\d{2}\.pdf"$/,
  );
  expect((await doc14.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect((await page.request.get("/associados/relatorios/nao-existe")).status()).toBe(404);
});
