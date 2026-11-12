import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";
import { cleanupE2eGroup, ensureE2eGroup } from "./support/db";
import { ADMIN_STATE, E2E_ADMIN_EMAIL } from "./support/env";
import { loginWithOtp } from "./support/login";

// Prepara o grupo E2E e entra como o administrador E2E por OTP (código lido no Mailpit);
// a sessão fica em e2e/.auth/admin.json para os demais testes.
setup("login por OTP do administrador E2E", async ({ page }) => {
  await ensureE2eGroup();
  cleanupE2eGroup();
  await loginWithOtp(page, E2E_ADMIN_EMAIL);
  mkdirSync(dirname(ADMIN_STATE), { recursive: true });
  await page.context().storageState({ path: ADMIN_STATE });
});
