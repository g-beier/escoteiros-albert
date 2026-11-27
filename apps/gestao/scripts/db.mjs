// Banco do Gestão sem o CLI do Supabase. Uso (de apps/gestao):
//   node scripts/db.mjs start     sobe a infra local (db/compose.yaml), cria o papel do app, aplica as migrations,
//                                 prepara o Azurite e grava o bloco gerado de .env.local (o resto do arquivo fica)
//   node scripts/db.mjs stop      para a infra local (os dados ficam nos volumes)
//   node scripts/db.mjs migrate   aplica as migrations novas em DATABASE_ADMIN_URL (local ou Azure)
//   node scripts/db.mjs reset     recria o banco LOCAL do zero (apaga os dados), aplica tudo e cria o grupo com o
//                                 administrador padrão (BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_GROUP_NAME mudam os padrões)
//   node scripts/db.mjs test      roda db/tests com pg_prove dentro do container (cada arquivo desfaz o que fez)
//   node scripts/db.mjs status    migrations aplicadas e pendentes
//
// As migrations ficam em db/migrations (NNN_nome.sql), aplicadas em ordem, cada uma numa transação, registradas em
// geas_meta.migrations. Rodam como o dono dos objetos (local: postgres; Azure: o administrador do servidor).
// APP_DB_ROLE (ex.: geas_app) faz o `migrate` conferir que o papel de login do app pode trocar para os papéis de 000.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "db/migrations");
const compose = ["compose", "-f", resolve(root, "db/compose.yaml")];
const envFile = resolve(root, ".env.local");

const LOCAL = {
  port: Number(process.env.GEAS_DB_PORT ?? 54330),
  blobPort: Number(process.env.GEAS_BLOB_PORT ?? 10000),
  database: "geas",
  appRole: "geas_app",
  appPassword: "geas_app_local",
};
const localAdminUrl = (database = LOCAL.database) => `postgres://postgres:postgres@127.0.0.1:${LOCAL.port}/${database}`;
// Conta e chave públicas e fixas do Azurite (documentadas pela Microsoft); só valem no emulador local.
const AZURITE_ACCOUNT = "devstoreaccount1";
const AZURITE_KEY = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

function loadEnv() {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const isLocalUrl = (url) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(url).hostname);

function connect(url, options = {}) {
  return postgres(url, { max: 1, onnotice: () => {}, ...options });
}

function files() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();
}

async function applied(sql) {
  await sql`create schema if not exists geas_meta`;
  await sql`revoke all on schema geas_meta from public`;
  await sql`create table if not exists geas_meta.migrations (version text primary key, applied_at timestamptz not null default now())`;
  return new Set((await sql`select version from geas_meta.migrations`).map((row) => row.version));
}

async function migrate(url) {
  const sql = connect(url);
  try {
    await sql`select pg_advisory_lock(hashtext('geas_meta.migrations'))`;
    const done = await applied(sql);
    const pending = files().filter((name) => !done.has(name));
    for (const name of pending) {
      const text = readFileSync(resolve(migrationsDir, name), "utf8");
      process.stdout.write(`→ ${name}\n`);
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into geas_meta.migrations(version) values (${name})`;
      });
    }
    if (!pending.length) console.log("Nenhuma migration pendente.");
    const appRole = process.env.APP_DB_ROLE;
    if (appRole) await grantAppRole(sql, appRole);
  } finally {
    await sql.end();
  }
}

/** O papel de login do app só troca para `authenticated` e `geas_auth` (NOINHERIT: sozinho não lê nada). */
async function grantAppRole(sql, role) {
  await sql`grant authenticated, geas_auth to ${sql(role)}`;
  await sql`alter role ${sql(role)} noinherit`;
}

async function status(url) {
  const sql = connect(url);
  try {
    const done = await applied(sql);
    for (const name of files()) console.log(`${done.has(name) ? "✓" : "·"} ${name}`);
  } finally {
    await sql.end();
  }
}

function docker(args, options = {}) {
  return execFileSync("docker", [...compose, ...args], { stdio: "inherit", ...options });
}

async function waitForDb() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const sql = connect(localAdminUrl("postgres"), { connect_timeout: 2 });
    try {
      await sql`select 1`;
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 1000));
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
  throw new Error(`Postgres local não respondeu em 127.0.0.1:${LOCAL.port}.`);
}

async function ensureLocalDatabase() {
  const sql = connect(localAdminUrl("postgres"));
  try {
    const [exists] = await sql`select 1 from pg_database where datname = ${LOCAL.database}`;
    if (!exists) await sql`create database ${sql(LOCAL.database)}`;
    const [role] = await sql`select 1 from pg_roles where rolname = ${LOCAL.appRole}`;
    if (!role) await sql.unsafe(`create role ${LOCAL.appRole} login noinherit password '${LOCAL.appPassword}'`);
  } finally {
    await sql.end();
  }
}

async function setupBlob() {
  const { BlobServiceClient } = await import("@azure/storage-blob");
  const service = BlobServiceClient.fromConnectionString(azuriteConnectionString());
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await service.getContainerClient("comprovantes").createIfNotExists();
      await service.setProperties({
        cors: [
          {
            allowedOrigins: "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3210,http://127.0.0.1:3210",
            allowedMethods: "GET,PUT,HEAD,OPTIONS",
            allowedHeaders: "*",
            exposedHeaders: "*",
            maxAgeInSeconds: 3600,
          },
        ],
      });
      return;
    } catch (error) {
      if (attempt === 29) throw error;
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
}

const azuriteConnectionString = () =>
  `DefaultEndpointsProtocol=http;AccountName=${AZURITE_ACCOUNT};AccountKey=${AZURITE_KEY};BlobEndpoint=http://127.0.0.1:${LOCAL.blobPort}/${AZURITE_ACCOUNT};`;

// .env.local = bloco gerado (entre os marcadores, reescrito a cada `infra:start`) + o resto, que é de quem desenvolve
// (segredos do Google, E2E_LOGIN, toggles) e é mantido como está. Modelo comentado em .env.example.
const BLOCK_START = "# >>> gerado por `npm run infra:start` (não edite: é reescrito) >>>";
const BLOCK_END = "# <<< fim do bloco gerado; abaixo, as suas variáveis (ver .env.example) <<<";
const USER_TEMPLATE = [
  "",
  "# Login com Google (README › Ambiente local e segredos). Sem isso, use E2E_LOGIN=1.",
  "# GOOGLE_CLIENT_ID=",
  "# GOOGLE_CLIENT_SECRET=",
  "# E2E_LOGIN=1",
];

function userLines(text, managed) {
  const lines = text.split("\n");
  const start = lines.indexOf(BLOCK_START);
  const end = lines.indexOf(BLOCK_END);
  // Arquivo de antes dos marcadores: tudo menos o cabeçalho antigo.
  const rest =
    start >= 0 && end > start
      ? [...lines.slice(0, start), ...lines.slice(end + 1)]
      : lines.filter((line) => !line.startsWith("# Gerado por"));
  // Uma chave gerada repetida fora do bloco valeria por cima dele: sai.
  const kept = rest.filter((line) => !managed.has(line.split("=")[0].trim()));
  while (kept.length && !kept.at(-1).trim()) kept.pop();
  return kept;
}

function writeLocalEnv() {
  const generated = {
    DATABASE_URL: `postgres://${LOCAL.appRole}:${LOCAL.appPassword}@127.0.0.1:${LOCAL.port}/${LOCAL.database}`,
    DATABASE_ADMIN_URL: localAdminUrl(),
    AZURE_STORAGE_CONNECTION_STRING: azuriteConnectionString(),
    NEXT_PUBLIC_SITE_URL: "http://localhost:4321",
  };
  const user = existsSync(envFile)
    ? userLines(readFileSync(envFile, "utf8"), new Set(Object.keys(generated)))
    : USER_TEMPLATE;
  const lines = [
    BLOCK_START,
    ...Object.entries(generated).map(([key, value]) => `${key}=${value}`),
    BLOCK_END,
    ...user,
    "",
  ];
  writeFileSync(envFile, lines.join("\n"), { mode: 0o600 });
  console.log(`Configuração local gravada em ${envFile}`);
  warnMissingLogin();
}

function warnMissingLogin() {
  const values = Object.fromEntries(
    readFileSync(envFile, "utf8")
      .split("\n")
      .filter((line) => /^[A-Z_0-9]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  );
  if (values.GOOGLE_CLIENT_ID && values.GOOGLE_CLIENT_SECRET) return;
  console.warn(
    values.E2E_LOGIN === "1"
      ? "Login: só o de teste (E2E_LOGIN=1). Para entrar com Google, preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em .env.local."
      : "⚠️  Sem login configurado: preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em .env.local, ou E2E_LOGIN=1 para o login de teste (README › Ambiente local e segredos).",
  );
}

async function start() {
  docker(["up", "-d", "--build", "--wait"]);
  await waitForDb();
  await ensureLocalDatabase();
  process.env.APP_DB_ROLE = LOCAL.appRole;
  await migrate(localAdminUrl());
  await setupBlob();
  writeLocalEnv();
}

async function reset() {
  loadEnv();
  const url = process.env.DATABASE_ADMIN_URL ?? localAdminUrl();
  if (!isLocalUrl(url))
    throw new Error(`reset só roda no banco local (DATABASE_ADMIN_URL aponta para ${new URL(url).hostname}).`);
  const sql = connect(localAdminUrl("postgres"));
  try {
    await sql`drop database if exists ${sql(LOCAL.database)} with (force)`;
  } finally {
    await sql.end();
  }
  await ensureLocalDatabase();
  process.env.APP_DB_ROLE = LOCAL.appRole;
  await migrate(localAdminUrl());
  await bootstrapLocalGroup(localAdminUrl());
}

/** Banco local recém-criado: o grupo e o primeiro administrador (todos os módulos), como `maintenance.mjs bootstrap`. */
async function bootstrapLocalGroup(url) {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "diretoria@escoteirosalbert.com.br").trim().toLowerCase();
  const name = process.env.BOOTSTRAP_GROUP_NAME || "Grupo Escoteiro Albert Schweitzer";
  const sql = connect(url);
  try {
    const [group] = await sql`select 1 from public.groups limit 1`;
    if (group) return;
    await sql.begin(async (tx) => {
      await tx`insert into auth.users(email) values (${email}) on conflict (email) do nothing`;
      await tx`select public.admin_bootstrap_group(${email}, ${name})`;
    });
    console.log(`Grupo "${name}" criado com ${email} (Administrador em todos os módulos).`);
  } finally {
    await sql.end();
  }
}

function test() {
  // pgTAP só no banco local/CI, fora do schema public (não entra nos tipos gerados nem vai para o Azure).
  docker([
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "postgres",
    "-d",
    LOCAL.database,
    "-qc",
    "create schema if not exists extensions; create extension if not exists pgtap schema extensions; grant usage on schema extensions to authenticated; grant execute on all functions in schema extensions to authenticated;",
  ]);
  const tests = readdirSync(resolve(root, "db/tests"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => `/tests/${name}`);
  docker([
    "exec",
    "-T",
    "-w",
    "/tests",
    "-e",
    "PGOPTIONS=-c search_path=public,extensions",
    "db",
    "pg_prove",
    "-U",
    "postgres",
    "-d",
    LOCAL.database,
    "--failures",
    ...tests,
  ]);
}

function adminUrl() {
  loadEnv();
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL não configurada (local: `npm run infra:start` grava em .env.local).");
  return url;
}

/** Exclusão definitiva dos associados que passaram da quarentena (018); no Azure, o Job agendado roda `maintenance.mjs purge`. */
async function purge(url) {
  const sql = connect(url);
  try {
    const [{ purged }] = await sql`select public.associates_purge_due() as purged`;
    console.log(`Associados excluídos de vez: ${purged}.`);
  } finally {
    await sql.end();
  }
}

const commands = {
  start,
  stop: () => docker(["stop"]),
  migrate: () => migrate(adminUrl()),
  status: () => status(adminUrl()),
  purge: () => purge(adminUrl()),
  reset,
  test,
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Uso: node scripts/db.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
try {
  await command();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
