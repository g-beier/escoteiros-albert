import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";
import { cleanupE2eGroup, ensureE2eGroup } from "./support/db";
import { ADMIN_STATE, E2E_ADMIN_EMAIL } from "./support/env";
import { loginAs } from "./support/login";

// Prepara o grupo E2E e entra como o administrador E2E pelo login de teste (/auth/e2e);
// a sessão fica em e2e/.auth/admin.json para os demais testes.
setup("login do administrador E2E", async ({ page }) => {
  await ensureE2eGroup();
  cleanupE2eGroup();
  await loginAs(page, E2E_ADMIN_EMAIL);
  mkdirSync(dirname(ADMIN_STATE), { recursive: true });
  await page.context().storageState({ path: ADMIN_STATE });
});
