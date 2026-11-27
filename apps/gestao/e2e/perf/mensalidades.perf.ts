import { expect, test } from "@playwright/test";
import { psql } from "../support/db";
import { E2E_ADMIN_EMAIL } from "../support/env";
import { measureScrolling } from "./scroll-measure";

// Medição de rolagem da grade de Mensalidades (associados × março a dezembro), no padrão de lancamentos.perf.ts.
// Semeia PERF_ROWS associados "E2E Perf …" no grupo E2E (como o admin E2E, por associates_create) e os remove no
// fim (o cleanupE2eGroup também). Rola a grade de cima a baixo, na lista simples e agrupada por seção.

const ROWS = Number(process.env.PERF_ROWS ?? 240);
const lit = (value: string) => `'${value.replaceAll("'", "''")}'`;
const SCROLLER = '[data-slot="fees-scroller"]';
const group = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${lit(E2E_ADMIN_EMAIL)})`;

function seed() {
  const existing = Number(
    psql(`select count(*) from public.associates where group_id = ${group} and name like 'E2E Perf %'`),
  );
  if (existing >= ROWS) return;
  psql(`
    begin;
    select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true)
      from auth.users u where u.email = ${lit(E2E_ADMIN_EMAIL)};
    set local role authenticated;
    select public.associates_create(m.group_id, 'E2E Perf Associado ' || lpad(n::text, 4, '0'),
      (array['lobinho', 'escoteiro', 'senior', 'pioneiro'])[1 + n % 4]::public.scout_branch, null, null,
      null, null, date_trunc('year', current_date)::date, null)
    from generate_series(${existing + 1}, ${ROWS}) n
    cross join (select group_id from public.memberships limit 1) m;
    commit;
  `);
}

test.afterAll(() => {
  psql(`delete from public.associates where group_id = ${group} and name like 'E2E Perf %';`);
});

for (const grouped of [false, true]) {
  const name = grouped ? "mensalidades-agrupado" : "mensalidades";
  test(`rolagem: ${name}`, async ({ page }) => {
    test.setTimeout(180_000);
    seed();
    await page.goto("/financeiro/mensalidades/controle");
    await expect(page.locator(`${SCROLLER} tbody tr`).first()).toBeVisible();
    if (grouped) await page.getByRole("checkbox", { name: "Agrupar por seção" }).click();
    await page.waitForTimeout(500);
    await measureScrolling(page, { name, selector: SCROLLER, items: `${SCROLLER} tbody tr`, extra: { rows: ROWS } });
  });
}
