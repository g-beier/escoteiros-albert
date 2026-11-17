#!/usr/bin/env node
// Inventário de demonstração no Supabase LOCAL (divisões, categorias 001–011, materiais, lotes e peças).
// Apaga o inventário do grupo e recria dados para a Home (Bom/Médio/Ruim × donos) e testes manuais.
// Pré-requisito: npm run infra:start (Docker + apps/financeiro/.env.local / apps/inventario/.env.local).
// Uso (na raiz):
//   npm run seed:inventario
//   npm run seed:inventario -- --grupo "Grupo Escoteiro Albert Schweitzer"
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const groupIndex = args.indexOf("--grupo");
const groupName = groupIndex >= 0 ? args[groupIndex + 1] : null;

const env = readFileSync(join(here, "..", ".env.local"), "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  console.error(`Recusado: .env.local aponta para ${url || "(sem URL)"}. O seed é só para Supabase local.`);
  process.exit(1);
}
const container = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" })
  .split("\n").find((n) => n.startsWith("supabase_db"));
if (!container) {
  console.error("Supabase local não está rodando (npm run infra:start).");
  process.exit(1);
}

const psql = (sql, extra = []) => execFileSync(
  "docker",
  ["exec", "-i", container, "psql", "-U", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", ...extra],
  { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
const query = (sql) => psql(sql, ["-A", "-t", "-F", "\t"]).trim();
const lit = (v) => (v == null || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const groups = query("select id, name from public.groups order by created_at").split("\n").filter(Boolean).map((l) => l.split("\t"));
const group = groupName ? groups.find(([, name]) => name === groupName) : groups.length === 1 ? groups[0] : null;
if (!group) {
  console.error(`Escolha o grupo com --grupo. Grupos: ${groups.map(([, n]) => n).join(", ") || "(nenhum)"}`);
  process.exit(1);
}
const [gid, gname] = group;
const admin = query(`select user_id from public.memberships where group_id = '${gid}' and role = 'admin' order by created_at limit 1`);
if (!admin) {
  console.error("O grupo não tem administrador. Rode o bootstrap local antes.");
  process.exit(1);
}

const SEP = " › ";
const pathId = (path) => `(select id from public.inventory_location_paths where group_id = '${gid}' and path = ${lit(path)})`;
const familyId = (name) => `(select id from public.inventory_families where group_id = '${gid}' and name = ${lit(name)})`;
const materialId = (name) => `(select id from public.inventory_materials where group_id = '${gid}' and lower(name) = lower(${lit(name)}))`;

const roots = [
  ["Diretoria", null],
  ["Cozinha", null],
  ["Almoxarifado", null],
  ["Alcateia", null],
  ["Tropa Escoteira", null],
  ["Tropa Sênior", null],
  ["Clã Pioneiro", null],
];
const children = [
  ["Diretoria › Armário de ferro", "Diretoria"],
  ["Diretoria › Estante", "Diretoria"],
  ["Cozinha › Estante de canecas", "Cozinha"],
  ["Cozinha › Despensa", "Cozinha"],
  ["Almoxarifado › Barracas", "Almoxarifado"],
  ["Almoxarifado › Ferragens", "Almoxarifado"],
  ["Alcateia › Patrulha Lobo", "Alcateia"],
  ["Alcateia › Patrulha Pantera", "Alcateia"],
  ["Tropa Escoteira › Patrulha Águia", "Tropa Escoteira"],
  ["Tropa Escoteira › Patrulha Lince", "Tropa Escoteira"],
  ["Tropa Sênior › Equipe Falcão", "Tropa Sênior"],
  ["Tropa Sênior › Equipe Tigre", "Tropa Sênior"],
  ["Clã Pioneiro › Depósito", "Clã Pioneiro"],
  ["Clã Pioneiro › Oficina", "Clã Pioneiro"],
];

/** Categorias padrão (nome + código sequencial). */
const families = [
  ["Acampamento", "001"],
  ["Cozinha", "002"],
  ["Primeiros Socorros", "003"],
  ["Ferramentas", "004"],
  ["Cordas", "005"],
  ["Iluminação", "006"],
  ["Consumíveis", "007"],
  ["Uniforme e distintivos", "008"],
  ["Escritório", "009"],
  ["Limpeza", "010"],
  ["Esporte e jogos", "011"],
];

// Materiais pensados para a Home: cada dono (divisão principal) × status Bom / Médio / Ruim.
// Validades: vencida < 2026-11-17 · a vencer ≤ 60 dias · longe = 2027+.
const materials = [
  // name, category, tracking, consumable, minimum, description
  // —— Diretoria ——
  ["Pasta de atas", "Escritório", "lot", false, null, "Bom · Diretoria"],
  ["Toner impressora", "Escritório", "lot", true, 4, "Médio (abaixo do mínimo) · Diretoria"],
  ["Álcool em gel", "Limpeza", "lot", true, 2, "Ruim (vencido) · Diretoria"],
  ["Carimbo do grupo", "Escritório", "unit", false, null, "Bom · peça · Diretoria"],
  // —— Lobinho (Alcateia) ——
  ["Lenço de lobinho", "Uniforme e distintivos", "lot", false, null, "Bom · Lobinho"],
  ["Giz de cera", "Esporte e jogos", "lot", true, 20, "Médio (mínimo) · Lobinho"],
  ["Suco em pó", "Consumíveis", "lot", true, 5, "Ruim (vencido) · Lobinho"],
  ["Bandeira da matilha", "Uniforme e distintivos", "unit", false, 2, "Médio (abaixo do mínimo) · Lobinho"],
  // —— Escoteiro ——
  ["Estaca de barraca", "Acampamento", "lot", false, null, "Bom · Escoteiro"],
  ["Repelente tropa", "Consumíveis", "lot", true, 6, "Médio (a vencer) · Escoteiro"],
  ["Ração de emergência", "Consumíveis", "lot", true, 3, "Ruim (vencido) · Escoteiro"],
  ["Barraca iglu 4 pessoas", "Acampamento", "unit", false, null, "Bom · peças · Escoteiro"],
  ["Fogareiro a gás", "Acampamento", "unit", false, 3, "Médio (mínimo) · Escoteiro"],
  // —— Senior ——
  ["Corda estática 30m", "Cordas", "lot", false, null, "Bom · Senior"],
  ["Mosquetão HMS", "Cordas", "lot", false, 10, "Médio (mínimo) · Senior"],
  ["Gel energético", "Consumíveis", "lot", true, 8, "Ruim (vencido) · Senior"],
  ["Lampião a gás", "Iluminação", "unit", false, null, "Bom · Senior"],
  // —— Pioneiro ——
  ["Kit ferramentas", "Ferramentas", "lot", false, null, "Bom · Pioneiro"],
  ["Tinta esmalte", "Ferramentas", "lot", true, 3, "Médio (a vencer) · Pioneiro"],
  ["Cola madeira", "Ferramentas", "lot", true, 2, "Ruim (vencido) · Pioneiro"],
  ["Machadinha", "Ferramentas", "unit", false, null, "Bom · Pioneiro"],
  // —— Compartilhados / cozinha (dono Diretoria via Cozinha/Almox) ——
  ["Caneca de alumínio", "Cozinha", "lot", false, 40, "Médio (mínimo) · Diretoria/cozinha"],
  ["Prato fundo", "Cozinha", "lot", false, null, "Bom · Diretoria/cozinha"],
  ["Botijão de gás P13", "Cozinha", "lot", true, 2, "Bom · Diretoria/almox"],
  ["Kit primeiros socorros", "Primeiros Socorros", "lot", false, 5, "Médio (mínimo) · Diretoria"],
  ["Fita isolante", "Ferramentas", "lot", true, null, "Bom · vários"],
  ["Pilhas AA", "Consumíveis", "lot", true, 24, "Ruim (zerado) · Diretoria"],
];

const lots = [
  // material, path, qty, condition, cents, expires, origin
  // Diretoria
  ["Pasta de atas", "Diretoria › Armário de ferro", 5, "bom", 1500, null, "compra"],
  ["Toner impressora", "Diretoria › Estante", 2, "novo", 8900, null, "compra"], // mín 4 → médio
  ["Álcool em gel", "Diretoria › Estante", 6, "bom", 1200, "2026-09-01", "compra"], // vencido → ruim
  // Lobinho
  ["Lenço de lobinho", "Alcateia › Patrulha Lobo", 25, "bom", 3500, null, "compra"],
  ["Lenço de lobinho", "Alcateia › Patrulha Pantera", 10, "bom", 3500, null, "doacao"],
  ["Giz de cera", "Alcateia › Patrulha Lobo", 8, "regular", 400, null, "compra"], // mín 20 → médio
  ["Suco em pó", "Alcateia › Patrulha Pantera", 12, "bom", 250, "2026-10-15", "compra"], // vencido → ruim
  // Escoteiro
  ["Estaca de barraca", "Tropa Escoteira › Patrulha Águia", 40, "bom", 300, null, "compra"],
  ["Estaca de barraca", "Tropa Escoteira › Patrulha Lince", 20, "bom", 300, null, "compra"],
  ["Repelente tropa", "Tropa Escoteira › Patrulha Águia", 10, "bom", 1800, "2026-12-20", "compra"], // a vencer → médio
  ["Ração de emergência", "Tropa Escoteira › Patrulha Lince", 4, "bom", 2200, "2026-08-01", "compra"], // vencido → ruim
  // Senior
  ["Corda estática 30m", "Tropa Sênior › Equipe Falcão", 3, "bom", 28000, null, "compra"],
  ["Mosquetão HMS", "Tropa Sênior › Equipe Falcão", 4, "bom", 4500, null, "compra"], // mín 10 → médio
  ["Mosquetão HMS", "Tropa Sênior › Equipe Tigre", 2, "regular", 4000, null, "doacao"],
  ["Gel energético", "Tropa Sênior › Equipe Tigre", 2, "bom", 500, "2026-05-01", "compra"], // vencido → ruim
  // Pioneiro
  ["Kit ferramentas", "Clã Pioneiro › Oficina", 2, "bom", 15000, null, "compra"],
  ["Tinta esmalte", "Clã Pioneiro › Depósito", 5, "novo", 3200, "2027-01-05", "compra"], // a vencer → médio
  ["Cola madeira", "Clã Pioneiro › Oficina", 3, "bom", 1800, "2026-07-20", "compra"], // vencido → ruim
  // Compartilhados (Cozinha/Almox → dono Diretoria)
  ["Caneca de alumínio", "Cozinha › Estante de canecas", 30, "bom", 800, null, "compra"], // mín 40 → médio
  ["Caneca de alumínio", "Alcateia › Patrulha Lobo", 5, "regular", 500, null, "doacao"],
  ["Prato fundo", "Cozinha › Estante de canecas", 48, "bom", 1200, null, "compra"],
  ["Prato fundo", "Tropa Escoteira › Patrulha Águia", 8, "ruim", 400, null, "nao_informada"],
  ["Botijão de gás P13", "Cozinha › Despensa", 4, "bom", 12000, "2027-06-01", "compra"],
  ["Botijão de gás P13", "Almoxarifado › Ferragens", 1, "bom", 12000, "2027-08-01", "compra"],
  ["Kit primeiros socorros", "Diretoria › Armário de ferro", 2, "bom", 8500, null, "compra"], // total 4 < mín 5 → médio · Diretoria
  ["Kit primeiros socorros", "Tropa Escoteira › Patrulha Águia", 1, "bom", 8500, null, "compra"],
  ["Kit primeiros socorros", "Alcateia › Patrulha Lobo", 1, "regular", 6000, null, "doacao"],
  ["Fita isolante", "Almoxarifado › Ferragens", 12, "novo", 350, null, "compra"],
  ["Fita isolante", "Clã Pioneiro › Depósito", 3, "bom", 350, null, "compra"],
  ["Pilhas AA", "Diretoria › Estante", 10, "bom", 200, "2026-06-01", "compra"], // vencido → ruim · Diretoria
];

const units = [
  // material, path, tag, legacy, description, condition, cents, origin
  ["Carimbo do grupo", "Diretoria › Armário de ferro", null, "ADM-1", "carimbo redondo", "bom", 4500, "compra"],
  ["Bandeira da matilha", "Alcateia › Patrulha Lobo", null, "LOB-1", null, "bom", 8000, "fabricacao"], // 1 < mín 2 → médio
  ["Barraca iglu 4 pessoas", "Tropa Escoteira › Patrulha Águia", "GEAS-001-0001", "B1", "verde", "bom", 45000, "compra"],
  ["Barraca iglu 4 pessoas", "Tropa Escoteira › Patrulha Águia", "GEAS-001-0002", "B2", "azul", "regular", 38000, "compra"],
  ["Barraca iglu 4 pessoas", "Tropa Escoteira › Patrulha Lince", "GEAS-001-0003", "B3", null, "bom", 45000, "doacao"],
  ["Barraca iglu 4 pessoas", "Almoxarifado › Barracas", "GEAS-001-0004", "B4", "reserva", "bom", 45000, "compra"],
  ["Fogareiro a gás", "Tropa Escoteira › Patrulha Águia", "GEAS-001-0005", "F1", "completo", "bom", 15000, "compra"],
  ["Fogareiro a gás", "Tropa Escoteira › Patrulha Lince", "GEAS-001-0006", "F2", null, "bom", 15000, "compra"], // 2 < mín 3 → médio
  ["Lampião a gás", "Tropa Sênior › Equipe Falcão", "GEAS-006-0001", "L1", null, "bom", 22000, "compra"],
  ["Lampião a gás", "Tropa Sênior › Equipe Tigre", "GEAS-006-0002", "L2", "vidro trincado", "regular", 18000, "doacao"],
  ["Machadinha", "Clã Pioneiro › Oficina", "GEAS-004-0001", "M1", null, "bom", 9500, "compra"],
  ["Machadinha", "Clã Pioneiro › Depósito", "GEAS-004-0002", "M2", "cabo novo", "novo", 9500, "compra"],
];

const sql = [];
sql.push("begin;");
sql.push(`delete from public.inventory_movements where group_id = '${gid}';`);
sql.push(`delete from public.inventory_counts where group_id = '${gid}';`);
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
sql.push(`select set_config('request.jwt.claims', json_build_object('sub', '${admin}', 'role', 'authenticated')::text, true);`);
sql.push("set local role authenticated;");

for (const [name] of roots) {
  sql.push(`select public.inventory_save_location('${gid}', null, null, ${lit(name)}, null);`);
}
for (const [path, parentPath] of children) {
  const name = path.split(SEP).at(-1);
  sql.push(`select public.inventory_save_location('${gid}', null, ${pathId(parentPath)}, ${lit(name)}, null);`);
}
for (const [name, code] of families) {
  sql.push(`select public.inventory_save_family('${gid}', null, ${lit(name)}, ${lit(code)});`);
}
for (const [name, family, tracking, consumable, minimum, description] of materials) {
  sql.push(`select public.inventory_save_material(
    '${gid}', null, ${familyId(family)}, ${lit(name)}, ${lit(tracking)}::public.inventory_tracking,
    ${consumable}, ${minimum == null ? "null" : minimum}, ${lit(description)}, true
  );`);
}
for (const [material, path, qty, condition, cents, expires, origin] of lots) {
  sql.push(`select public.inventory_add_lot(
    ${materialId(material)}, ${pathId(path)}, ${qty}, ${lit(condition)}::public.inventory_condition,
    ${cents}, ${lit(expires)}::date, current_date, ${lit(origin)}::public.inventory_origin, null, null, null
  );`);
}
for (const [material, path, tag, legacy, description, condition, cents, origin] of units) {
  sql.push(`select public.inventory_add_unit(
    ${materialId(material)}, ${pathId(path)}, ${lit(tag)}, ${lit(legacy)}, ${lit(description)},
    ${lit(condition)}::public.inventory_condition, ${cents}, current_date,
    ${lit(origin)}::public.inventory_origin, null, null, null
  );`);
}
sql.push("commit;");

psql(sql.join("\n"));
const summary = query(`
  select
    (select count(*) from public.inventory_locations where group_id = '${gid}'),
    (select count(*) from public.inventory_families where group_id = '${gid}'),
    (select count(*) from public.inventory_materials where group_id = '${gid}'),
    (select count(*) from public.inventory_lots where group_id = '${gid}' and quantity > 0),
    (select count(*) from public.inventory_units where group_id = '${gid}' and written_off_at is null)
`);
const [locs, fams, mats, lotN, unitN] = summary.split("\t");
console.log(`Inventário de teste em “${gname}”:`);
console.log(`  ${locs} divisões · ${fams} categorias · ${mats} materiais · ${lotN} lotes · ${unitN} peças`);
console.log("Abra http://localhost:3002/materiais");
