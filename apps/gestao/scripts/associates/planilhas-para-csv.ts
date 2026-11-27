// Converte as planilhas de associados do grupo nos CSVs do contrato de importação (apps/gestao/docs/importacao.md),
// prontos para a tela /importar:
//   pessoas.csv       — Doc 10 (aba Paxtu: ramo, seção, registro) + Doc 13 (nascimento) + Doc 14 (promessa)
//   funcoes.csv       — Doc 10 (escotistas de cada seção, diretoria com eleitos em negrito, outros) + Doc 22 (cores
//                       da aba Dirigentes: comissão fiscal, honorífico, outros)
//   responsaveis.csv  — Doc 10 (aba Familiares: `*` = outro parentesco, não responsável legal; fundo azul = associado)
//   controle.csv      — Doc 22 (abas Escotistas, Dirigentes, Jovens e seus familiares, Integrações, Vamos Falar)
// Seção = o ramo, com nome "solto" (Alcateia, Tropa Escoteira, Tropa Sênior, Clã Pioneiro, Ninhada).
//
// As planilhas têm dados pessoais de menores: o resumo no terminal mostra só contagens e a posição na planilha
// (arquivo, aba, linha). `--detalhes` acrescenta os nomes. Os CSV são dados do grupo: não versione.
// No fim, os arquivos passam pela mesma leitura e pré-visualização da tela /importar (banco vazio, itens de controle
// padrão): erro lá = erro aqui (saída 1).
//
// Uso: npm run associates:csv --workspace=@geas/gestao -- <pasta com os Docs 10, 13, 14 e 22> <pasta de saída> [--detalhes]
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { CONTROL_STATUS_CHOICES } from "@/lib/import/contract";
import { planBatch } from "@/lib/import/plan";
import { readImportFile, writeImportCsv } from "@/lib/import/read";
import { EMPTY_STATE, type StateItem } from "@/lib/import/state";
import { parseControlCell } from "@/lib/import/values";

const base = process.env.INIT_CWD ?? process.cwd();
const args = process.argv.slice(2);
const details = args.includes("--detalhes");
const [dirArg, outArg] = args.filter((a) => !a.startsWith("--"));
if (!dirArg || !outArg)
  fail(
    "Uso: npm run associates:csv --workspace=@geas/gestao -- <pasta com os Docs 10, 13, 14 e 22> <pasta de saída> [--detalhes]",
  );
const inDir = path.resolve(base, dirArg);
const outDir = path.resolve(base, outArg);
if (outDir.startsWith(path.resolve(import.meta.dirname, "../../..") + path.sep)) {
  console.warn(`Atenção: ${outDir} fica dentro do repositório. Os CSV têm dados de menores: não faça commit deles.`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Planilhas ---------------------------------------------------------------------------------------------------------

/** O .xlsx do Doc N na pasta (o atual antes do BACKUP). */
function findDoc(n: number) {
  if (!fs.existsSync(inDir)) fail(`Pasta não encontrada: ${inDir}`);
  const files = fs
    .readdirSync(inDir)
    .filter((f) => new RegExp(`^Doc ${n}\\b.*\\.xlsx$`, "i").test(f) && !f.startsWith("~$"));
  const file = files.find((f) => !/backup/i.test(f)) ?? files[0];
  if (!file) fail(`Não achei o Doc ${n} (.xlsx) em ${inDir}. Exporte do Google Sheets como .xlsx para essa pasta.`);
  return path.join(inDir, file);
}

async function open(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

function sheet(wb: ExcelJS.Workbook, file: string, name: string) {
  const ws = wb.worksheets.find((w) => key(w.name) === key(name));
  if (!ws)
    fail(
      `${path.basename(file)}: aba "${name}" não encontrada (abas: ${wb.worksheets.map((w) => w.name).join(", ")}).`,
    );
  return ws;
}

type CellValue = { text: string; date?: Date; number?: number };
function value(cell: ExcelJS.Cell | undefined): CellValue {
  let v: unknown = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    v = o.richText ? o.richText.map((t) => t.text).join("") : (o.result ?? o.text ?? null);
  }
  if (v == null) return { text: "" };
  if (v instanceof Date) return { text: showDate(v), date: v };
  if (typeof v === "number") return { text: String(v), number: v };
  return { text: String(v).replace(/\s+/g, " ").trim() };
}
/** Só a célula principal de um bloco mesclado. */
const master = (cell: ExcelJS.Cell) => !cell.isMerged || cell.master.address === cell.address;
const pad = (n: number) => String(n).padStart(2, "0");
const showDate = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
/** "21/02/2012", "31.10.27" → "21/02/2012"; senão "". */
function textDate(text: string) {
  const m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return "";
  return `${pad(Number(m[1]))}/${pad(Number(m[2]))}/${m[3]!.length === 2 ? `20${m[3]}` : m[3]}`;
}
const cellDate = (c: CellValue) => (c.date ? showDate(c.date) : textDate(c.text));
const bold = (cell: ExcelJS.Cell) => Boolean(cell.font?.bold);
const fillArgb = (cell: ExcelJS.Cell) =>
  (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb?.slice(-6).toUpperCase();
const fillTheme = (cell: ExcelJS.Cell) => (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.theme;

/** Chave de comparação: sem acento, minúsculas, só letras, números e espaços simples. */
function key(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const personName = (text: string) => text.replace(/\*+\s*$/, "").trim();

// Relatório ---------------------------------------------------------------------------------------------------------

const notes = new Map<string, string[]>();
/** Anota um caso para o resumo; `where` = arquivo, aba e linha; `name` só aparece com --detalhes. */
function note(topic: string, where: string, name?: string) {
  notes.set(topic, [...(notes.get(topic) ?? []), details && name ? `${where}: ${name}` : where]);
}

// Pessoas: Doc 10 ---------------------------------------------------------------------------------------------------

type Branch = "filhote" | "lobinho" | "escoteiro" | "senior" | "pioneiro";
const BRANCHES: Record<string, { branch: Branch; label: string; section: string }> = {
  ninhada: { branch: "filhote", label: "filhote", section: "Ninhada" },
  alcateia: { branch: "lobinho", label: "lobinho", section: "Alcateia" },
  "tropa escoteira": { branch: "escoteiro", label: "escoteiro", section: "Tropa Escoteira" },
  "tropa senior": { branch: "senior", label: "sênior", section: "Tropa Sênior" },
  "cla pioneiro": { branch: "pioneiro", label: "pioneiro", section: "Clã Pioneiro" },
};
const branchOf = (heading: string) =>
  BRANCHES[
    key(heading)
      .replace(/\s*\d.*$/, "")
      .trim()
  ];

type Person = {
  name: string;
  youth: boolean;
  branch?: (typeof BRANCHES)[string];
  registration: "definitivo" | "provisório";
  birth?: string;
  promise?: string;
  where: string;
};
type FunctionRow = { person: string; kind: string; section?: string; elected?: boolean };
const people = new Map<string, Person>();
const functions: FunctionRow[] = [];

function addPerson(raw: string, data: Omit<Person, "name">) {
  const name = personName(raw);
  const k = key(name);
  const current = people.get(k);
  if (!current) {
    people.set(k, { name, ...data });
    return;
  }
  if (current.youth !== data.youth || (data.youth && current.branch !== data.branch))
    note("Doc 10: pessoa em dois blocos (vale o primeiro)", data.where, name);
}

/**
 * Procura a pessoa pelo nome exato (sem acento, maiúsculas nem pontuação). Nome parecido não casa: "Ana Souza" e
 * "Ana Lima Souza" podem ser pessoas diferentes (irmãs, por exemplo); o resumo aponta o parecido para conferir a grafia.
 */
function findPerson(raw: string, where: string): Person | undefined {
  const name = personName(raw);
  const exact = people.get(key(name));
  if (exact) return exact;
  const words = key(name).split(" ");
  const near = [...people.values()].filter((p) => {
    const other = key(p.name).split(" ");
    if (other[0] !== words[0] || other.at(-1) !== words.at(-1)) return false;
    const [small, big] = other.length < words.length ? [other, words] : [words, other];
    return small.every((w) => big.includes(w));
  });
  if (near.length)
    note(
      "nome parecido com alguém do Doc 10 (não casado; se for a mesma pessoa, iguale a grafia)",
      where,
      `${name} ~ ${near.map((p) => p.name).join(" / ")}`,
    );
  return undefined;
}

async function readDoc10(file: string) {
  const wb = await open(file);
  const doc = path.basename(file).slice(0, 6);
  const paxtu = sheet(wb, file, "Paxtu");
  let mode: "branch" | "diretoria" | "outros" | "" = "";
  let branch: (typeof BRANCHES)[string] | undefined;
  let registration: Person["registration"] = "definitivo";
  const outros: { name: string; bold: boolean; where: string }[] = [];
  paxtu.eachRow((row, r) => {
    const a = row.getCell(1),
      g = row.getCell(7);
    const at = value(a).text,
      gt = value(g).text;
    const where = `${doc} Paxtu linha ${r}`;
    const heading = branchOf(at);
    if (heading) {
      mode = "branch";
      branch = heading;
      registration = "definitivo";
      return;
    }
    if (key(at) === "diretoria") {
      mode = "diretoria";
      return;
    }
    if (key(at) === "outros") {
      mode = "outros";
      return;
    }
    if (/^total/i.test(at)) {
      mode = "";
      return;
    }
    if (/^jovens/i.test(gt)) registration = /provis/i.test(gt) ? "provisório" : "definitivo";
    const names = (
      [
        [a, at, true],
        [g, gt, false],
      ] as const
    ).filter(([c, t]) => t && master(c) && !/^(adultos|jovens|total)/i.test(t) && !/^\d+$/.test(t));
    for (const [cell, text, left] of names) {
      if (mode === "branch" && branch) {
        if (left) {
          addPerson(text, { youth: false, registration: "definitivo", where });
          functions.push({ person: personName(text), kind: "escotista", section: branch.section });
        } else addPerson(text, { youth: true, branch, registration, where });
      } else if (mode === "diretoria") {
        addPerson(text, { youth: false, registration: "definitivo", where });
        functions.push({ person: personName(text), kind: "dirigente", elected: bold(cell) });
      } else if (mode === "outros") {
        addPerson(text, { youth: false, registration: "definitivo", where });
        outros.push({ name: personName(text), bold: bold(cell), where });
      }
    }
  });
  if (!people.size)
    fail(`${doc}: nenhuma pessoa lida na aba Paxtu (confira os títulos dos blocos: ALCATEIA, TROPA ESCOTEIRA…).`);

  // Familiares: jovem na coluna A, familiares na F (uma linha cada), "Ver X" na L.
  const relatives: { youth: Person; name: string; star: boolean; associate: boolean; where: string }[] = [];
  let youth: Person | undefined;
  let inBlock = false; // só depois do primeiro título de ramo (antes vêm os títulos do documento)
  sheet(wb, file, "Familiares").eachRow((row, r) => {
    const a = row.getCell(1),
      f = row.getCell(6);
    const at = value(a).text,
      ft = value(f).text;
    const where = `${doc} Familiares linha ${r}`;
    if (branchOf(at)) inBlock = true;
    if (!inBlock) return;
    if (branchOf(at) || /^jovens$/i.test(at)) {
      youth = undefined;
      return;
    }
    if (at && master(a)) {
      youth = findPerson(at, where);
      if (!youth) note("Doc 10 Familiares: jovem que não está na aba Paxtu (familiares dele ficam de fora)", where, at);
      else if (!youth.youth) {
        note("Doc 10 Familiares: nome da coluna de jovens é adulto na aba Paxtu", where, at);
        youth = undefined;
      }
    }
    if (!ft || !master(f) || ft.startsWith("*") || /^pais/i.test(ft) || !youth) return;
    relatives.push({ youth, name: personName(ft), star: /\*\s*$/.test(ft), associate: fillTheme(f) === 8, where });
  });
  return { outros, relatives };
}

// Nascimento (Doc 13) e promessa (Doc 14) -----------------------------------------------------------------------------

async function readDoc13(file: string) {
  const wb = await open(file);
  const doc = path.basename(file).slice(0, 6);
  const ws = wb.worksheets[0]!;
  let count = 0;
  ws.eachRow((row, r) => {
    const name = value(row.getCell(1)).text;
    const birth = cellDate(value(row.getCell(6)));
    if (!name || !birth) return;
    const where = `${doc} ${ws.name} linha ${r}`;
    const person = findPerson(name, where);
    if (!person) {
      note("Doc 13: jovem que não está no Doc 10 (nascimento ignorado)", where, name);
      return;
    }
    person.birth = birth;
    count++;
  });
  return count;
}

async function readDoc14(file: string) {
  const wb = await open(file);
  const doc = path.basename(file).slice(0, 6);
  const ws = wb.worksheets[0]!;
  let count = 0;
  ws.eachRow((row, r) => {
    for (const [nameCol, dateCol] of [
      [1, 6],
      [7, 12],
    ] as const) {
      const name = value(row.getCell(nameCol)).text;
      const date = cellDate(value(row.getCell(dateCol)));
      if (!name || !date) continue;
      const where = `${doc} ${ws.name} linha ${r}`;
      const person = findPerson(name, where);
      if (!person) {
        note("Doc 14: pessoa que não está no Doc 10 (promessa ignorada)", where, name);
        continue;
      }
      person.promise = date;
      count++;
    }
  });
  return count;
}

// Controle (Doc 22) -------------------------------------------------------------------------------------------------

type Audience = "jovem" | "adulto" | "responsavel";
// Espelho dos itens padrão (seed do Doc 22 em db/migrations/001_schema.sql): nome, valor e a quem se aplica. Só serve
// para escolher as células e conferir aqui; a tela /importar confere de novo com os itens do banco.
const ITEMS: { name: string; valueKind: "situacao" | "ano" | "data"; audiences: Audience[]; aliases?: string[] }[] = [
  {
    name: "Ficha de associação",
    valueKind: "situacao",
    audiences: ["jovem", "adulto"],
    aliases: ["Ficha de inscrição"],
  },
  {
    name: "Certificado de eleição/nomeação",
    valueKind: "situacao",
    audiences: ["adulto"],
    aliases: ["Certificado eleição/ nomeação"],
  },
  { name: "ATV", valueKind: "situacao", audiences: ["adulto"] },
  { name: "PPF", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Seções no Paxtu", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Equipes no Paxtu", valueKind: "situacao", audiences: ["jovem"] },
  { name: "Ficha de aptidão", valueKind: "situacao", audiences: ["adulto", "responsavel"] },
  { name: "Google Drive", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Calendário", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Curso de brigadista", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Promessa de adulto", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Início do estágio", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Integração", valueKind: "situacao", audiences: ["jovem", "adulto"] },
  { name: "Palestra Vamos Falar de Escotismo", valueKind: "situacao", audiences: ["jovem", "adulto"] },
  { name: "Dados individuais no Paxtu", valueKind: "situacao", audiences: ["jovem", "adulto", "responsavel"] },
  { name: "Ficha médica impressa", valueKind: "situacao", audiences: ["jovem", "adulto"] },
  {
    name: "Autorização de viagem (cartório)",
    valueKind: "situacao",
    audiences: ["jovem"],
    aliases: ["Autoriz. viagem cartório"],
  },
  { name: "Termo de consentimento", valueKind: "situacao", audiences: ["jovem"], aliases: ["Termo de consentim."] },
  { name: "Login no Paxtu", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Ano-base do registro", valueKind: "ano", audiences: ["jovem", "adulto"] },
  { name: "Validade do registro", valueKind: "data", audiences: ["jovem", "adulto"] },
  { name: "Contatos no e-mail do GEAS", valueKind: "situacao", audiences: ["jovem", "adulto", "responsavel"] },
  { name: "Lista de e-mails Adultos GEAS", valueKind: "situacao", audiences: ["adulto"] },
  { name: "Instagram do GEAS", valueKind: "situacao", audiences: ["jovem", "adulto", "responsavel"] },
  { name: "Twitter do GEAS", valueKind: "situacao", audiences: ["jovem", "adulto", "responsavel"] },
  { name: "WhatsApp GEAS Brothers", valueKind: "situacao", audiences: ["adulto"] },
  { name: "WhatsApp Só Avisos", valueKind: "situacao", audiences: ["adulto", "responsavel"] },
  { name: "Site", valueKind: "situacao", audiences: ["adulto"] },
];
const ITEM_BY_HEADER = new Map(
  ITEMS.flatMap((item) => [item.name, ...(item.aliases ?? [])].map((h) => [key(h), item] as const)),
);
// Legendas e títulos que aparecem na coluna de nomes do Doc 22.
const LEGEND =
  /^(escotistas|dirigentes|jovens|alcateia|tropa|cla |ninhada|dir eleito|dir nomeado|comissao fiscal|honorifico|outros|nao necessario|nao se aplica)/;

type ControlRow = { audience: Audience; person: string; youth?: string; cells: Map<string, string>; where: string };
const controls: ControlRow[] = [];

/** Célula do Doc 22 → texto aceito pela importação (situação, ano, data, situação + data, ` - ` observação). */
function controlText(c: CellValue, valueKind: string): string {
  if (c.date) return valueKind === "data" ? showDate(c.date) : `ok ${showDate(c.date)}`;
  const text = c.text;
  if (valueKind === "data" && textDate(text)) return textDate(text);
  if (!parseControlCell(text, valueKind, CONTROL_STATUS_CHOICES).error) return text;
  const [first, ...rest] = text.split(" ");
  if (rest.length && !parseControlCell(first!, valueKind, CONTROL_STATUS_CHOICES).error)
    return `${first} - ${rest.join(" ")}`.slice(0, 200);
  return `a verificar - ${text}`.slice(0, 200);
}

async function readDoc22(file: string, relativesOf: Map<string, { youth: Person; associate: boolean }[]>) {
  const wb = await open(file);
  const doc = path.basename(file).slice(0, 6);
  // nameCol: coluna dos nomes; relativeCol: coluna dos familiares (aba de jovens); audience: público das linhas.
  const SHEETS: { name: string; nameCol: number; relativeCol?: number; audience: Audience | "responsavel-solto" }[] = [
    { name: "Escotistas", nameCol: 1, audience: "adulto" },
    { name: "Dirigentes", nameCol: 1, audience: "adulto" },
    { name: "Jovens e seus familiares", nameCol: 1, relativeCol: 2, audience: "jovem" },
    { name: "Integrações e estágios adultos", nameCol: 2, audience: "adulto" },
    { name: "Integrações jovens", nameCol: 2, audience: "jovem" },
    { name: "Vamos Falar de Escotismo", nameCol: 2, audience: "responsavel-solto" },
  ];
  const kinds = new Map<string, string>(); // fundo da aba Dirigentes → tipo de função
  for (const spec of SHEETS) {
    const ws = wb.worksheets.find((w) => key(w.name) === key(spec.name));
    if (!ws) {
      note("Doc 22: aba não encontrada (ignorada)", `${doc} ${spec.name}`);
      continue;
    }
    let columns = new Map<number, (typeof ITEMS)[number]>();
    let youth: Person | undefined;
    ws.eachRow((row, r) => {
      const where = `${doc} ${ws.name} linha ${r}`;
      // Linha de cabeçalho: três ou mais itens conhecidos.
      const header = new Map<number, (typeof ITEMS)[number]>();
      row.eachCell((cell, col) => {
        const item = ITEM_BY_HEADER.get(key(value(cell).text));
        if (item && master(cell)) header.set(col, item);
      });
      if (header.size >= 3 || (header.size && !columns.size)) {
        columns = header;
        return;
      }
      if (!columns.size) return; // títulos do documento, antes do primeiro cabeçalho
      const nameCell = row.getCell(spec.nameCol);
      const raw = master(nameCell) ? value(nameCell).text : "";
      const relativeCell = spec.relativeCol ? row.getCell(spec.relativeCol) : undefined;
      const relativeRaw = relativeCell && master(relativeCell) ? value(relativeCell).text : "";
      const name = raw || relativeRaw;
      if (!name || LEGEND.test(key(name)) || name.startsWith("*")) return;
      const cells = new Map<string, string>();
      for (const [col, item] of columns) {
        const c = value(row.getCell(col));
        if (c.text) cells.set(item.name, controlText(c, item.valueKind));
      }
      if (spec.name === "Dirigentes" && raw) {
        const kind = { C6D9F0: "comissão fiscal", FFCC99: "honorífico", EAD1DC: "colaborador" }[
          fillArgb(nameCell) ?? ""
        ];
        if (kind) kinds.set(key(personName(raw)), kind);
      }
      if (raw && spec.audience === "responsavel-solto") {
        // Vamos Falar de Escotismo: familiares sem o jovem ao lado (procurados no Doc 10 Familiares); associados valem como eles.
        const person = people.get(key(personName(raw)));
        if (person) {
          controls.push({ audience: person.youth ? "jovem" : "adulto", person: person.name, cells, where });
          return;
        }
        const links = relativesOf.get(key(personName(raw)));
        if (!links) {
          note("Doc 22: familiar que não está no Doc 10 Familiares (linha ignorada)", where, raw);
          return;
        }
        if (links.some((l) => l.associate)) {
          note("Doc 22: familiar associado (controlado na linha dele de adulto; linha ignorada)", where, raw);
          return;
        }
        controls.push({ audience: "responsavel", person: personName(raw), youth: links[0]!.youth.name, cells, where });
        return;
      }
      if (raw) {
        const person = findPerson(raw, where);
        if (spec.relativeCol) youth = person?.youth ? person : undefined;
        if (!person) {
          note("Doc 22: pessoa que não está no Doc 10 (linha ignorada)", where, raw);
          return;
        }
        const audience = person.youth ? "jovem" : "adulto";
        if (spec.audience !== audience)
          note(
            `Doc 22: aba de ${spec.audience === "jovem" ? "jovens" : "adultos"} com ${audience} (vale o Doc 10)`,
            where,
            raw,
          );
        controls.push({ audience, person: person.name, cells, where });
        return;
      }
      // Familiar: na aba de jovens, logo abaixo do jovem; na aba Vamos Falar, sozinho.
      const relative = personName(name);
      const links = relativesOf.get(key(relative));
      if (!youth) {
        note("Doc 22: familiar sem jovem do Doc 10 acima (linha ignorada)", where, relative);
        return;
      }
      if (!links?.some((l) => l.youth === youth)) {
        note("Doc 22: familiar que não está no Doc 10 Familiares desse jovem (linha ignorada)", where, relative);
        return;
      }
      if (links.some((l) => l.associate)) {
        note("Doc 22: familiar associado (controlado na linha dele de adulto; linha ignorada)", where, relative);
        return;
      }
      controls.push({ audience: "responsavel", person: relative, youth: youth.name, cells, where });
    });
  }
  return kinds;
}

// Parentesco ---------------------------------------------------------------------------------------------------------

// O Doc 10 não diz mãe ou pai: deduz pelo primeiro nome (terminação feminina comum em português ou nome da lista).
const FEMALE = new Set([
  "raquel",
  "isabel",
  "mabel",
  "carmen",
  "ingrid",
  "miriam",
  "mirian",
  "ruth",
  "rute",
  "liz",
  "ines",
  "lourdes",
  "mercedes",
  "dolores",
  "abigail",
  "rachel",
  "beatriz",
  "ester",
  "esther",
  "edith",
  "karen",
  "ellen",
  "helen",
  "evelyn",
  "jaqueline",
  "jacqueline",
  "nicole",
  "rosemeri",
  "rosemery",
  "suely",
  "sueli",
  "deise",
  "thais",
  "tais",
  "lais",
  "iris",
  "doris",
  "gladis",
  "nadir",
  "lucimar",
  "rosimar",
  "marli",
  "nelci",
  "noemi",
  "madalena",
  "irani",
  "kelly",
  "keli",
  "shirley",
  "sirlei",
  "elisabeth",
  "elizabeth",
  "lilian",
  "vivian",
  "marian",
  "susan",
]);
const MALE_A = new Set([
  "luca",
  "joshua",
  "nikita",
  "jonata",
  "jeremia",
  "elias",
  "matias",
  "tobias",
  "jonas",
  "lucas",
  "thomas",
  "tomas",
]);
function guessKinship(name: string): "mãe" | "pai" {
  const first = key(name).split(" ")[0] ?? "";
  if (FEMALE.has(first)) return "mãe";
  if (MALE_A.has(first)) return "pai";
  return /(a|ane|ine|ene|ele|elle|ise|ice|ete|ette|ilde|ude|ith|iz|ah)$/.test(first) ? "mãe" : "pai";
}

// Montagem ----------------------------------------------------------------------------------------------------------

async function main() {
  const doc10 = findDoc(10),
    doc13 = findDoc(13),
    doc14 = findDoc(14),
    doc22 = findDoc(22);
  console.log("Planilhas:", [doc10, doc13, doc14, doc22].map((f) => path.basename(f)).join(" | "));

  const { outros, relatives } = await readDoc10(doc10);
  const births = await readDoc13(doc13);
  const promises = await readDoc14(doc14);

  const relativesOf = new Map<string, { youth: Person; associate: boolean }[]>();
  for (const r of relatives)
    relativesOf.set(key(r.name), [...(relativesOf.get(key(r.name)) ?? []), { youth: r.youth, associate: r.associate }]);
  const kinds = await readDoc22(doc22, relativesOf);

  // Outros do Doc 10: tipo pela cor da aba Dirigentes do Doc 22; sem ela, negrito = comissão fiscal, senão honorífico.
  for (const o of outros) {
    const kind = kinds.get(key(o.name)) ?? (o.bold ? "comissão fiscal" : "honorífico");
    if (!kinds.has(key(o.name))) note(`Doc 10 Outros: tipo pelo negrito (${kind}), sem cor no Doc 22`, o.where, o.name);
    if (kind === "colaborador") note('Doc 10 Outros: "Outros" do Doc 22 entram como colaborador', o.where, o.name);
    functions.push({ person: o.name, kind });
  }

  const youthWithoutBirth = [...people.values()].filter((p) => p.youth && !p.birth);
  for (const p of youthWithoutBirth) note("jovem sem nascimento no Doc 13", p.where, p.name);

  // Responsáveis: `*` = outro parentesco, não legal; sem `*` = responsável legal, mãe ou pai pelo primeiro nome.
  const guardianRows: (string | undefined)[][] = [];
  const perYouth = new Map<Person, string[]>();
  for (const r of relatives) {
    let associate = "";
    if (r.associate) {
      const p = findPerson(r.name, r.where);
      if (p && !p.youth) associate = p.name;
      else note("Doc 10 Familiares: fundo azul (associado), mas não é adulto no Doc 10", r.where, r.name);
    }
    const kinship = r.star ? "outro" : guessKinship(r.name);
    if (!r.star) perYouth.set(r.youth, [...(perYouth.get(r.youth) ?? []), kinship]);
    guardianRows.push([
      r.youth.name,
      r.youth.birth,
      r.name,
      kinship,
      r.star ? "outro parentesco" : "",
      r.star ? "não" : "sim",
      "",
      associate,
      "",
    ]);
  }
  for (const [youth, list] of perYouth) {
    if (list.filter((k) => k === "mãe").length > 1 || list.filter((k) => k === "pai").length > 1)
      note(
        "parentesco deduzido repetido (duas mães ou dois pais): confira na pré-visualização",
        youth.where,
        youth.name,
      );
  }

  const files: Record<string, string> = {
    "pessoas.csv": writeImportCsv(
      ["nome", "nascimento", "ramo", "seção", "registro", "promessa"],
      [...people.values()].map((p) => [
        p.name,
        p.birth,
        p.youth ? p.branch!.label : "adulto",
        p.youth ? p.branch!.section : "",
        p.registration,
        p.promise,
      ]),
    ),
    "funcoes.csv": writeImportCsv(
      ["pessoa", "nascimento", "tipo", "seção", "eleito"],
      functions.map((f) => [
        people.get(key(f.person))?.name ?? f.person,
        people.get(key(f.person))?.birth,
        f.kind,
        f.section,
        f.kind === "dirigente" ? (f.elected ? "sim" : "não") : "",
      ]),
    ),
    "responsaveis.csv": writeImportCsv(
      [
        "jovem",
        "nascimento do jovem",
        "responsável",
        "parentesco",
        "descrição do parentesco",
        "legal",
        "financeiro",
        "associado",
        "observação",
      ],
      guardianRows,
    ),
  };

  // Controle: só as células de itens que valem para o público; a mesma pessoa em várias abas vira uma linha.
  const merged = new Map<string, ControlRow>();
  for (const row of controls) {
    const k = [row.audience, key(row.person), key(row.youth ?? "")].join("|");
    const current = merged.get(k);
    for (const [itemName, text] of row.cells) {
      const item = ITEMS.find((i) => i.name === itemName)!;
      if (!item.audiences.includes(row.audience)) {
        note(
          `Doc 22: "${itemName}" não vale para ${row.audience === "responsavel" ? "responsável" : row.audience} no app (célula ignorada; ajuste em Configurações › Itens se deveria valer)`,
          row.where,
          row.person,
        );
        row.cells.delete(itemName);
        continue;
      }
      if (current?.cells.has(itemName) && current.cells.get(itemName) !== text)
        note(`Doc 22: "${itemName}" diferente em duas abas (vale a primeira)`, row.where, row.person);
    }
    if (current) {
      for (const [k2, v] of row.cells) if (!current.cells.has(k2)) current.cells.set(k2, v);
    } else merged.set(k, row);
  }
  const controlRows = [...merged.values()].filter((r) => r.cells.size);
  const usedItems = ITEMS.filter((item) => controlRows.some((r) => r.cells.has(item.name)));
  files["controle.csv"] = writeImportCsv(
    ["público", "pessoa", "nascimento", "jovem", "nascimento do jovem", ...usedItems.map((i) => i.name)],
    controlRows.map((r) => [
      r.audience === "responsavel" ? "responsável" : r.audience,
      r.person,
      people.get(key(r.person))?.birth,
      r.youth,
      r.youth ? people.get(key(r.youth))?.birth : "",
      ...usedItems.map((i) => r.cells.get(i.name)),
    ]),
  );

  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, csv] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), csv);

  // Resumo --------------------------------------------------------------------------------------------------------
  const all = [...people.values()];
  const count = (list: string[]) =>
    Object.entries(list.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}))
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
  console.log(
    `\npessoas: ${all.length} (jovens: ${count(all.filter((p) => p.youth).map((p) => `${p.branch!.section} ${p.registration}`))}; adultos ${all.filter((p) => !p.youth).length})`,
  );
  console.log(`nascimentos: ${births} | promessas: ${promises}`);
  console.log(
    `funções: ${functions.length} (${count(functions.map((f) => (f.kind === "dirigente" && f.elected ? "dirigente eleito" : f.kind)))})`,
  );
  console.log(
    `responsáveis: ${relatives.length} vínculos (${count(guardianRows.map((r) => r[3]!))}; parentesco mãe/pai deduzido do primeiro nome)`,
  );
  console.log(
    `controle: ${controlRows.length} linhas (${count(controlRows.map((r) => r.audience))}), ${usedItems.length} itens`,
  );
  if (all.some((p) => p.branch?.branch === "filhote"))
    console.log("Atenção: há Ninhada (ramo filhote); a tela só aceita com o ramo Filhote ligado no app.");
  for (const [topic, list] of notes) console.log(`\n${topic}: ${list.length}\n  ${list.join("\n  ")}`);

  // Mesma leitura e pré-visualização da tela /importar, contra um banco vazio com os itens padrão.
  const read = Object.entries(files).map(([name, csv]) => {
    const result = readImportFile(name, csv);
    if (!result.file) fail(`${name}: ${result.error}`);
    return result.file;
  });
  const items: StateItem[] = ITEMS.map((item, i) => ({
    id: `item-${i}`,
    name: item.name,
    kind: "documento",
    directorate: "administrativa",
    valueKind: item.valueKind,
    validityMonths: null,
    removeOnLeave: false,
    active: true,
    audiences: Object.fromEntries(item.audiences.map((a) => [a, null])),
  }));
  const plan = planBatch(
    read,
    { ...EMPTY_STATE, items },
    { filhotes: true, today: new Date().toISOString().slice(0, 10) },
  );
  // Sem --detalhes, nomes citados entre aspas nas mensagens da pré-visualização viram "…".
  const hide = (text: string) => (details ? text : text.replace(/"[^"]*"/g, '"…"'));
  const problems = [
    ...plan.errors.map(hide),
    ...read.flatMap((f) => f.warnings.map((w) => `${f.name}: ${w}`)),
    ...plan.files.flatMap((f) =>
      f.rows
        .filter((r) => r.errors.length)
        .map((r) => `${f.name}, linha ${r.line}${details ? ` (${r.label})` : ""}: ${hide(r.errors.join("; "))}`),
    ),
  ];
  const warnings = plan.files.flatMap((f) => [
    ...f.warnings,
    ...f.rows.flatMap((r) => r.warnings.map((w) => `${f.name}, linha ${r.line}: ${hide(w)}`)),
  ]);
  console.log(
    `\nPré-visualização (/importar): ${plan.files.map((f) => `${f.name} ${f.rows.filter((r) => !r.errors.length).length}/${f.rows.length} ok`).join(" | ")}`,
  );
  for (const f of plan.files)
    for (const c of f.creations) console.log(`  ${f.name}: cria ${details ? c : c.replace(/:.*/, "")}`);
  if (warnings.length) console.log(`avisos da pré-visualização: ${warnings.length}\n  ${warnings.join("\n  ")}`);
  if (problems.length)
    fail(`\n${problems.length} problema(s) que a tela /importar recusaria:\n  ${problems.join("\n  ")}`);
  console.log(`\nPronto: ${outDir} (pessoas, funcoes, responsaveis, controle). Envie os quatro juntos em /importar.`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
