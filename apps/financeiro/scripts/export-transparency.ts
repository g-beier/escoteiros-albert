/**
 * Gera o Realizado público de cada ano com lançamentos em apps/institucional/src/data/prestacao-contas/<ano>.json.
 * Roda antes do build do site (`prebuild` do institucional); também à mão: `npm run export:transparency --workspace=@geas/financeiro`.
 *
 * Lê o banco com a chave secreta de apps/financeiro/.env.local (ou das variáveis de ambiente).
 * Sem credenciais, sem banco no ar ou sem lançamentos, falha e barra o build: o site não sai sem a prestação de contas.
 * TRANSPARENCY_SKIP=1 pula a geração (CI, que não tem o banco do grupo); a página sai sem a seção.
 * Grupo: TRANSPARENCY_GROUP (nome) ou "Grupo Escoteiro Albert Schweitzer".
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fetchRealizedModel } from "@/lib/export/queries";
import { buildTransparencyReport } from "@/lib/export/transparency";

const OUT_DIR = resolve(__dirname, "../../institucional/src/data/prestacao-contas");
const GROUP_NAME = process.env.TRANSPARENCY_GROUP ?? "Grupo Escoteiro Albert Schweitzer";

function fail(reason: string): never {
  console.error(`\n✖ Prestação de contas não gerada: ${reason}`);
  console.error("  O build do site foi interrompido. Corrija e rode de novo (TRANSPARENCY_SKIP=1 pula, só para testes).\n");
  process.exit(1);
}

async function main() {
  if (process.env.TRANSPARENCY_SKIP === "1") {
    console.warn("TRANSPARENCY_SKIP=1: prestação de contas não gerada; a página Transparência sai sem o Realizado.");
    return;
  }
  const envFile = resolve(__dirname, "../.env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail("sem NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY (apps/financeiro/.env.local).");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: group, error: groupError } = await supabase.from("groups").select("id").eq("name", GROUP_NAME).maybeSingle();
  if (groupError) fail(`banco indisponível em ${url} (${groupError.message}). O Supabase está rodando?`);
  if (!group) fail(`grupo "${GROUP_NAME}" não encontrado.`);

  const [{ data: first }, { data: last }] = await Promise.all([
    supabase.from("ledger_entries").select("entry_date").eq("group_id", group.id).order("entry_date").limit(1).maybeSingle(),
    supabase.from("ledger_entries").select("entry_date").eq("group_id", group.id).order("entry_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!first || !last) fail("nenhum lançamento no grupo.");

  const years: number[] = [];
  for (let y = Number(first.entry_date.slice(0, 4)); y <= Number(last.entry_date.slice(0, 4)); y++) years.push(y);
  const reports = await Promise.all(years.map(async (y) => buildTransparencyReport(await fetchRealizedModel(supabase, group.id, y))));

  // só troca os arquivos depois de ler tudo: uma falha no meio não deixa o site com metade dos anos
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) if (file.endsWith(".json")) rmSync(resolve(OUT_DIR, file));
  for (const report of reports) writeFileSync(resolve(OUT_DIR, `${report.year}.json`), `${JSON.stringify(report)}\n`);
  console.log(`Prestação de contas atualizada: ${years.join(", ")} (até ${reports.at(-1)!.periodEnd}).`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
