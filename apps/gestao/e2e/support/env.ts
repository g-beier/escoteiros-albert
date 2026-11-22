import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Carrega apps/gestao/.env.local (gerado por `npm run infra:start`) sem sobrescrever o ambiente. */
export function loadLocalEnv() {
  const file = resolve(__dirname, "../../.env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

loadLocalEnv();

/** Arquivo do Docker Compose do banco local; o psql dos testes roda dentro do container `db`. */
export const DB_COMPOSE = resolve(__dirname, "../../db/compose.yaml");
/** Porta própria para o servidor dos testes, para não reaproveitar um `npm run dev` de outro checkout. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);

/** Usuário e grupo dedicados aos testes: nada dos dados existentes é tocado. */
export const E2E_ADMIN_EMAIL = "e2e.admin@example.org";
export const E2E_GROUP_NAME = "Grupo E2E (testes automatizados)";
export const E2E_ACCOUNTS = ["Conta E2E", "Conta E2E 2"] as const;
/** Prefixo de tudo o que os testes criam (histórico de lançamentos, e-mails cadastrados). */
export const E2E_PREFIX = "E2E";
export const ADMIN_STATE = resolve(__dirname, "../.auth/admin.json");
