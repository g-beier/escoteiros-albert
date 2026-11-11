import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = execFileSync("npx", ["supabase", "status", "--output", "env"], {
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

const env = [
  "# Gerado por `npm run infra:env`; não edite manualmente.",
  `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
  `SUPABASE_SECRET_KEY=${secretKey}`,
  "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
  "",
].join("\n");

const target = resolve(".env.local");
writeFileSync(target, env, { mode: 0o600 });
console.log(`Credenciais locais gravadas em ${target}`);
