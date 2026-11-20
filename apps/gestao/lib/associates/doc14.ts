// Doc 14 – Datas de promessa: associados ativos por mês da promessa (dia, ano e nome), com a data curta e a cor do
// ramo/função (como nos outros documentos); e, à parte, quem não tem data de promessa registrada (para conferir se
// fez a promessa ou não). Puro; o PDF fica em components/associates/reports/doc14-report.tsx.

import { isFunctionActive, type AssociateFunction, type FunctionKind } from "./controls";
import type { AssociateProfile, ScoutBranch, SectionItem } from "./model";
import { personColor } from "./reports";

export const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
/** Linhas vazias no fim da lista "Sem promessa" (cada coluna). */
export const BLANK_WITHOUT_ROWS = 3;

export type Doc14Person = { id: string; name: string; color: string; red?: boolean };
export type Doc14Promise = Doc14Person & { date: string };
export type Doc14Month = { month: number; label: string; people: Doc14Promise[] };
export type Doc14 = { months: Doc14Month[]; without: Doc14Person[] };

export type Doc14Input = { associates: AssociateProfile[]; functions: AssociateFunction[]; sections: SectionItem[]; today: string };

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Data curta da planilha: "17/1/26" (dia e mês sem zero, ano com dois dígitos). */
export function shortPromiseDate(iso: string) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(2, 4)}`;
}

export function buildDoc14({ associates, functions, sections, today }: Doc14Input): Doc14 {
  const active = associates.filter((a) => a.active);
  const sectionBranch = new Map(sections.map((s) => [s.id, s.branch]));
  const kinds = new Map<string, FunctionKind[]>();
  const scouterBranch = new Map<string, ScoutBranch>();
  for (const fn of functions) {
    if (!isFunctionActive(fn, today)) continue;
    kinds.set(fn.associate_id, [...(kinds.get(fn.associate_id) ?? []), fn.kind]);
    const branch = fn.kind === "escotista" && fn.section_id ? sectionBranch.get(fn.section_id) : undefined;
    if (branch && !scouterBranch.has(fn.associate_id)) scouterBranch.set(fn.associate_id, branch);
  }
  const person = (a: AssociateProfile): Doc14Person => ({
    id: a.id, name: a.name,
    color: personColor({ branch: a.branch, functions: kinds.get(a.id), scouterBranch: scouterBranch.get(a.id) }),
    ...(a.review_status === "para_revisar" ? { red: true } : {}),
  });

  const months: Doc14Month[] = MONTH_NAMES.map((label, index) => {
    const month = index + 1;
    const people = active
      .filter((a) => a.promise_date && Number(a.promise_date.slice(5, 7)) === month)
      .sort((a, b) => Number(a.promise_date!.slice(8, 10)) - Number(b.promise_date!.slice(8, 10))
        || a.promise_date!.localeCompare(b.promise_date!) || collator.compare(a.name, b.name))
      .map((a) => ({ ...person(a), date: shortPromiseDate(a.promise_date!) }));
    return { month, label, people };
  }).filter((m) => m.people.length > 0);

  const without = active.filter((a) => !a.promise_date).sort((a, b) => collator.compare(a.name, b.name)).map(person);
  return { months, without };
}
