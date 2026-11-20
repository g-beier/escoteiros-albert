import { expect, test } from "@playwright/test";
import { psql } from "../support/db";
import { AS_ADMIN, E2E_GROUP, measureLoad, measureScroll, report } from "./measure";

// Medição das telas de Associados: Controle de dados (matriz pessoa × item, jovens com os responsáveis abaixo) e a
// lista por ramo. Semeia PERF_PEOPLE jovens "E2E Janela …" (prefixo próprio: o cleanup dos e2e apaga associados "E2E Perf …") (dois responsáveis fictícios cada) e um quarto disso de
// adultos no grupo E2E, pelas funções auditadas; apaga tudo no fim (só o que tem o prefixo; PERF_KEEP=1 mantém).
// Resultado em test-results/perf-<rótulo>-*.json.
test.describe.configure({ mode: "serial" });

const PEOPLE = Number(process.env.PERF_PEOPLE ?? 150);
const PREFIX = "E2E Janela";
const people = `(select id from public.associates where group_id = ${E2E_GROUP} and name like '${PREFIX} %')`;
const relatives = `(select id from public.relatives where group_id = ${E2E_GROUP} and name like '${PREFIX} %')`;

function cleanup() {
  psql(`
    delete from public.control_statuses where associate_id in ${people} or relative_id in ${relatives};
    delete from public.relative_links where associate_id in ${people} or relative_id in ${relatives};
    delete from public.relatives where id in ${relatives};
    delete from public.associate_functions where associate_id in ${people};
    delete from public.associate_moves where associate_id in ${people};
    delete from public.associate_movements where associate_id in ${people};
    delete from public.associates where id in ${people};
  `);
}

function seed() {
  cleanup();
  psql(`
    begin;
    ${AS_ADMIN}
    do $$
    declare gid uuid := (select group_id from public.memberships where user_id = auth.uid()); aid uuid;
      branches public.scout_branch[] := array['lobinho', 'escoteiro', 'senior', 'pioneiro'];
    begin
      for n in 1..${PEOPLE} loop
        aid := public.associates_create(gid, '${PREFIX} Jovem ' || lpad(n::text, 4, '0'), branches[1 + n % 4], null, null,
          current_date - (3000 + n * 11), null, current_date - (n * 5), null);
        perform public.relatives_create(aid, '${PREFIX} Mãe ' || lpad(n::text, 4, '0'), 'mae', null, true, true, null);
        perform public.relatives_create(aid, '${PREFIX} Pai ' || lpad(n::text, 4, '0'), 'pai', null, true, false, null);
      end loop;
      for n in 1..${Math.ceil(PEOPLE / 4)} loop
        aid := public.associates_create(gid, '${PREFIX} Adulto ' || lpad(n::text, 4, '0'), 'adulto', null, null,
          current_date - (9000 + n * 30), null, current_date - (n * 20), null);
        if n % 2 = 0 then perform public.associates_add_function(aid, 'escotista', null, current_date - 100); end if;
      end loop;
    end $$;
    commit;
  `);
}

test.beforeAll(() => seed());
test.afterAll(() => { if (!process.env.PERF_KEEP) cleanup(); });

test("associados: controle (jovens)", async ({ page }) => {
  test.setTimeout(900_000);
  const url = `/associados/controle?publico=jovens&q=${encodeURIComponent(PREFIX)}`;
  const load = await measureLoad(page, url, '[data-testid="control-matrix-scroll"] tbody tr');
  await expect(page.getByRole("link", { name: `${PREFIX} Jovem 0001`, exact: true })).toBeVisible();
  const scroll = await measureScroll(page, '[data-testid="control-matrix-scroll"] tbody tr');
  const cells = await page.locator('[data-testid="control-matrix-scroll"] tbody td').count();
  report("associados-controle", { people: PEOPLE, cells, load, ...scroll });
});

test("associados: lista", async ({ page }) => {
  test.setTimeout(900_000);
  const load = await measureLoad(page, `/associados?q=${encodeURIComponent(PREFIX)}`, "table tbody tr");
  const scroll = await measureScroll(page, "table tbody tr");
  report("associados-lista", { people: PEOPLE, load, ...scroll });
});
