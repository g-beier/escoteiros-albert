#!/usr/bin/env node
// Carga de DESENVOLVIMENTO: importa os CSV gerados por planilha-para-csv.mjs no Supabase LOCAL.
// Apaga o inventário do grupo antes (repetível) e cadastra tudo pelas funções inventory_*, como o
// administrador do grupo (mesmo caminho da interface: auditoria e movimentos de entrada).
// Recusa rodar se apps/inventario/.env.local não apontar para um Supabase local.
//
// Uso: node apps/inventario/scripts/importar-planilha.mjs <pasta com inventario-lotes.csv e inventario-pecas.csv> [--grupo "Nome do grupo"]
//
// Regras (apps/inventario/docs/modelo.md, "Carga inicial"):
// - divisão pelo caminho "A › B › C" (cria a árvore); família pela coluna `familia`; Barracas = código 001;
// - um material por nome (sem diferenciar maiúsculas), por quantidade; consumível se algum lote for `consumivel`;
// - cada linha com quantidade > 0 vira um lote; quantidade 0 não vira lote (listada no fim);
// - a categoria (só a Alcateia tem) vai para a observação do lote;
// - as peças (B1…) entram no material "Barraca etiquetada" (família Barracas), na divisão
//   "Almoxarifado › Barracas (a conferir)", até a conciliação com as linhas de barraca das seções.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const groupIndex = args.indexOf("--grupo");
const groupName = groupIndex >= 0 ? args[groupIndex + 1] : null;
if (!dir) { console.error("Uso: node importar-planilha.mjs <pasta dos CSV> [--grupo \"Nome do grupo\"]"); process.exit(1); }

// Só banco local -------------------------------------------------------------------------------
const env = readFileSync(join(here, "..", ".env.local"), "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  console.error(`Recusado: apps/inventario/.env.local aponta para ${url || "(sem URL)"}. A carga da planilha é só para o Supabase local.`);
  process.exit(1);
}
const container = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n").find((n) => n.startsWith("supabase_db"));
if (!container) { console.error("Supabase local não está rodando (npm run infra:start)."); process.exit(1); }
const psql = (sql, extra = []) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", ...extra], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const query = (sql) => psql(sql, ["-A", "-t", "-F", "\t"]).trim();

// CSV (;, aspas, BOM) --------------------------------------------------------------------------
function readCsv(file) {
  const text = readFileSync(join(dir, file), "utf8").replace(/^﻿/, "");
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ";") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  row.push(field); rows.push(row);
  const [head, ...data] = rows;
  return data.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const lots = readCsv("inventario-lotes.csv");
const units = readCsv("inventario-pecas.csv");

// Grupo e administrador ------------------------------------------------------------------------
const groups = query("select id, name from public.groups order by created_at").split("\n").filter(Boolean).map((l) => l.split("\t"));
const group = groupName ? groups.find(([, name]) => name === groupName) : groups.length === 1 ? groups[0] : null;
if (!group) { console.error(`Escolha o grupo com --grupo. Grupos: ${groups.map(([, n]) => n).join(", ")}`); process.exit(1); }
const [gid] = group;
const admin = query(`select user_id from public.memberships where group_id = '${gid}' and role = 'admin' order by created_at limit 1`);
if (!admin) { console.error("O grupo não tem administrador."); process.exit(1); }

// SQL ------------------------------------------------------------------------------------------
const lit = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const cents = (v) => (v === "" ? "null" : String(Math.round(Number(v) * 100)));
const SEP = " › ";
const UNIT_MATERIAL = "Barraca etiquetada";
const UNIT_LOCATION = `Almoxarifado${SEP}Barracas (a conferir)`;
const locationId = (path) => `(select id from public.inventory_location_paths where group_id = '${gid}' and path = ${lit(path)})`;
const familyId = (name) => `(select id from public.inventory_families where group_id = '${gid}' and name = ${lit(name)})`;
const materialId = (name) => `(select id from public.inventory_materials where group_id = '${gid}' and lower(name) = lower(${lit(name)}))`;

const imported = lots.filter((l) => Number(l.quantidade) > 0);
const zero = lots.filter((l) => Number(l.quantidade) === 0);

// divisões: todos os prefixos, do mais raso ao mais fundo. Dentro de cada nível, na ordem em que aparecem na
// planilha (abas e subtítulos): inventory_save_location põe cada divisão nova no fim das irmãs (034).
const paths = new Set();
for (const path of [...imported.map((l) => l.divisao), UNIT_LOCATION]) {
  const parts = path.split(SEP);
  parts.forEach((_, i) => paths.add(parts.slice(0, i + 1).join(SEP)));
}
const orderedPaths = [...paths].sort((a, b) => a.split(SEP).length - b.split(SEP).length); // sort estável: mantém a ordem da planilha

const families = [...new Set(imported.map((l) => l.familia).filter(Boolean))];
const materials = new Map(); // nome em minúsculas → { name, family, consumable }
for (const l of imported) {
  const key = l.material.toLowerCase();
  const m = materials.get(key) ?? { name: l.material, family: l.familia, consumable: false };
  if (l.tipo === "consumivel") m.consumable = true;
  if (!m.family && l.familia) m.family = l.familia;
  materials.set(key, m);
}

const sql = [];
sql.push("begin;");
// Limpeza do grupo (como postgres): movimentos, lotes, peças, materiais, famílias e divisões (das folhas para a raiz).
sql.push(`delete from public.inventory_movements where group_id = '${gid}';`);
sql.push(`delete from public.inventory_lots where group_id = '${gid}';`);
sql.push(`delete from public.inventory_units where group_id = '${gid}';`);
sql.push(`delete from public.inventory_materials where group_id = '${gid}';`);
sql.push(`delete from public.inventory_families where group_id = '${gid}';`);
sql.push(`do $$ begin
  while exists (select 1 from public.inventory_locations where group_id = '${gid}') loop
    delete from public.inventory_locations l where l.group_id = '${gid}'
      and not exists (select 1 from public.inventory_locations c where c.parent_id = l.id);
  end loop;
end $$;`);
// Daqui em diante, como o administrador do grupo (as funções conferem o papel).
sql.push(`select set_config('request.jwt.claims', json_build_object('sub', '${admin}', 'role', 'authenticated')::text, true);`);
sql.push("set local role authenticated;");
for (const path of orderedPaths) {
  const parts = path.split(SEP);
  const parent = parts.length > 1 ? locationId(parts.slice(0, -1).join(SEP)) : "null";
  sql.push(`select public.inventory_save_location('${gid}', null, ${parent}, ${lit(parts.at(-1))}, null);`);
}
sql.push(`select public.inventory_save_family('${gid}', null, 'Barracas', '001');`);
for (const f of families.filter((f) => f !== "Barracas")) sql.push(`select public.inventory_save_family('${gid}', null, ${lit(f)}, null);`);
for (const m of materials.values()) {
  sql.push(`select public.inventory_save_material('${gid}', null, ${m.family ? familyId(m.family) : "null"}, ${lit(m.name)}, 'lot', ${m.consumable}, null, null);`);
}
sql.push(`select public.inventory_save_material('${gid}', null, ${familyId("Barracas")}, ${lit(UNIT_MATERIAL)}, 'unit', false, null, 'Barracas conferidas em 10/01/2026 (aba BARRACAS da planilha).');`);
for (const l of imported) {
  const notes = [l.observacao, l.categoria ? `Categoria: ${l.categoria}` : ""].filter(Boolean).join(" · ").slice(0, 500);
  sql.push(`select public.inventory_add_lot(${materialId(l.material)}, ${locationId(l.divisao)}, ${Number(l.quantidade)}, ${lit(l.condicao)}, ${cents(l.valor_unitario)}, ${lit(l.validade)}, null, 'nao_informada', null, null, ${lit(notes)});`);
}
for (const u of units) {
  sql.push(`select public.inventory_add_unit(${materialId(UNIT_MATERIAL)}, ${locationId(UNIT_LOCATION)}, ${lit(u.etiqueta)}, ${lit(u.codigo_antigo)}, ${lit(u.descricao)}, ${lit(u.condicao)}, null, null, 'nao_informada', null, null, ${lit(`Conferida em ${u.conferida_em.split("-").reverse().join("/")}.`)});`);
}
// Contagens anuais da planilha (2024–2026) por material e divisão, somando as linhas repetidas. Inclui as linhas
// zeradas, desde que o material e a divisão existam (vieram de outra linha com saldo).
const YEARS = [2024, 2025, 2026];
const counts = new Map(); // "material|divisão|ano" → quantidade
for (const l of lots) {
  if (!materials.has(l.material.toLowerCase()) || !paths.has(l.divisao)) continue;
  for (const year of YEARS) {
    const value = l[`q${year}`];
    if (value === "" || value === undefined) continue;
    const key = `${l.material.toLowerCase()}|${l.divisao}|${year}`;
    counts.set(key, (counts.get(key) ?? 0) + Number(value));
  }
}
for (const [key, quantity] of counts) {
  const [material, divisao, year] = key.split("|");
  sql.push(`select public.inventory_record_count(${materialId(material)}, ${locationId(divisao)}, ${year}, ${quantity}, 'Planilha Doc 31');`);
}
sql.push("commit;");

console.log(`Importando no grupo "${group[1]}" (${url}): ${orderedPaths.length} divisões, ${families.length + (families.includes("Barracas") ? 0 : 1)} famílias, ${materials.size + 1} materiais, ${imported.length} lotes, ${units.length} peças…`);
psql(sql.join("\n"), ["-o", "/dev/null"]);

// Conferência contra os CSV --------------------------------------------------------------------
const expected = {
  divisoes: orderedPaths.length,
  familias: new Set([...families, "Barracas"]).size,
  materiais: materials.size + 1,
  lotes: imported.length,
  pecas: units.length,
  quantidade: imported.reduce((s, l) => s + Number(l.quantidade), 0),
  valor_centavos: imported.reduce((s, l) => s + Number(l.quantidade) * (l.valor_unitario === "" ? 0 : Math.round(Number(l.valor_unitario) * 100)), 0),
  consumiveis: [...materials.values()].filter((m) => m.consumable).length,
  com_validade: imported.filter((l) => l.validade).length,
  movimentos: materials.size + 1 + imported.length + units.length,
  contagens: counts.size,
};
const got = Object.fromEntries(query(`select
  (select count(*) from public.inventory_locations where group_id = '${gid}'),
  (select count(*) from public.inventory_families where group_id = '${gid}'),
  (select count(*) from public.inventory_materials where group_id = '${gid}'),
  (select count(*) from public.inventory_lots where group_id = '${gid}'),
  (select count(*) from public.inventory_units where group_id = '${gid}'),
  (select coalesce(sum(quantity), 0) from public.inventory_lots where group_id = '${gid}'),
  (select coalesce(sum(quantity * coalesce(unit_value_cents, 0)), 0) from public.inventory_lots where group_id = '${gid}'),
  (select count(*) from public.inventory_materials where group_id = '${gid}' and consumable),
  (select count(*) from public.inventory_lots where group_id = '${gid}' and expires_on is not null),
  (select count(*) from public.inventory_movements where group_id = '${gid}'),
  (select count(*) from public.inventory_counts where group_id = '${gid}')`).split("\t").map((v, i) => [Object.keys(expected)[i], Number(v)]));
let ok = true;
for (const [k, v] of Object.entries(expected)) {
  const match = got[k] === v;
  ok &&= match;
  console.log(`${match ? "ok  " : "ERRO"} ${k}: esperado ${v}, no banco ${got[k]}`);
}
console.log(`\nLinhas com quantidade 0 (não viraram lote): ${zero.length}`);
const missing = zero.filter((l) => /ver onde est/i.test(l.observacao));
console.log(`"Ver onde está" (${missing.length}):\n  ${missing.map((l) => `${l.divisao} › ${l.material}`).join("\n  ")}`);
process.exit(ok ? 0 : 1);
