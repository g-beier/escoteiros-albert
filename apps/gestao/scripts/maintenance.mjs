// Manutenção do banco do Gestão no Azure, rodada pelo Container Apps Job (imagem `job` do Dockerfile), de dentro da
// VNet: o Postgres não tem endereço público. Também roda localmente contra o banco do Docker. Uso:
//   node scripts/maintenance.mjs setup       cria (ou troca a senha de) o papel de login do app e aplica as migrations
//   node scripts/maintenance.mjs migrate     só as migrations novas (e os papéis do app)
//   node scripts/maintenance.mjs status      migrations aplicadas e pendentes
//   node scripts/maintenance.mjs bootstrap   primeiro administrador e o grupo (só num banco sem grupo)
//   node scripts/maintenance.mjs dump        pg_dump -Fc enviado ao contêiner `backups` do Blob Storage
//
// Variáveis:
//   DATABASE_ADMIN_URL      o dono dos objetos (administrador do servidor), com sslmode=verify-full no Azure
//   APP_DB_ROLE             papel de login do app (padrão geas_app)
//   APP_DB_PASSWORD         senha desse papel (setup)
//   BOOTSTRAP_ADMIN_EMAIL   e-mail Google do primeiro administrador (bootstrap)
//   BOOTSTRAP_GROUP_NAME    nome do grupo (padrão: Grupo Escoteiro Albert Schweitzer)
//   AZURE_STORAGE_ACCOUNT_URL + AZURE_CLIENT_ID   conta e identidade gerenciada do Job (dump)
//
// Nada aqui imprime senhas, URLs de conexão ou dados do grupo (os logs vão para o Log Analytics).
import { execFileSync, spawn } from "node:child_process";
import { createReadStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROLE = process.env.APP_DB_ROLE || "geas_app";
const GROUP_NAME = process.env.BOOTSTRAP_GROUP_NAME || "Grupo Escoteiro Albert Schweitzer";
const BACKUP_CONTAINER = "backups";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

const connect = () => postgres(required("DATABASE_ADMIN_URL"), { max: 1, onnotice: () => {}, connect_timeout: 30 });

/** As migrations ficam com o runner de sempre (scripts/db.mjs), que também concede os papéis ao APP_DB_ROLE. */
function runMigrations(command = "migrate") {
  execFileSync(process.execPath, [join(here, "db.mjs"), command], { stdio: "inherit", env: { ...process.env, APP_DB_ROLE: APP_ROLE } });
}

async function setup() {
  const password = required("APP_DB_PASSWORD");
  if (password.length < 16) throw new Error("APP_DB_PASSWORD precisa de pelo menos 16 caracteres.");
  const sql = connect();
  try {
    const [role] = await sql`select 1 from pg_roles where rolname = ${APP_ROLE}`;
    // a senha vai como literal (DDL não aceita parâmetro); format('%L') escapa no próprio servidor
    const [{ ddl }] = await sql`select format(${role ? "alter role %I login noinherit password %L" : "create role %I login noinherit password %L"}, ${APP_ROLE}::text, ${password}::text) as ddl`;
    await sql.unsafe(ddl);
    console.log(role ? `Senha do papel ${APP_ROLE} atualizada.` : `Papel ${APP_ROLE} criado.`);
  } finally {
    await sql.end();
  }
  runMigrations();
}

async function bootstrap() {
  const email = required("BOOTSTRAP_ADMIN_EMAIL").trim().toLowerCase();
  const sql = connect();
  try {
    const [group] = await sql`select 1 from public.groups limit 1`;
    if (group) throw new Error("O banco já tem um grupo: o bootstrap só roda uma vez. Novos usuários entram por /usuarios.");
    await sql.begin(async (tx) => {
      await tx`insert into auth.users(email) values (${email}) on conflict (email) do nothing`;
      await tx`select public.admin_bootstrap_group(${email}, ${GROUP_NAME})`;
    });
    console.log("Grupo criado com o primeiro administrador.");
  } finally {
    await sql.end();
  }
}

/** Parâmetros de conexão do libpq a partir da URL (sem a senha na linha de comando). */
function libpqEnv(url) {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
    // verify-full com as autoridades do sistema (o certificado do Azure é de CA pública)
    ...(sslmode === "verify-full" || sslmode === "verify-ca" ? { PGSSLROOTCERT: "system" } : {}),
  };
}

function pgDump(file) {
  return new Promise((done, fail) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`], {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...libpqEnv(required("DATABASE_ADMIN_URL")) },
    });
    child.on("error", fail);
    child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`pg_dump terminou com código ${code}.`))));
  });
}

async function dump() {
  const accountUrl = required("AZURE_STORAGE_ACCOUNT_URL");
  const dir = mkdtempSync(join(tmpdir(), "geas-dump-"));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const name = `geas-${stamp}.dump`;
  const file = resolve(dir, name);
  try {
    await pgDump(file);
    const { BlobServiceClient } = await import("@azure/storage-blob");
    const { DefaultAzureCredential } = await import("@azure/identity");
    const blob = new BlobServiceClient(accountUrl, new DefaultAzureCredential()).getContainerClient(BACKUP_CONTAINER).getBlockBlobClient(name);
    await blob.uploadStream(createReadStream(file), 4 * 1024 * 1024, 4, { blobHTTPHeaders: { blobContentType: "application/octet-stream" } });
    console.log(`Dump enviado: ${BACKUP_CONTAINER}/${name} (${Math.round(statSync(file).size / 1024)} kB).`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const commands = {
  setup,
  migrate: () => runMigrations("migrate"),
  status: () => runMigrations("status"),
  bootstrap,
  dump,
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Uso: node scripts/maintenance.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
try {
  await command();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
