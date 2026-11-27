import { expect, test, type Page } from "@playwright/test";
import { psql } from "../support/db";
import { E2E_ACCOUNTS, E2E_ADMIN_EMAIL } from "../support/env";
import { measureScrolling } from "./scroll-measure";

// Medição de rolagem das listas longas (não roda com os e2e: `npx playwright test -c playwright.perf.config.ts`).
// Semeia PERF_ROWS lançamentos "E2E Perf …" no grupo E2E (o cleanup dos e2e apaga), carrega todas as páginas da
// lista e rola de cima a baixo com a CPU desacelerada (e2e/perf/scroll-measure.ts): a tabela do desktop (rola no próprio
// contêiner) e os cartões do celular (390×844, rola a janela). Resultado em test-results/perf-<rótulo>-<caso>.json.

const ROWS = Number(process.env.PERF_ROWS ?? 240);
const lit = (value: string) => `'${value.replaceAll("'", "''")}'`;
const SCROLLER = '[data-slot="entries-scroller"]';
const CARDS = `${SCROLLER} ul[aria-label$="por cartão"] > li`;

function seed() {
  const existing = Number(psql(`select count(*) from public.ledger_entries where name like 'E2E Perf %'`));
  if (existing >= ROWS) return;
  psql(`
    begin;
    select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true)
      from auth.users u where u.email = ${lit(E2E_ADMIN_EMAIL)};
    set local role authenticated;
    select public.create_ledger_entry(
      m.group_id, current_date - (n % 300), 'E2E Perf ' || lpad(n::text, 4, '0'), pm.id, null, n % 3 = 0, -(1000 + n)::bigint,
      jsonb_build_array(jsonb_build_object('category_id', c.id, 'amount_cents', -(1000 + n), 'description', 'perf ' || n, 'associate_id', null)),
      a.id, null)
    from generate_series(${existing + 1}, ${ROWS}) n
    cross join (select group_id from public.memberships limit 1) m
    cross join lateral (select id from public.payment_methods where group_id = m.group_id and active order by name limit 1) pm
    cross join lateral (select id from public.categories where group_id = m.group_id and name = 'Telefone' limit 1) c
    cross join lateral (select id from public.accounts where group_id = m.group_id and name = ${lit(E2E_ACCOUNTS[0])}) a;
    commit;
  `);
}

/** Rola até o fim (contêiner no desktop, janela no celular) enquanto a rolagem infinita traz páginas novas. */
async function loadAll(page: Page, window: boolean) {
  for (let i = 0; i < 20; i++) {
    if (await page.getByText("Fim da lista").isVisible()) break;
    await page.evaluate(
      ({ window, selector }) => {
        const el = window ? document.scrollingElement! : document.querySelector(selector)!;
        el.scrollTop = el.scrollHeight;
      },
      { window, selector: SCROLLER },
    );
    await page.waitForTimeout(800);
  }
  await page.evaluate((selector) => {
    document.scrollingElement!.scrollTop = 0;
    document.querySelector(selector)!.scrollTop = 0;
  }, SCROLLER);
  await page.waitForTimeout(300);
}

for (const view of ["movimentacoes", "detalhamento"] as const) {
  test(`rolagem: ${view}`, async ({ page }) => {
    test.setTimeout(180_000);
    seed();
    await page.goto(`/financeiro/lancamentos/${view}?de=tudo&q=E2E%20Perf`);
    await expect(page.locator(`${SCROLLER} tbody tr`).first()).toBeVisible();
    await loadAll(page, false);
    await measureScrolling(page, {
      name: view,
      selector: SCROLLER,
      items: `${SCROLLER} tbody tr`,
      extra: { rows: ROWS },
    });
  });
}

test.describe("cartões (celular)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const view of ["movimentacoes", "detalhamento"] as const) {
    test(`rolagem: ${view} em cartões`, async ({ page }) => {
      test.setTimeout(180_000);
      seed();
      await page.goto(`/financeiro/lancamentos/${view}?de=tudo&q=E2E%20Perf`);
      await expect(page.locator(CARDS).first()).toBeVisible();
      await loadAll(page, true);
      await measureScrolling(page, { name: `${view}-cartoes`, selector: null, items: CARDS, extra: { rows: ROWS } });
    });
  }
});
