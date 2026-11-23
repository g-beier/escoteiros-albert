import type { Browser, Page } from "@playwright/test";
import type { ModuleRole } from "@geas/ui/lib/roles";
import { ensureUser, literal, psql } from "./db";
import { E2E_ADMIN_EMAIL } from "./env";
import { loginAs } from "./login";

/** Pessoa do grupo E2E com consulta no Financeiro e no Associados e o papel pedido no Inventário (cadastra se faltar). */
export async function ensureInventoryMember(email: string, inventoryRole: ModuleRole) {
  ensureUser(email);
  psql(`
    insert into public.memberships(group_id, user_id, finance_role, inventory_role, associates_role)
    select m.group_id, u.id, 'viewer', ${literal(inventoryRole)}, 'viewer'
      from public.memberships m join auth.users a on a.id = m.user_id, auth.users u
     where a.email = ${literal(E2E_ADMIN_EMAIL)} and u.email = ${literal(email)}
    on conflict (group_id, user_id) do update set finance_role = 'viewer', inventory_role = excluded.inventory_role, associates_role = 'viewer';
  `);
}

/** Página numa sessão própria (sem a do administrador), já logada pelo login de teste. */
export async function pageAs(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await loginAs(page, email);
  return page;
}
