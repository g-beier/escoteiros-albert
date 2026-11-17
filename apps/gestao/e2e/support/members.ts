import type { Browser, Page } from "@playwright/test";
import type { InventoryRole } from "@geas/ui/lib/roles";
import { adminClient, findUser, psql } from "./db";
import { E2E_ADMIN_EMAIL } from "./env";
import { loginWithOtp } from "./login";

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Pessoa do grupo E2E com consulta no Financeiro e o papel pedido no Inventário (cria no Auth se faltar). */
export async function ensureInventoryMember(email: string, inventoryRole: InventoryRole) {
  if (!(await findUser(email))) {
    const { error } = await adminClient().auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
  }
  psql(`
    insert into public.memberships(group_id, user_id, role, inventory_role)
    select m.group_id, u.id, 'viewer', ${literal(inventoryRole)}
      from public.memberships m join auth.users a on a.id = m.user_id, auth.users u
     where a.email = ${literal(E2E_ADMIN_EMAIL)} and u.email = ${literal(email)}
    on conflict (group_id, user_id) do update set role = 'viewer', inventory_role = excluded.inventory_role;
  `);
}

/** Página numa sessão própria (sem a do administrador), já logada por OTP. */
export async function pageAs(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await loginWithOtp(page, email);
  return page;
}
