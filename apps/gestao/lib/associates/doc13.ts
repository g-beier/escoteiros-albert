// Doc 13 – Controle de idade dos jovens: por seção (todas as ativas, mesmo vazias), cada jovem ativo com nascimento,
// idade em anos e meses e o período de transição do ramo ("mar. 2029 - mar. 2030", do aviso à idade-limite, regras em
// alerts.ts). Linha em negrito quando o período já está vigente (hoje ≥ início do período). Do mais novo ao mais velho.
// Puro; o PDF fica em components/associates/reports/doc13-report.tsx.

import { transitionWindow } from "./alerts";
import { reportSections, type ReportSection } from "./doc10";
import {
  ageInYearsMonths,
  ageYearsMonthsLabel,
  type AssociateProfile,
  type ScoutBranch,
  type SectionItem,
} from "./model";
import { monthYearBR } from "@/lib/format";

/** Linhas vazias no fim de cada seção. */
export const BLANK_AGE_ROWS = 2;

/** Faixa de idade do ramo no título da seção: nome em maiúsculas e a faixa como está ("ALCATEIA (6,5 - 10 anos)"). */
export const BRANCH_AGE_RANGES: Record<Exclude<ScoutBranch, "adulto">, string> = {
  filhote: "5 - 7 anos",
  lobinho: "6,5 - 10 anos",
  escoteiro: "10 - 14 anos",
  senior: "14 - 18 anos",
  pioneiro: "18 - 22 anos",
};

export type Doc13Row = {
  id: string;
  name: string;
  birth: string | null;
  age: string;
  period: string | null;
  /** Período de transição vigente (já começou): linha em negrito. */
  current: boolean;
  /** Cadastro para revisar: nome em vermelho. */
  red?: boolean;
};
export type Doc13Section = ReportSection & { label: string; rows: Doc13Row[] };
export type Doc13 = { sections: Doc13Section[] };

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** "16/03/2019". */
const fullDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function buildDoc13({
  associates,
  sections,
  today,
}: {
  associates: AssociateProfile[];
  sections: SectionItem[];
  today: string;
}): Doc13 {
  const youth = associates.filter((a) => a.active && a.branch !== "adulto");
  return {
    sections: reportSections(sections, youth).map((section): Doc13Section => ({
      ...section,
      label: `${section.title.toLocaleUpperCase("pt-BR")} (${BRANCH_AGE_RANGES[section.branch]})`,
      rows: youth
        .filter((a) => a.branch === section.branch && a.section_id === section.sectionId)
        // do mais novo ao mais velho; sem nascimento no fim
        .sort((a, b) => (b.birth_date ?? "").localeCompare(a.birth_date ?? "") || collator.compare(a.name, b.name))
        .map((a): Doc13Row => {
          const span = transitionWindow(a);
          return {
            id: a.id,
            name: a.name,
            birth: a.birth_date ? fullDate(a.birth_date) : null,
            age: a.birth_date ? ageYearsMonthsLabel(ageInYearsMonths(a.birth_date, today)) : "—",
            period: span ? `${monthYearBR(span.warnOn)} - ${monthYearBR(span.dueOn)}` : null,
            current: !!span && today >= span.warnOn,
            ...(a.review_status === "para_revisar" ? { red: true } : {}),
          };
        }),
    })),
  };
}
