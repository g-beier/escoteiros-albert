import { CONTROL_STATUS_CHOICES, FILES, type Column, type ColumnType, type FileSpec } from "@/lib/import/contract";

/**
 * Tabelas do contrato em Markdown, inseridas em `docs/importacao.md` entre os marcadores
 * `<!-- contrato:inicio -->` e `<!-- contrato:fim -->` (`npm run import:doc`; um teste confere).
 */

export const DOC_START = "<!-- contrato:inicio -->";
export const DOC_END = "<!-- contrato:fim -->";

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");

function typeLabel(type: ColumnType): string {
  switch (type.kind) {
    case "texto": return type.min && type.min === type.max ? `texto (${type.max})` : `texto (até ${type.max})`;
    case "id": return "id do app";
    case "data": return "data dd/mm/aaaa";
    case "mes_ou_data": return "mês mm/aaaa ou data";
    case "sim_nao": return "sim/não";
    case "inteiro": return `inteiro ${type.min}–${type.max}`;
    case "dinheiro": return "valor 1.234,56";
    case "lista": return type.choices.map((choice) => `\`${choice.label}\``).join(", ");
    case "situacao_controle": return "situação, ano ou data";
  }
}

function requiredLabel(column: Column): string {
  if (!column.required) return "";
  if (column.required === "sempre") return "sim";
  if (column.required === "criacao") return "ao criar";
  return `se ${column.required}`;
}

function csvLine(values: readonly string[]) {
  return values.map((value) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)).join(";");
}

function fileMarkdown(spec: FileSpec): string {
  const lines = [
    `### \`${spec.file}\`: ${spec.title}`,
    "",
    `- **Uma linha por:** ${spec.row}.`,
    `- **Identificação:** ${spec.key}.`,
    `- **Reimportar:** ${spec.reimport}`,
    ...(spec.notes ?? []).map((note) => `- ${note}`),
    "",
    "| Coluna | Obrigatória | Valores | O que é | Exemplo |",
    "|---|---|---|---|---|",
    ...spec.columns.map((column) => {
      const names = [column.header, ...(column.aliases ?? [])].map((name) => `\`${name}\``);
      return `| ${names[0]}${names.length > 1 ? ` (ou ${names.slice(1).join(", ")})` : ""} | ${requiredLabel(column)} | ${cell(typeLabel(column.type))} | ${cell(column.help)} | ${cell(column.example)} |`;
    }),
    ...(spec.dynamic ? [`| \`${spec.dynamic.pattern}\` |  |  | ${cell(spec.dynamic.help)} | ${cell(spec.dynamic.example)} |`] : []),
    "",
    "Exemplo:",
    "",
    "```csv",
    csvLine(spec.example.header),
    ...spec.example.rows.map(csvLine),
    "```",
  ];
  return lines.join("\n");
}

export function contractMarkdown(): string {
  const statuses = [
    "Situações aceitas nas células de `controle.csv` (e como valor inicial em `itens-controle.csv`):",
    "",
    "| Na célula | Situação |",
    "|---|---|",
    ...CONTROL_STATUS_CHOICES.map((choice) => `| ${[choice.label, ...(choice.aliases ?? [])].map((name) => `\`${name}\``).join(", ")} | ${choice.value.replace(/_/g, " ")} |`),
  ].join("\n");
  return [DOC_START, "", ...FILES.flatMap((spec) => [fileMarkdown(spec), ""]), statuses, "", DOC_END].join("\n");
}

/** Troca o bloco gerado dentro do documento. */
export function replaceContractBlock(doc: string): string {
  const start = doc.indexOf(DOC_START);
  const end = doc.indexOf(DOC_END);
  if (start < 0 || end < start) throw new Error(`Marcadores ${DOC_START} / ${DOC_END} não encontrados`);
  return doc.slice(0, start) + contractMarkdown() + doc.slice(end + DOC_END.length);
}
