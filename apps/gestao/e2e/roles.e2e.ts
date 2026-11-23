import { expect, test } from "@playwright/test";
import { deleteUsers, ensureUser, literal, psql } from "./support/db";
import { E2E_ACCOUNTS, E2E_ADMIN_EMAIL, E2E_PREFIX } from "./support/env";
import { createEntry, entryRow, uniqueName } from "./support/entries";
import { pageAs } from "./support/members";

// Chefe (002, 003): sem acesso ao Financeiro nem ao Associados, Colaborador no Inventário, ligado a um associado adulto escotista
// de uma seção. Vê no Início só os jovens dessa seção, sem link para o cadastro, e os módulos sem acesso somem e
// devolvem para o Início. Nomes fictícios; tudo é apagado no fim.
const stamp = Date.now().toString(36);
const chief = `e2e.chefe.${stamp}@example.org`;
const contributor = `e2e.colaborador.${stamp}@example.org`;
const scouter = `${E2E_PREFIX} Chefe ${stamp}`;
const youth = `${E2E_PREFIX} Jovem ${stamp}`;
const other = `${E2E_PREFIX} Outro ${stamp}`;

/** SQL como o administrador E2E (as funções auditadas exigem um usuário). */
const asAdmin = (sql: string) => psql(`
  begin;
  select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true)
    from auth.users u where u.email = ${literal(E2E_ADMIN_EMAIL)};
  set local role authenticated;
  ${sql}
  commit;`);

const groupId = () => psql(`select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${literal(E2E_ADMIN_EMAIL)};`);

test.beforeAll(() => {
  const gid = groupId();
  ensureUser(chief);
  psql(`insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
    select ${literal(gid)}, id, 'none', 'contributor', 'none' from auth.users where email = ${literal(chief)}
    on conflict (group_id, user_id) do update set finance_role = 'none', inventory_role = 'contributor', associates_role = 'none';`);
  ensureUser(contributor);
  psql(`insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
    select ${literal(gid)}, id, 'contributor', 'viewer', 'viewer' from auth.users where email = ${literal(contributor)}
    on conflict (group_id, user_id) do update set finance_role = 'contributor', inventory_role = 'viewer', associates_role = 'viewer';`);
  const chiefId = psql(`select id from auth.users where email = ${literal(chief)};`);
  // aniversário hoje: aparece em "Aniversários e promessas"
  asAdmin(`
    select public.create_section(${literal(gid)}, 'escoteiro', ${literal(`${E2E_PREFIX} Tropa ${stamp}`)}) as tropa \\gset
    select public.create_section(${literal(gid)}, 'lobinho', ${literal(`${E2E_PREFIX} Alcateia ${stamp}`)}) as alcateia \\gset
    select public.associates_create(${literal(gid)}, ${literal(scouter)}, 'adulto', null, null, null, null, null, null) as chefe \\gset
    select public.associates_create(${literal(gid)}, ${literal(youth)}, 'escoteiro', :'tropa', null, (current_date - interval '12 years')::date, null, null, null);
    select public.associates_create(${literal(gid)}, ${literal(other)}, 'lobinho', :'alcateia', null, (current_date - interval '8 years')::date, null, null, null);
    select public.associates_add_function(:'chefe', 'escotista', null, current_date, :'tropa');
    select public.admin_link_member_associate(${literal(gid)}, ${literal(chiefId)}, :'chefe');`);
});

test.afterAll(async () => {
  psql(`delete from public.ledger_entries where created_by = (select id from auth.users where email = ${literal(contributor)});`);
  await deleteUsers([chief, contributor]);
  psql(`
    delete from public.associates where name in (${[scouter, youth, other].map(literal).join(", ")});
    delete from public.sections where name like ${literal(`${E2E_PREFIX} % ${stamp}`)};`);
});

test("chefe vê só o Inventário e os avisos da própria seção", async ({ browser }) => {
  const page = await pageAs(browser, chief);
  const nav = page.getByRole("navigation").first();

  await test.step("Início sem Financeiro nem Associados", async () => {
    await expect(nav.getByRole("link", { name: "Inventário" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Financeiro" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Associados" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Vencimentos de registro" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Financeiro" })).toHaveCount(0);
  });

  await test.step("aniversário só do jovem da seção do chefe, sem link para o cadastro", async () => {
    const dates = page.getByRole("region", { name: "Aniversários e promessas" });
    await expect(dates).toContainText(youth);
    await expect(dates).not.toContainText(other);
    await expect(dates.getByRole("link", { name: new RegExp(youth) })).toHaveCount(0);
  });

  await test.step("módulos sem acesso voltam para o Início", async () => {
    await page.goto("/financeiro/lancamentos/movimentacoes");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await page.goto("/associados");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    const report = await page.request.get("/associados/relatorios/doc-10");
    expect(report.status()).toBe(403);
  });

  await test.step("Inventário continua aberto", async () => {
    await page.goto("/inventario/materiais");
    await expect(page).toHaveURL(/\/inventario\/materiais/);
  });
  await page.context().close();
});

test("colaborador do Financeiro lança, mas o lançamento fica para revisar", async ({ browser }) => {
  const page = await pageAs(browser, contributor);
  const name = uniqueName("Colaborador");

  await test.step("sem Configurações nem revisão", async () => {
    await page.goto("/financeiro");
    await expect(page.getByRole("link", { name: "Novo lançamento" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Configurações" })).toHaveCount(0);
    await page.goto("/financeiro/configuracoes");
    await expect(page).toHaveURL((url) => url.pathname === "/financeiro");
  });

  await test.step("lança e o lançamento entra para revisar", async () => {
    await createEntry(page, { name, direction: "saida", total: "7,00", account: E2E_ACCOUNTS[0], category: "Telefone", description: "e2e colaborador" });
    await page.goto(`/financeiro/lancamentos/movimentacoes?revisao=para_revisar&de=tudo&q=${encodeURIComponent(name)}`);
    await expect(entryRow(page, name)).toHaveCount(1);
    await entryRow(page, name).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("note")).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como revisado" })).toHaveCount(0);
  });
  await page.context().close();
});
