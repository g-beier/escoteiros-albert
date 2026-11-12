import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Carrega apps/financeiro/.env.local (gerado por `npm run infra:env`) sem sobrescrever o ambiente. */
export function loadLocalEnv() {
  const file = resolve(__dirname, "../../.env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

loadLocalEnv();

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
/** Mailpit do Supabase local (`[local_smtp] port` em supabase/config.toml). */
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
/** Container do Postgres local: supabase_db_<project_id>. */
export const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_geas-financeiro";
/** Porta própria para o servidor dos testes, para não reaproveitar um `npm run dev` de outro checkout. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);

/** Usuário e grupo dedicados aos testes: nada dos dados existentes é tocado. */
export const E2E_ADMIN_EMAIL = "e2e.admin@escoteirosalbert.com.br";
export const E2E_GROUP_NAME = "Grupo E2E (testes automatizados)";
export const E2E_ACCOUNTS = ["Conta E2E", "Conta E2E 2"] as const;
/** Prefixo de tudo o que os testes criam (histórico de lançamentos, e-mails de convite). */
export const E2E_PREFIX = "E2E";
export const ADMIN_STATE = resolve(__dirname, "../.auth/admin.json");
