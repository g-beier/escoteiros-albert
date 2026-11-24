// Relatórios em PDF do Associados (/associados/relatorios): catálogo, rodapé e cores. Puro; o layout comum (A4,
// cabeçalho, rodapé, blocos) fica em components/reports/ e a geração em lib/server/reports.ts.

import { MONTHS_SHORT } from "@/lib/format";
import type { FunctionKind } from "./controls";
import type { ScoutBranch } from "./model";

export type ReportInfo = {
  /** Na URL: /associados/relatorios/<slug>. */
  slug: string;
  /** Número do documento do grupo ("10", "13", "14a"…); sem número = documento interno. */
  number: string | null;
  title: string;
  description: string;
};

/** Relatórios disponíveis. */
export const REPORTS: ReportInfo[] = [
  { slug: "doc-10", number: "10", title: "Lista simples de efetivo",
    description: "Adultos e jovens por seção (registro definitivo e provisório), diretoria, outros, totais e os responsáveis de cada jovem." },
  { slug: "doc-13", number: "13", title: "Controle de idade dos jovens",
    description: "Jovens por seção com nascimento, idade e período de transição de ramo (em negrito quando já vigente)." },
  { slug: "doc-14a", number: "14a", title: "Datas de promessa",
    description: "Promessas por mês, com a data e a cor do ramo ou função; e quem não tem data de promessa registrada." },
  { slug: "doc-14b", number: "14b", title: "Vida escoteira",
    description: "Jovens e adultos escotistas ou dirigentes: promessa, estrelas de atividade por ramo, total e quem possui lacunas." },
];

export const reportBySlug = (slug: string) => REPORTS.find((report) => report.slug === slug) ?? null;

/** Nome no rodapé: "Documento 10 - Lista simples de efetivo" (sem número, só o título). */
export const reportFooterName = (report: Pick<ReportInfo, "number" | "title">) =>
  report.number === null ? report.title : `Documento ${report.number} - ${report.title}`;

/** Data da emissão no rodapé: mês abreviado e ano com dois dígitos ("nov./26", "maio/26"). */
export function updatedLabel(iso: string) {
  return `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

const slugify = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Arquivo: "doc-10-lista-simples-de-efetivo-2026-11-20.pdf". */
export const reportFilename = (report: Pick<ReportInfo, "number" | "title">, issuedOn: string) =>
  `${slugify(report.number === null ? report.title : `doc ${report.number} ${report.title}`)}-${issuedOn}.pdf`;

/** Divide uma lista em duas metades pelo peso (linhas de cada grupo), mantendo a ordem; a esquerda fica com a sobra. */
export function splitInTwo<T>(items: T[], weight: (item: T) => number = () => 1): [T[], T[]] {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let acc = 0;
  let cut = items.length;
  for (let i = 0; i < items.length; i += 1) {
    if (acc >= total / 2) { cut = i; break; }
    acc += weight(items[i]);
  }
  return [items.slice(0, cut), items.slice(cut)];
}

// Cores (tons das planilhas do grupo) ------------------------------------------------------------

/** Cor de cada ramo de jovens; o adulto vai pela função. Filhote: provisória, até o ramo existir no grupo. */
export const BRANCH_COLORS: Record<Exclude<ScoutBranch, "adulto">, string> = {
  filhote: "#E5E5E5",
  lobinho: "#FFFC9E",
  escoteiro: "#8EE08B",
  senior: "#D9A0B7",
  pioneiro: "#FF8B8B",
};

/** Cor das funções de adulto, menos escotista (que leva a cor do ramo da seção). */
export const ROLE_COLORS: Record<Exclude<FunctionKind, "escotista">, string> = {
  dirigente: "#93C6FB",
  honorifico: "#FFCC99",
  colaborador: "#FFCC99",
  contribuinte: "#FFCC99",
  comissao_fiscal: "#FFCC99",
};

/** Faixa de título (cinza) e linhas do cabeçalho (roxo). */
export const BAND_GRAY = "#DCDCDC";
export const RULE_PURPLE = "#7B6CD9";
export const NO_COLOR = "#FFFFFF";

/** Ordem de prioridade quando o adulto tem várias funções. */
const ROLE_ORDER: Exclude<FunctionKind, "escotista">[] = ["dirigente", "comissao_fiscal", "honorifico", "colaborador", "contribuinte"];

/**
 * Cor da pessoa nos relatórios: jovem = cor do ramo; adulto = escotista com a cor do ramo da seção (`scouterBranch`),
 * senão dirigente (azul), senão comissão fiscal ou honorífico (laranja); sem função, sem cor.
 */
export function personColor({ branch, functions, scouterBranch }: {
  branch: ScoutBranch; functions?: Iterable<FunctionKind>; scouterBranch?: ScoutBranch | null;
}): string {
  if (branch !== "adulto") return BRANCH_COLORS[branch];
  if (scouterBranch && scouterBranch !== "adulto") return BRANCH_COLORS[scouterBranch];
  const kinds = new Set(functions ?? []);
  const role = ROLE_ORDER.find((kind) => kinds.has(kind));
  return role ? ROLE_COLORS[role] : NO_COLOR;
}

/** Legenda das cores, na ordem das planilhas. `filhotes`: inclui o Filhote (interruptor `FILHOTES_ENABLED`). */
export function colorLegend(filhotes: boolean): { label: string; color: string }[] {
  return [
    ...(filhotes ? [{ label: "Filhote", color: BRANCH_COLORS.filhote }] : []),
    { label: "Lobinho", color: BRANCH_COLORS.lobinho },
    { label: "Escoteiro", color: BRANCH_COLORS.escoteiro },
    { label: "Sênior", color: BRANCH_COLORS.senior },
    { label: "Pioneiro", color: BRANCH_COLORS.pioneiro },
    { label: "Dirigente", color: ROLE_COLORS.dirigente },
    { label: "Outros (honorífico, colaborador, contribuinte, comissão fiscal)", color: ROLE_COLORS.honorifico },
  ];
}
