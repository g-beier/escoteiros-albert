import {
  AUDIENCE_INITIAL_CHOICES, BRANCH_CHOICES, CONTROL_STATUS_CHOICES, DIRECTORATE_CHOICES, EXCLUSION_CHOICES, FUNCTION_CHOICES, ITEM_KIND_CHOICES, KINSHIP_CHOICES,
  REGISTRATION_CHOICES, VALUE_KIND_CHOICES, fileSpec, type FileKind,
} from "@/lib/import/contract";
import type { ImportState, StateStatus } from "@/lib/import/state";
import { showChoice, showDate } from "@/lib/import/plan";
import { writeImportCsv } from "@/lib/import/read";

/**
 * "Baixar dados atuais" e modelos: o mesmo formato do contrato, para conferir, corrigir numa planilha e reimportar
 * (a ida e volta dá tudo "igual": ver export.test.ts).
 */

export type PersonExport = {
  id: string; name: string; nickname: string | null; birth_date: string | null; branch: string; section: string | null; patrol: string | null;
  registration: string; joined_on: string | null; promise_date: string | null; active: boolean; left_on: string | null; notes: string | null;
};

export type SectionExport = { branch: string; section: string; patrol: string | null; active: boolean };

const header = (kind: FileKind) => fileSpec(kind).columns.map((column) => column.header);

export function peopleCsv(people: PersonExport[]): string {
  return writeImportCsv(header("pessoas"), people.map((p) => [
    p.id, p.name, p.nickname, showDate(p.birth_date), showChoice(BRANCH_CHOICES, p.branch), p.section, p.patrol,
    showChoice(REGISTRATION_CHOICES, p.registration), showDate(p.joined_on), showDate(p.promise_date),
    p.active ? "ativo" : "desligado", p.active ? "" : showDate(p.left_on), "", p.notes,
  ]));
}

export function sectionsCsv(sections: SectionExport[]): string {
  return writeImportCsv(header("secoes"), sections.map((s) => [showChoice(BRANCH_CHOICES, s.branch), s.section, s.patrol, s.active ? "sim" : "não"]));
}

export type FunctionExport = {
  person_id: string; person: string; birth_date: string | null; kind: string; title: string | null; section: string | null;
  started_on: string | null; ended_on: string | null; elected: boolean;
};

export type RelativeExport = {
  youth_id: string; youth: string; youth_birth: string | null; relative: string; kinship: string; kinship_note: string | null;
  legal: boolean; financial: boolean; relative_associate: string | null; notes: string | null;
};

const yesNo = (value: boolean) => (value ? "sim" : "não");

export function functionsCsv(functions: FunctionExport[]): string {
  return writeImportCsv(header("funcoes"), functions.map((f) => [
    f.person_id, f.person, showDate(f.birth_date), showChoice(FUNCTION_CHOICES, f.kind), f.title, f.section,
    showDate(f.started_on), showDate(f.ended_on), f.kind === "dirigente" ? yesNo(f.elected) : "",
  ]));
}

export function relativesCsv(links: RelativeExport[]): string {
  return writeImportCsv(header("responsaveis"), links.map((l) => [
    l.youth_id, l.youth, showDate(l.youth_birth), l.relative, showChoice(KINSHIP_CHOICES, l.kinship), l.kinship_note,
    yesNo(l.legal), yesNo(l.financial), l.relative_associate, l.notes,
  ]));
}

const initial = (audiences: Record<string, string | null>, audience: string) =>
  !(audience in audiences) ? "não" : audiences[audience] === null ? "sim" : showChoice(AUDIENCE_INITIAL_CHOICES, audiences[audience]);

export function itemsCsv(state: ImportState): string {
  return writeImportCsv(header("itens-controle"), state.items.filter((item) => item.active).map((item) => [
    item.name, showChoice(DIRECTORATE_CHOICES, item.directorate), showChoice(ITEM_KIND_CHOICES, item.kind), showChoice(VALUE_KIND_CHOICES, item.valueKind),
    item.validityMonths, yesNo(item.removeOnLeave), initial(item.audiences, "jovem"), initial(item.audiences, "adulto"), initial(item.audiences, "responsavel"),
  ]));
}

/** Célula do controle no formato que `parseControlCell` lê de volta. */
export function controlCell(status: StateStatus | undefined, valueKind: string): string {
  if (!status) return "";
  const label = showChoice(CONTROL_STATUS_CHOICES, status.status);
  let text: string;
  if (valueKind === "ano") text = status.status === "ok" && status.year ? String(status.year) : [label, status.year].filter(Boolean).join(" ");
  else if (valueKind === "data") text = status.status === "ok" && status.validUntil ? showDate(status.validUntil) : [label, showDate(status.validUntil)].filter(Boolean).join(" ");
  else text = [label, showDate(status.statusDate)].filter(Boolean).join(" ");
  return status.note ? `${text} - ${status.note}` : text;
}

/** Matriz do controle: associados ativos e os responsáveis dos jovens ativos, uma coluna por item ativo. */
export function controlsCsv(state: ImportState): string {
  const items = state.items.filter((item) => item.active);
  const statusOf = new Map(state.statuses.map((s) => [`${s.associateId ?? s.relativeId}|${s.itemId}`, s]));
  const fixed = fileSpec("controle").columns.map((column) => column.header);
  const people = state.people.filter((p) => p.active);
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows: (string | null)[][] = [];
  for (const p of people) {
    rows.push([p.branch === "adulto" ? "adulto" : "jovem", p.id, p.name, showDate(p.birth), "", "",
      ...items.map((item) => controlCell(statusOf.get(`${p.id}|${item.id}`), item.valueKind))]);
  }
  for (const relative of state.relatives) {
    const youth = state.links.map((l) => (l.relativeId === relative.id ? byId.get(l.associateId) : undefined)).find((p) => p && p.branch !== "adulto");
    if (!youth) continue;
    rows.push(["responsável", "", relative.name, "", youth.name, showDate(youth.birth),
      ...items.map((item) => controlCell(statusOf.get(`${relative.id}|${item.id}`), item.valueKind))]);
  }
  return writeImportCsv([...fixed, ...items.map((item) => item.name)], rows);
}

/** Início de período: `mm/aaaa` no dia 1º, senão a data. */
function startCell(iso: string) {
  return iso.endsWith("-01") ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : showDate(iso);
}

/** Fim (exclusivo no banco, inclusivo no CSV): o mês anterior quando cai no dia 1º, senão o dia anterior. */
function endCell(iso: string | null) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (iso.endsWith("-01")) {
    date.setUTCMonth(date.getUTCMonth() - 1);
    return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return showDate(date.toISOString().slice(0, 10));
}

export function lifeCsv(state: ImportState): string {
  const people = new Map(state.people.map((p) => [p.id, p]));
  const rows: (string | number | null)[][] = [];
  const base = (associateId: string) => {
    const p = people.get(associateId);
    return p ? [p.id, p.name, showDate(p.birth)] : null;
  };
  const push = (associateId: string, cells: (string | number | null)[]) => {
    const who = base(associateId);
    if (who) rows.push([...who, ...cells]);
  };
  //          tipo, ramo, início, fim, outro grupo, motivo, data, título, descrição, estrela, entregue em
  for (const p of state.life.periods) push(p.associateId, ["período", showChoice(BRANCH_CHOICES, p.branch), startCell(p.started), endCell(p.ended), p.place, "", "", "", "", "", ""]);
  for (const e of state.life.exclusions) push(e.associateId, ["exclusão", "", startCell(e.started), endCell(e.ended), "", showChoice(EXCLUSION_CHOICES, e.reason), "", "", e.note, "", ""]);
  for (const e of state.life.events) push(e.associateId, ["evento", "", "", "", "", "", showDate(e.date), e.title, e.description, "", ""]);
  for (const s of state.life.stars) push(s.associateId, ["estrela", showChoice(BRANCH_CHOICES, s.branch), "", "", "", "", "", "", "", s.star, showDate(s.delivered)]);
  // uma linha de anotação por linha do texto (a importação junta de novo, com quebra de linha)
  for (const [associateId, notes] of Object.entries(state.life.notes)) {
    for (const line of notes.split(/\r?\n/).map((text) => text.trim()).filter(Boolean)) push(associateId, ["anotação", "", "", "", "", "", "", "", line, "", ""]);
  }
  // por pessoa, mantendo a ordem dos fatos (as anotações ficam na ordem do texto)
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1]), "pt-BR"));
  return writeImportCsv(header("vida-escoteira"), rows);
}

/** Modelo para baixar: cabeçalho e as linhas de exemplo (nomes fictícios) do contrato. */
export function templateCsv(kind: FileKind): string {
  const spec = fileSpec(kind);
  return writeImportCsv(spec.example.header, spec.example.rows);
}

/** Tipos com "Baixar dados atuais" (os outros chegam com os próximos arquivos do contrato). */
export const EXPORTABLE: readonly FileKind[] = ["secoes", "itens-controle", "pessoas", "funcoes", "responsaveis", "controle", "vida-escoteira"];
