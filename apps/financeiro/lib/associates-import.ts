import { normalizeText, readCsv, sniffCsv } from "@/lib/statement-import";
import { SCOUT_BRANCHES, branchLabels, type ScoutBranch } from "@/lib/associates";

/**
 * Importação de associados em massa por CSV com as colunas nome, ramo, seção e status
 * (cabeçalho obrigatório; separador, acentos e maiúsculas indiferentes). Tudo puro, para a
 * pré-visualização no navegador; o banco valida de novo em `import_associates`.
 */

export const ASSOCIATE_CSV_TEMPLATE = "nome;ramo;seção;status\r\nAna Souza;Lobinho;Alcateia Seeonee;ativo\r\nBruno Lima;Escoteiro;;inativo\r\n";

export type AssociateCsvRow = {
  /** Linha no arquivo (1 = cabeçalho). */
  line: number;
  name: string;
  branch?: ScoutBranch;
  section: string | null;
  active: boolean;
  errors: string[];
};

export type AssociateCsv = { rows: AssociateCsvRow[]; error?: string };

const COLUMN_ALIASES = {
  name: ["nome", "name", "associado", "nome completo"],
  branch: ["ramo", "branch"],
  section: ["secao", "section", "sessao"],
  status: ["status", "situacao", "ativo"],
} as const;

/** Ramos: chave, rótulo, plural e nomes de seção usuais. */
const BRANCH_ALIASES: Record<string, ScoutBranch> = {};
for (const branch of SCOUT_BRANCHES) {
  BRANCH_ALIASES[branch] = branch;
  BRANCH_ALIASES[normalizeText(branchLabels[branch])] = branch;
}
Object.assign(BRANCH_ALIASES, {
  lobinhos: "lobinho", lobinha: "lobinho", lobinhas: "lobinho", alcateia: "lobinho",
  escoteiros: "escoteiro", escoteira: "escoteiro", escoteiras: "escoteiro", "tropa escoteira": "escoteiro",
  seniores: "senior", guia: "senior", guias: "senior", "tropa senior": "senior",
  pioneiros: "pioneiro", pioneira: "pioneiro", pioneiras: "pioneiro", cla: "pioneiro", "cla pioneiro": "pioneiro",
  adultos: "adulto", escotista: "adulto", escotistas: "adulto", dirigente: "adulto", dirigentes: "adulto",
} satisfies Record<string, ScoutBranch>);

export function parseBranch(value: string): ScoutBranch | undefined {
  return BRANCH_ALIASES[normalizeText(value)];
}

const ACTIVE = new Set(["", "ativo", "ativa", "sim", "s", "1", "true", "a"]);
const INACTIVE = new Set(["inativo", "inativa", "nao", "n", "0", "false", "i", "desligado", "desligada"]);

/** Status vazio vale ativo; null quando o texto não é reconhecido. */
export function parseStatus(value: string): boolean | null {
  const key = normalizeText(value);
  if (ACTIVE.has(key)) return true;
  if (INACTIVE.has(key)) return false;
  return null;
}

/** Lê o CSV: separador e linha do cabeçalho detectados; nome e ramo obrigatórios. */
export function parseAssociatesCsv(text: string): AssociateCsv {
  if (!text.trim()) return { rows: [], error: "Arquivo vazio." };
  const sniff = sniffCsv(text);
  const table = readCsv(text, { delimiter: sniff.delimiter, headerRow: sniff.headerRow });
  const header = table.header.map(normalizeText);
  const column = (aliases: readonly string[]) => header.findIndex((cell) => aliases.includes(cell));
  const index = {
    name: column(COLUMN_ALIASES.name), branch: column(COLUMN_ALIASES.branch),
    section: column(COLUMN_ALIASES.section), status: column(COLUMN_ALIASES.status),
  };
  const missing = [index.name < 0 && "nome", index.branch < 0 && "ramo"].filter(Boolean);
  if (missing.length) return { rows: [], error: `Cabeçalho sem a coluna ${missing.join(" e ")}. Use as colunas: nome, ramo, seção, status.` };

  const seen = new Map<string, number>();
  const rows = table.rows.map((record, i): AssociateCsvRow => {
    const cell = (at: number) => (at >= 0 ? (record[at] ?? "").replace(/\s+/g, " ").trim() : "");
    const errors: string[] = [];
    const name = cell(index.name);
    if (name.length < 2 || name.length > 120) errors.push("nome com 2 a 120 caracteres");
    const rawBranch = cell(index.branch);
    const branch = parseBranch(rawBranch);
    if (!branch) errors.push(rawBranch ? `ramo "${rawBranch}" desconhecido` : "ramo vazio");
    const section = cell(index.section) || null;
    if (section && section.length > 60) errors.push("seção com até 60 caracteres");
    const status = parseStatus(cell(index.status));
    if (status === null) errors.push(`status "${cell(index.status)}" desconhecido (use ativo ou inativo)`);
    const key = normalizeText(name);
    const line = table.rowNumbers[i] ?? i + 2;
    if (key && seen.has(key)) errors.push(`nome repetido no arquivo (linha ${seen.get(key)})`);
    else if (key) seen.set(key, line);
    return { line, name, ...(branch ? { branch } : {}), section, active: status ?? true, errors };
  });
  return { rows };
}

export type ExistingAssociate = { id: string; name: string; branch: ScoutBranch; section: string | null; active: boolean };

export type PlannedAssociate = AssociateCsvRow & {
  /** nova = cadastrar; atualiza = mesmo nome com ramo/seção/status diferente; igual = nada muda; erro. */
  action: "nova" | "atualiza" | "igual" | "erro";
  existingId?: string;
};

/** Compara com os associados já cadastrados pelo nome (sem acentos nem maiúsculas). */
export function planAssociatesImport(rows: AssociateCsvRow[], existing: ExistingAssociate[]): PlannedAssociate[] {
  const byName = new Map(existing.map((associate) => [normalizeText(associate.name), associate]));
  return rows.map((row) => {
    if (row.errors.length || !row.branch) return { ...row, action: "erro" };
    const current = byName.get(normalizeText(row.name));
    if (!current) return { ...row, action: "nova" };
    const same = current.branch === row.branch && (current.section ?? null) === row.section && current.active === row.active;
    return { ...row, action: same ? "igual" : "atualiza", existingId: current.id };
  });
}
