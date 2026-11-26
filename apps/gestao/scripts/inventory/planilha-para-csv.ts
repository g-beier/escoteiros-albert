// Converte a planilha de inventário do grupo ("Doc 31 – Inventário", uma aba por área) nos CSVs do contrato de
// importação (apps/gestao/docs/importacao.md), prontos para a tela /importar:
//   inventario-lotes.csv  — um lote por linha, com as contagens de 2024–2026
//   inventario-pecas.csv  — as barracas da aba BARRACAS (B1…), com etiqueta GEAS-001-0001…
// Regras em apps/gestao/docs/inventario/modelo.md ("Carga inicial"). Os CSV são dados do grupo: não versione.
// É uma referência de conversão; outras planilhas podem ser convertidas à mão ou com IA seguindo o contrato.
// No fim, os dois arquivos passam pela mesma leitura e pré-visualização da tela /importar (inventário vazio): erro
// lá = erro aqui (saída 1), antes de alguém tentar enviar.
//
// Uso: npm run inventory:csv --workspace=@geas/gestao -- <planilha.xlsx> <pasta de saída>
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { CONDITION_CHOICES } from "@/lib/import/contract";
import { planBatch } from "@/lib/import/plan";
import { readImportFile, writeImportCsv } from "@/lib/import/read";
import { EMPTY_STATE } from "@/lib/import/state";

// npm roda o script dentro de apps/gestao; caminhos relativos valem a partir de onde o comando foi digitado.
const base = process.env.INIT_CWD ?? process.cwd();
const [xlsxArg, outArg] = process.argv.slice(2);
if (!xlsxArg || !outArg) {
  console.error("Uso: npm run inventory:csv --workspace=@geas/gestao -- <planilha.xlsx> <pasta de saída>");
  process.exit(1);
}
const xlsx = path.resolve(base, xlsxArg);
const outDir = path.resolve(base, outArg);
if (!fs.existsSync(xlsx)) fail(`Planilha não encontrada: ${xlsx}`);
if (outDir.startsWith(path.resolve(import.meta.dirname, "../../..") + path.sep)) {
  console.warn(`Atenção: ${outDir} fica dentro do repositório. Os CSV são dados do grupo: não faça commit deles.`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const SHEETS: Record<string, string> = {
  "DIRETORIA": "Diretoria", "ALCATEIA": "Alcateia", "TROPA ESCOTEIRA": "Tropa Escoteira", "TROPA SÊNIOR": "Tropa Sênior",
  "CLÃ PIONEIRO": "Clã Pioneiro", "DISTINTIVOS E CERTIFICADOS": "Distintivos e certificados", "ALMOXARIFADO": "Almoxarifado",
  "COZINHA E DESPENSA": "Cozinha e despensa",
};
const UNITS_SHEET = "BARRACAS";
const HEADER_ROW = 3;
const FIRST_ROW = 5;
const LOJINHA = new Set(["Lenços", "Camisetas", "Moletons"]);
const SUBDIVISION: Record<string, string> = { // subtítulos que viram mais de um nível
  "Estante de canecas (ver qual nível)": "Estante de canecas",
  "Estante de canecas 2º nível": "Estante de canecas › 2º nível",
  "Estante de canecas 3º nível": "Estante de canecas › 3º nível",
  "Estante de canecas nível superior": "Estante de canecas › Nível superior",
};
// Condição (valor do contrato); "" = não se aplica (consumível aberto etc.), "?" = estado sem regra.
type Condition = "" | "?" | "novo" | "bom" | "regular" | "ruim" | "manutencao" | "inservivel";
const RULES: [RegExp, Condition][] = [
  [/^(não se aplica|0|aberta?s?|abertos?|pela metade|sacola cheia|médio)$/i, ""],
  [/(reforma|jovens vão costurar)/i, "manutencao"],
  [/(caixa quebrada|um pouco quebrad|remendad)/i, "regular"],
  [/(quebrad|estragad|inservível)/i, "inservivel"],
  [/\bru(im|ins)\b/i, "ruim"],
  [/^(nov[oa]s?|sem uso|fechad[oa]s?)\b/i, "novo"],
  [/^(bo[mn]s?|boas?|ok|completo|seminov\w*|ensacadas e lavadas|funciona)\b/i, "bom"],
  [/(usad|feio|desgast|regular|razoável|modelo antigo|antig|velh|sem bainha|descosturad|tampa solta|suj|só com|sem pegadores|s\/ panela|rasgad|precári|piscando|não fecha|mofo|curta|costuras|furos|a trocar|enferrujad)/i, "regular"],
];
const SIMPLE = /^(nov[oa]s?|bo[mn]s?|boas?|usad[oa]s?|regular|ruim|ruins|não se aplica|0|completo)$/i;

const text = (cell: ExcelJS.Cell | undefined) => {
  let v: unknown = cell?.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    v = o.richText ? o.richText.map((t) => t.text).join("") : o.result ?? o.text ?? "";
  }
  return String(v).replace(/\s+/g, " ").trim();
};
const num = (s: string): number | "" => (s === "" || isNaN(Number(s)) ? "" : Number(s));
const condition = (estado: string): Condition => {
  if (!estado || /^validade/i.test(estado)) return "";
  for (const [re, c] of RULES) if (re.test(estado)) return c;
  return "?";
};
const conditionLabel = (c: Condition) => (c === "" || c === "?" ? "" : CONDITION_CHOICES.find((x) => x.value === c)!.label);
/** "validade: 31.8.27" → "31/08/2027" (formato do contrato). */
function validity(estado: string) {
  const m = estado.match(/validade:?\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i);
  if (!m) return "";
  return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${m[3]!.length === 2 ? `20${m[3]}` : m[3]}`;
}
// "2 ruins / 1 razoável/ 1 ok", "265 novos e 12 usados" → partes com quantidade própria
function splitParts(s: string) {
  const parts = [...s.matchAll(/(\d+)\s+([a-zà-ú]+)/gi)].map((m) => ({ q: Number(m[1]), estado: m[2]! }));
  return parts.length >= 2 ? parts : null;
}

type Lot = {
  divisao: string; familia: string; tipo: "" | "lojinha" | "entrega" | "consumivel"; material: string;
  quantidade: number | ""; q2024: number | ""; q2025: number | ""; q2026: number | "";
  condicao: Condition; validade: string; valor_unitario: number | ""; categoria: string; observacao: string; estado_original: string;
};

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx);
  const sheetNames = wb.worksheets.map((ws) => ws.name);
  const missing = [...Object.keys(SHEETS), UNITS_SHEET].filter((name) => !wb.getWorksheet(name));
  if (missing.length) fail(`Abas não encontradas: ${missing.join(", ")}.\nAbas da planilha: ${sheetNames.join(", ")}`);
  const ignored = sheetNames.filter((name) => !(name in SHEETS) && name !== UNITS_SHEET);

  const lots: Lot[] = [], dropped: string[] = [], splits: string[] = [];
  for (const [sheet, division] of Object.entries(SHEETS)) {
    const ws = wb.getWorksheet(sheet)!;
    const head: Record<string, number> = {};
    ws.getRow(HEADER_ROW).eachCell((c, col) => { if (!c.isMerged || c.master.address === c.address) head[text(c).toUpperCase()] = col; });
    const col = { qtd: head["QUANTIDADE"], estado: head["ESTADO"], cat: head["CATEGORIA"], valor: head["VALOR UNIT."], obs: head["OBSERVAÇÕES"] };
    const absent = (["qtd", "estado", "valor"] as const).filter((k) => !col[k]);
    if (absent.length) fail(`Aba ${sheet}: cabeçalho da linha ${HEADER_ROW} sem ${absent.map((k) => ({ qtd: "QUANTIDADE", estado: "ESTADO", valor: "VALOR UNIT." })[k]).join(", ")} (achei: ${Object.keys(head).join(", ")}).`);
    let group = "";
    for (let r = FIRST_ROW; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const item = text(row.getCell(1));
      if (!item || /^(sub)?total/i.test(item)) continue;
      const [q24, q25, q26] = [0, 1, 2].map((i) => num(text(row.getCell(col.qtd! + i)))) as [number | "", number | "", number | ""];
      const estado = text(row.getCell(col.estado!));
      const valor = num(text(row.getCell(col.valor!)));
      if ([q24, q25, q26].every((x) => x === "") && !estado && valor === "") { group = item; continue; }
      if (/a adquirir/i.test(estado)) { dropped.push(`${division} › ${item} (${estado})`); continue; }
      const lojinha = sheet === "DIRETORIA" && LOJINHA.has(group);
      const distintivo = sheet === "DISTINTIVOS E CERTIFICADOS";
      const observacao = col.obs ? text(row.getCell(col.obs)) : "";
      const validade = validity(estado);
      const quantidade = q26 !== "" ? q26 : q25 !== "" ? q25 : q24;
      const lot: Lot = {
        // Todo subtítulo vira subdivisão (inclusive Lenços, Camisetas, Moletons e os grupos de distintivos); família fica vazia.
        divisao: [division, SUBDIVISION[group] ?? group].filter(Boolean).join(" › "),
        familia: "",
        tipo: lojinha ? "lojinha" : distintivo ? "entrega" : validade ? "consumivel" : "",
        material: item,
        quantidade, q2024: q24, q2025: q25, q2026: q26,
        condicao: "", validade, valor_unitario: valor,
        categoria: col.cat ? text(row.getCell(col.cat)) : "",
        observacao, estado_original: estado,
      };
      // estado ou observação com contagens por condição → um lote por parte
      const parts = splitParts(estado) ?? (/(nov|usad|bo[mn]s?|ruim)/i.test(observacao) ? splitParts(observacao) : null);
      if (parts && parts.every((p) => condition(p.estado) !== "?") && parts.reduce((s, p) => s + p.q, 0) === quantidade) {
        splits.push(`${lot.divisao} › ${item}: ${parts.map((p) => `${p.q} ${p.estado}`).join(" + ")}`);
        // As contagens anuais são do material na divisão (a importação soma as linhas): ficam só na primeira parte.
        parts.forEach((p, i) => lots.push({
          ...lot, ...(i > 0 && { q2024: "", q2025: "", q2026: "" }), quantidade: p.q, condicao: condition(p.estado),
          observacao: [observacao, `${p.q} de ${quantidade} (${estado || observacao})`].filter(Boolean).join(" · "),
        }));
        continue;
      }
      const descriptive = estado && !validade && !SIMPLE.test(estado);
      lots.push({ ...lot, condicao: condition(estado), observacao: [descriptive ? estado : "", observacao].filter(Boolean).join(" · ") });
    }
  }

  // Barracas conferidas em 10/01/2026: peças com etiqueta (família Barracas = 001)
  const units: { etiqueta: string; codigo_antigo: string; descricao: string }[] = [];
  wb.getWorksheet(UNITS_SHEET)!.eachRow((row) => {
    const m = text(row.getCell(1)).match(/^B(\d+)\s*-\s*(.+)$/);
    if (!m) return;
    units.push({ etiqueta: `GEAS-001-${m[1]!.padStart(4, "0")}`, codigo_antigo: `B${m[1]}`, descricao: m[2]!.replace(/^Barrat?a\b/i, "Barraca") });
  });
  if (!lots.length) fail("Nenhum lote lido: confira as abas e a linha do cabeçalho.");

  // Formato do contrato (docs/importacao.md). Consumível vale para o material todo; linhas com a mesma chave de lote
  // (material, divisão, condição, validade) mas observação ou valor diferentes ganham uma variação, para não somarem.
  const consumable = new Set(lots.filter((l) => l.tipo === "consumivel").map((l) => l.material.toLowerCase()));
  const lotNotes = (l: Lot) => [l.observacao, l.categoria ? `Categoria: ${l.categoria}` : ""].filter(Boolean).join(" · ").slice(0, 500);
  const lotKey = (l: Lot) => [l.material.toLowerCase(), l.divisao, l.condicao, l.validade].join("|");
  const sameKey = new Map<string, Lot[]>();
  for (const l of lots) sameKey.set(lotKey(l), [...(sameKey.get(lotKey(l)) ?? []), l]);
  const variantOf = (l: Lot) => {
    const rows = sameKey.get(lotKey(l))!;
    if (new Set(rows.map((r) => `${lotNotes(r)}|${r.valor_unitario}`)).size < 2) return "";
    const notesDiffer = new Set(rows.map(lotNotes)).size > 1;
    return (notesDiffer ? lotNotes(l) || "sem observação" : `valor ${l.valor_unitario || "não informado"}`).slice(0, 80);
  };
  const money = (v: number | "") => (v === "" ? "" : v.toFixed(2).replace(".", ","));

  const LOT_HEADER = ["divisão", "família código", "família", "material", "descrição do material", "consumível", "mínimo", "quantidade", "condição", "validade", "valor unitário", "variação", "observação", "contagem 2024", "contagem 2025", "contagem 2026"];
  const UNIT_HEADER = ["etiqueta", "código antigo", "material", "família código", "família", "divisão", "condição", "descrição", "valor", "observação"];
  const files = {
    "inventario-lotes.csv": writeImportCsv(LOT_HEADER, lots.map((l) => [
      l.divisao, "", l.familia, l.material, "", consumable.has(l.material.toLowerCase()) ? "sim" : "não", "", l.quantidade,
      conditionLabel(l.condicao), l.validade, money(l.valor_unitario), variantOf(l), lotNotes(l), l.q2024, l.q2025, l.q2026,
    ])),
    "inventario-pecas.csv": writeImportCsv(UNIT_HEADER, units.map((u) => [
      u.etiqueta, u.codigo_antigo, "Barraca etiquetada", "001", "Barracas", "Almoxarifado › Barracas (a conferir)", "", u.descricao, "", "Conferida em 10/01/2026.",
    ])),
  };
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, csv] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), csv);

  const by = (k: "condicao" | "tipo") => Object.entries(lots.reduce<Record<string, number>>((a, r) => ((a[r[k]] = (a[r[k]] ?? 0) + 1), a), {}));
  console.log("lotes:", lots.length, "| peças:", units.length, "| descartadas (a adquirir):", dropped.length);
  console.log("condição:", by("condicao").map(([k, v]) => `${conditionLabel(k as Condition) || (k === "?" ? "?" : "(vazio)")} ${v}`).join(" | "));
  console.log("tipo:", by("tipo").map(([k, v]) => `${k || "(patrimônio)"} ${v}`).join(" | "));
  console.log("quantidade 0 (só contagens):", lots.filter((l) => l.quantidade === 0).length, "| sem quantidade:", lots.filter((l) => l.quantidade === "").length);
  if (ignored.length) console.log("abas ignoradas:", ignored.join(", "));
  const unmapped = [...new Set(lots.filter((l) => l.condicao === "?").map((l) => l.estado_original))];
  if (unmapped.length) console.log("sem condição mapeada (vão sem condição, estado na observação):\n  " + unmapped.join("\n  "));
  if (splits.length) console.log("divididos por condição:\n  " + splits.join("\n  "));
  if (dropped.length) console.log("descartadas:\n  " + dropped.join("\n  "));

  // Mesma leitura e pré-visualização da tela /importar, contra um inventário vazio.
  const read = Object.entries(files).map(([name, csv]) => {
    const result = readImportFile(name, csv);
    if (!result.file) fail(`${name}: ${result.error}`);
    return result.file;
  });
  const plan = planBatch(read, EMPTY_STATE, { filhotes: false, today: new Date().toISOString().slice(0, 10) });
  const problems = [
    ...plan.errors,
    ...read.flatMap((f) => f.warnings.map((w) => `${f.name}: ${w}`)),
    ...plan.files.flatMap((f) => f.rows.filter((r) => r.errors.length).map((r) => `${f.name}, linha ${r.line} (${r.label}): ${r.errors.join("; ")}`)),
  ];
  console.log(`\nPré-visualização (/importar): ${plan.files.map((f) => `${f.name} ${f.rows.length - f.rows.filter((r) => r.errors.length).length}/${f.rows.length} linhas ok`).join(" | ")}`);
  for (const f of plan.files) for (const c of f.creations) console.log(`  ${f.name}: cria ${c}`);
  if (problems.length) fail(`${problems.length} problema(s) que a tela /importar recusaria:\n  ${problems.join("\n  ")}`);
  console.log(`\nPronto: ${outDir}/inventario-lotes.csv e inventario-pecas.csv. Envie os dois juntos em /importar.`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
