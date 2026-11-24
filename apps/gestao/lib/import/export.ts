import { BRANCH_CHOICES, FUNCTION_CHOICES, KINSHIP_CHOICES, REGISTRATION_CHOICES, fileSpec, type FileKind } from "@/lib/import/contract";
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

/** Modelo para baixar: cabeçalho e as linhas de exemplo (nomes fictícios) do contrato. */
export function templateCsv(kind: FileKind): string {
  const spec = fileSpec(kind);
  return writeImportCsv(spec.example.header, spec.example.rows);
}

/** Tipos com "Baixar dados atuais" (os outros chegam com os próximos arquivos do contrato). */
export const EXPORTABLE: readonly FileKind[] = ["secoes", "pessoas", "funcoes", "responsaveis"];
