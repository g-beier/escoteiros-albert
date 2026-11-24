import { BRANCH_CHOICES, REGISTRATION_CHOICES, fileSpec, type FileKind } from "@/lib/import/contract";
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

/** Modelo para baixar: cabeçalho e as linhas de exemplo (nomes fictícios) do contrato. */
export function templateCsv(kind: FileKind): string {
  const spec = fileSpec(kind);
  return writeImportCsv(spec.example.header, spec.example.rows);
}

/** Tipos com "Baixar dados atuais" (os outros chegam com os próximos arquivos do contrato). */
export const EXPORTABLE: readonly FileKind[] = ["secoes", "pessoas"];
