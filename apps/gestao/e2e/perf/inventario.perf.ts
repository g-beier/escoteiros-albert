import { expect, test } from "@playwright/test";
import { psql } from "../support/db";
import { AS_ADMIN, E2E_GROUP, measureLoad, measureScroll, report } from "./measure";

// Medição das listas do Inventário (renderizadas no servidor): Materiais (todas as divisões, linhas de grupo) e
// Movimentações (últimas 200). Semeia PERF_MATERIALS materiais "E2E Janela …" em divisões "E2E Janela …" do grupo E2E,
// pelas funções auditadas, e apaga tudo no fim (só o que tem o prefixo). Resultado em test-results/perf-<rótulo>-*.json.
test.describe.configure({ mode: "serial" });

const MATERIALS = Number(process.env.PERF_MATERIALS ?? 600);
const PREFIX = "E2E Janela";
const materials = `(select id from public.inventory_materials where group_id = ${E2E_GROUP} and name like '${PREFIX} %')`;
const perfLocations = `(select id from public.inventory_locations where group_id = ${E2E_GROUP} and name like '${PREFIX} %')`;

function cleanup() {
  psql(`
    delete from public.inventory_movements where material_id in ${materials};
    delete from public.inventory_lots where material_id in ${materials};
    delete from public.inventory_units where material_id in ${materials};
    delete from public.inventory_counts where material_id in ${materials};
    delete from public.inventory_materials where id in ${materials};
    delete from public.inventory_locations where id in ${perfLocations} and parent_id is not null;
    delete from public.inventory_locations where id in ${perfLocations};
  `);
}

/** 4 divisões × 5 subdivisões; cada material num lote de uma subdivisão e, um a cada três, também na raiz. */
function seed() {
  cleanup();
  psql(`
    begin;
    ${AS_ADMIN}
    do $$
    declare gid uuid := (select group_id from public.memberships where user_id = auth.uid()); root uuid; subs uuid[] := '{}'; roots uuid[] := '{}'; mid uuid;
    begin
      for r in 1..4 loop
        root := public.inventory_save_location(gid, null, null, '${PREFIX} Local ' || r, null);
        roots := roots || root;
        for s in 1..5 loop
          subs := subs || public.inventory_save_location(gid, null, root, '${PREFIX} Prateleira ' || r || '.' || s, null);
        end loop;
      end loop;
      for n in 1..${MATERIALS} loop
        mid := public.inventory_save_material(gid, null, null, '${PREFIX} Material ' || lpad(n::text, 4, '0'), 'lot', n % 4 = 0, case when n % 7 = 0 then 50 end, 'Material de medição ' || n);
        perform public.inventory_add_lot(mid, subs[1 + n % 20], 1 + n % 40, (array['novo','bom','regular','ruim']::public.inventory_condition[])[1 + n % 4],
          (500 + n * 13)::bigint, case when n % 5 = 0 then current_date + (n % 400) end, current_date, 'compra', null, null, null);
        if n % 3 = 0 then
          perform public.inventory_add_lot(mid, roots[1 + n % 4], 2, 'bom', 900::bigint, null, current_date, 'doacao', null, null, null);
        end if;
      end loop;
    end $$;
    commit;
  `);
}

test.beforeAll(() => seed());
// PERF_KEEP=1 deixa os dados para medir de novo (o próximo seed apaga e recria).
test.afterAll(() => { if (!process.env.PERF_KEEP) cleanup(); });

test("inventário: materiais", async ({ page }) => {
  test.setTimeout(240_000);
  const url = `/inventario/materiais?q=${encodeURIComponent(PREFIX)}`;
  const load = await measureLoad(page, url, "table tbody tr");
  await expect(page.getByRole("link", { name: `${PREFIX} Material 0001`, exact: true })).toBeVisible();
  const scroll = await measureScroll(page, "table tbody tr");
  report("inventario-materiais", { materials: MATERIALS, load, ...scroll });
});

test("inventário: movimentações", async ({ page }) => {
  test.setTimeout(240_000);
  const load = await measureLoad(page, "/inventario/movimentacoes", "table tbody tr");
  const scroll = await measureScroll(page, "table tbody tr");
  report("inventario-movimentacoes", { load, ...scroll });
});
