#!/usr/bin/env node
// Converte a planilha de inventário do grupo ("Doc 31 – Inventário", uma aba por área) em duas tabelas simples:
//   inventario-lotes.csv  — um lote por linha (divisão › subdivisão, família, tipo, material, quantidades 2024–2026,
//                           quantidade atual, condição, validade, valor unitário, categoria, observação, estado original)
//   inventario-pecas.csv  — as barracas da aba BARRACAS (B1…), com etiqueta GEAS-001-0001…
// Regras em apps/inventario/docs/modelo.md ("Carga inicial"). Os CSV são dados do grupo: não versione.
//
// Uso: node apps/inventario/scripts/planilha-para-csv.mjs <planilha.xlsx> <pasta de saída>
import ExcelJS from "exceljs";
import fs from "node:fs";
const [, , xlsx, outDir] = process.argv;
if (!xlsx || !outDir) { console.error("Uso: node planilha-para-csv.mjs <planilha.xlsx> <pasta de saída>"); process.exit(1); }
const SHEETS = { "DIRETORIA": "Diretoria", "ALCATEIA": "Alcateia", "TROPA ESCOTEIRA": "Tropa Escoteira", "TROPA SÊNIOR": "Tropa Sênior", "CLÃ PIONEIRO": "Clã Pioneiro", "DISTINTIVOS E CERTIFICADOS": "Distintivos e certificados", "ALMOXARIFADO": "Almoxarifado", "COZINHA E DESPENSA": "Cozinha e despensa" };
const LOJINHA = new Set(["Lenços", "Camisetas", "Moletons"]);
const SUBDIVISION = { // subtítulos que viram mais de um nível
  "Estante de canecas (ver qual nível)": "Estante de canecas",
  "Estante de canecas 2º nível": "Estante de canecas › 2º nível",
  "Estante de canecas 3º nível": "Estante de canecas › 3º nível",
  "Estante de canecas nível superior": "Estante de canecas › Nível superior",
};
// condição: novo, bom, regular, ruim, manutencao, inservivel; "" = não se aplica (consumível aberto etc.)
const RULES = [
  [/^(não se aplica|0|aberta?s?|abertos?|pela metade|sacola cheia|médio)$/i, ""],
  [/(reforma|jovens vão costurar)/i, "manutencao"],
  [/(caixa quebrada|um pouco quebrad|remendad)/i, "regular"],
  [/(quebrad|estragad|inservível)/i, "inservivel"],
  [/\bru(im|ins)\b/i, "ruim"],
  [/^(nov[oa]s?|sem uso|fechad[oa]s?)\b/i, "novo"],
  [/^(bo[mn]s?|boas?|ok|completo|seminov\w*|ensacadas e lavadas|funciona)\b/i, "bom"],
  [/(usad|remendad|feio|desgast|regular|razoável|modelo antigo|antig|velh|sem bainha|caixa quebrada|descosturad|tampa solta|suj|só com|sem pegadores|s\/ panela|rasgad|precári|piscando|não fecha|mofo|curta|costuras|furos|a trocar|enferrujad)/i, "regular"],
];
const SIMPLE = /^(nov[oa]s?|bo[mn]s?|boas?|usad[oa]s?|regular|ruim|ruins|não se aplica|0|completo)$/i;
const text = (c) => {
  let v = c?.value;
  if (v == null) return "";
  if (typeof v === "object") v = v.richText ? v.richText.map((t) => t.text).join("") : v.result ?? v.text ?? "";
  return String(v).replace(/\s+/g, " ").trim();
};
const num = (s) => (s === "" || isNaN(Number(s)) ? "" : Number(s));
const condition = (estado) => {
  if (!estado || /^validade/i.test(estado)) return "";
  for (const [re, c] of RULES) if (re.test(estado)) return c;
  return "?";
};
function validity(estado) {
  const m = estado.match(/validade:?\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i);
  if (!m) return "";
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
// "2 ruins / 1 razoável/ 1 ok", "265 novos e 12 usados" → partes com quantidade própria
function splitParts(s) {
  const parts = [...s.matchAll(/(\d+)\s+([a-zà-ú]+)/gi)].map((m) => ({ q: Number(m[1]), estado: m[2] }));
  return parts.length >= 2 ? parts : null;
}
const esc = (v) => (/[";\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
const writeCsv = (file, rows) => {
  const cols = Object.keys(rows[0]);
  fs.writeFileSync(file, "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\n"));
};

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx);
  const lots = [], dropped = [], splits = [];
  for (const [sheet, division] of Object.entries(SHEETS)) {
    const ws = wb.getWorksheet(sheet);
    const head = {};
    ws.getRow(3).eachCell((c, col) => { if (!c.isMerged || c.master.address === c.address) head[text(c).toUpperCase()] = col; });
    const col = { qtd: head["QUANTIDADE"], estado: head["ESTADO"], cat: head["CATEGORIA"], valor: head["VALOR UNIT."], obs: head["OBSERVAÇÕES"] };
    let group = "";
    for (let r = 5; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const item = text(row.getCell(1));
      if (!item || /^(sub)?total/i.test(item)) continue;
      const [q24, q25, q26] = [0, 1, 2].map((i) => num(text(row.getCell(col.qtd + i))));
      const estado = text(row.getCell(col.estado));
      const valor = num(text(row.getCell(col.valor)));
      if ([q24, q25, q26].every((x) => x === "") && !estado && valor === "") { group = item; continue; }
      if (/a adquirir/i.test(estado)) { dropped.push(`${division} › ${item} (${estado})`); continue; }
      const lojinha = sheet === "DIRETORIA" && LOJINHA.has(group);
      const distintivo = sheet === "DISTINTIVOS E CERTIFICADOS";
      const familyGroup = lojinha || distintivo;
      const observacao = col.obs ? text(row.getCell(col.obs)) : "";
      const validade = validity(estado);
      const quantidade = q26 !== "" ? q26 : q25 !== "" ? q25 : q24;
      const base = {
        divisao: [division, familyGroup ? "" : SUBDIVISION[group] ?? group].filter(Boolean).join(" › "),
        familia: familyGroup ? group : "",
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
        splits.push(`${base.divisao} › ${item}: ${parts.map((p) => `${p.q} ${p.estado}`).join(" + ")}`);
        // As contagens anuais são do material na divisão: ficam só na primeira parte, para não somar em dobro.
        parts.forEach((p, i) => lots.push({ ...base, ...(i > 0 && { q2024: "", q2025: "", q2026: "" }), quantidade: p.q, condicao: condition(p.estado), observacao: [observacao, `${p.q} de ${quantidade} (${estado || observacao})`].filter(Boolean).join(" · ") }));
        continue;
      }
      const cond = condition(estado);
      const descriptive = estado && !validade && !SIMPLE.test(estado);
      lots.push({ ...base, condicao: cond, observacao: [descriptive ? estado : "", observacao].filter(Boolean).join(" · ") });
    }
  }

  // Barracas conferidas em 10/01/2026: peças com etiqueta (família Barracas = 001)
  const units = [];
  wb.getWorksheet("BARRACAS").eachRow((row) => {
    const m = text(row.getCell(1)).match(/^B(\d+)\s*-\s*(.+)$/);
    if (!m) return;
    const descricao = m[2].replace(/^Barrat?a\b/i, "Barraca");
    units.push({ etiqueta: `GEAS-001-${m[1].padStart(4, "0")}`, codigo_antigo: `B${m[1]}`, familia: "Barracas", descricao, condicao: "", divisao: "", conferida_em: "2026-01-10" });
  });

  writeCsv(`${outDir}/inventario-lotes.csv`, lots);
  writeCsv(`${outDir}/inventario-pecas.csv`, units);
  const by = (k) => Object.entries(lots.reduce((a, r) => ((a[r[k]] = (a[r[k]] || 0) + 1), a), {}));
  console.log("lotes:", lots.length, "| peças:", units.length, "| descartadas:", dropped.length);
  console.log("condição:", by("condicao").map(([k, v]) => `${k || "(vazio)"} ${v}`).join(" | "));
  console.log("tipo:", by("tipo").map(([k, v]) => `${k || "(patrimônio)"} ${v}`).join(" | "));
  console.log("quantidade 0:", lots.filter((l) => l.quantidade === 0).length, "| sem quantidade:", lots.filter((l) => l.quantidade === "").length);
  console.log("sem condição mapeada:", [...new Set(lots.filter((l) => l.condicao === "?").map((l) => l.estado_original))].join(" / ") || "nenhuma");
  console.log("divididos:\n  " + splits.join("\n  "));
  console.log("descartadas:\n  " + dropped.join("\n  "));
  console.log("peças:\n  " + units.map((u) => `${u.etiqueta} ${u.condicao || "-"} ${u.descricao}`).join("\n  "));
})();
