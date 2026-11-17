/**
 * Gera o Realizado público de cada ano com lançamentos em apps/institucional/src/data/prestacao-contas/<ano>.json.
 * Roda antes do build do site (`prebuild` do institucional); também à mão: `npm run export:transparency --workspace=@geas/gestao`.
 *
 * Lê o banco com a chave secreta de apps/gestao/.env.local (ou das variáveis de ambiente).
 * Sem credenciais, sem banco no ar ou sem lançamentos, falha e barra o build: o site não sai sem a prestação de contas.
 * TRANSPARENCY_SKIP=1 pula a geração (CI, que não tem o banco do grupo); a página sai sem a seção.
 * Banco local (Docker, dados fictícios) nunca vai para o site: apaga os arquivos e a página sai sem a seção.
 * TRANSPARENCY_ALLOW_LOCAL=1 usa o banco local mesmo assim, só para ver o layout (não publique esse build).
 * Grupo: TRANSPARENCY_GROUP (nome) ou "Grupo Escoteiro Albert Schweitzer".
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { entryDateRange, fetchRealizedModel, groupIdByName } from "@/lib/server/finance/reports";
import { serviceDb } from "@/lib/server/supabase/service";
import { buildTransparencyReport } from "@/lib/finance/export/transparency";

const OUT_DIR = resolve(__dirname, "../../institucional/src/data/prestacao-contas");
const GROUP_NAME = process.env.TRANSPARENCY_GROUP ?? "Grupo Escoteiro Albert Schweitzer";

function isLocal(url: string) {
  return ["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "host.docker.internal"].includes(new URL(url).hostname);
}

function clearReports() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) if (file.endsWith(".json")) rmSync(resolve(OUT_DIR, file));
}

function fail(reason: string): never {
  console.error(`\n✖ Prestação de contas não gerada: ${reason}`);
  console.error("  O build do site foi interrompido. Corrija e rode de novo (TRANSPARENCY_SKIP=1 pula, só para testes).\n");
  process.exit(1);
}

async function main() {
  if (process.env.TRANSPARENCY_SKIP === "1") {
    clearReports();
    console.warn("TRANSPARENCY_SKIP=1: prestação de contas não gerada; a página Transparência sai sem o Realizado.");
    return;
  }
  const envFile = resolve(__dirname, "../.env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail("sem NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY (apps/gestao/.env.local).");
  if (isLocal(url) && process.env.TRANSPARENCY_ALLOW_LOCAL !== "1") {
    clearReports();
    console.warn(`\n⚠️  ${url} é o Supabase local (dados fictícios): a página Transparência sai sem o Realizado.`);
    console.warn("   Para ver o layout com esses dados: TRANSPARENCY_ALLOW_LOCAL=1 (não publique esse build).\n");
    return;
  }

  const db = serviceDb();
  const groupId = await groupIdByName(db, GROUP_NAME).catch((error: Error) => fail(`banco indisponível em ${url} (${error.message}). O Supabase está rodando?`));
  if (!groupId) fail(`grupo "${GROUP_NAME}" não encontrado.`);

  const { first, last } = await entryDateRange(db, groupId);
  if (!first || !last) fail("nenhum lançamento no grupo.");

  const years: number[] = [];
  for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) years.push(y);
  const reports = await Promise.all(years.map(async (y) => buildTransparencyReport(await fetchRealizedModel(db, groupId, y))));

  // só troca os arquivos depois de ler tudo: uma falha no meio não deixa o site com metade dos anos
  clearReports();
  for (const report of reports) writeFileSync(resolve(OUT_DIR, `${report.year}.json`), `${JSON.stringify(report)}\n`);
  console.log(`Prestação de contas atualizada: ${years.join(", ")} (até ${reports.at(-1)!.periodEnd}).`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
