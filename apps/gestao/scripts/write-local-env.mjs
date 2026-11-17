import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// SUPABASE_BIN: CLI already on PATH (CI); otherwise `npx supabase`.
const [command, ...prefix] = process.env.SUPABASE_BIN ? [process.env.SUPABASE_BIN] : ["npx", "supabase"];
const output = execFileSync(command, [...prefix, "status", "--output", "env"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

const values = Object.fromEntries(
  output
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)=(?:"(.*)"|(.*))$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2] ?? match[3]]),
);

const publicKey = values.PUBLISHABLE_KEY ?? values.ANON_KEY;
const secretKey = values.SECRET_KEY ?? values.SERVICE_ROLE_KEY;
const missing = [
  !values.API_URL && "API_URL",
  !publicKey && "PUBLISHABLE_KEY/ANON_KEY",
  !secretKey && "SECRET_KEY/SERVICE_ROLE_KEY",
].filter(Boolean);

if (missing.length > 0) {
  throw new Error(`Supabase local não retornou: ${missing.join(", ")}`);
}

const sharedEnv = [
  "# Gerado por `npm run infra:env`; não edite manualmente.",
  `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
  `SUPABASE_SECRET_KEY=${secretKey}`,
];
const financeEnv = [
  ...sharedEnv,
  "NEXT_PUBLIC_SITE_URL=http://localhost:4321",
  "NEXT_PUBLIC_INVENTARIO_URL=http://localhost:3002",
  "",
].join("\n");
const inventoryEnv = [
  ...sharedEnv,
  "NEXT_PUBLIC_FINANCEIRO_URL=http://localhost:3000",
  "",
].join("\n");

const targets = [
  [resolve(".env.local"), financeEnv],
  [resolve("../inventario/.env.local"), inventoryEnv],
];
for (const [target, contents] of targets) {
  writeFileSync(target, contents, { mode: 0o600 });
  console.log(`Credenciais locais gravadas em ${target}`);
}
