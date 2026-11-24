// Relatório "Vida escoteira": quem conta (jovens e adultos escotistas ou dirigentes, ativos), com a data da promessa,
// as estrelas por ramo e o total, e a observação "Possui lacunas - ver detalhes" (ou sem promessa, sem período).
// Puro; o PDF fica em components/associates/reports/life-report.tsx.

import type { AssociateFunction } from "./controls";
import { SCOUT_BRANCHES, type AssociateProfile, type ScoutBranch } from "./model";
import { expectedBranch, lifeBranchColor, lifeSummary, type LifeExclusion, type LifePeriod, type StarRecord } from "./scout-life";

export const GAPS_NOTE = "Possui lacunas - ver detalhes";

export type LifeReportRow = {
  id: string; name: string; color: string; promiseDate: string | null;
  stars: Partial<Record<ScoutBranch, number>>; total: number; pending: number | null; note: string;
};
export type LifeReport = { branches: ScoutBranch[]; rows: LifeReportRow[] };

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export function buildLifeReport({ associates, functions, periods, stars, exclusions, today }: {
  associates: AssociateProfile[]; functions: AssociateFunction[]; periods: Map<string, LifePeriod[]>; stars: Map<string, StarRecord[]>; exclusions?: Map<string, LifeExclusion[]>; today: string;
}): LifeReport {
  const functionsOf = Map.groupBy(functions, (fn) => fn.associate_id);
  const rows = associates
    .filter((a) => a.active)
    .flatMap((a): LifeReportRow[] => {
      const list = periods.get(a.id) ?? [];
      const current = expectedBranch(a, functionsOf.get(a.id) ?? [], today);
      if (list.length === 0 && current === null) return [];
      const summary = lifeSummary({ periods: list, promiseDate: a.promise_date, records: stars.get(a.id) ?? [], exclusions: exclusions?.get(a.id) ?? [], today });
      const note = !a.promise_date ? "Sem data de promessa" : list.length === 0 ? "Sem período registrado" : summary.hasGaps ? GAPS_NOTE : "";
      return [{
        id: a.id, name: a.name, color: current ? lifeBranchColor(current) : "#FFFFFF", promiseDate: a.promise_date,
        stars: summary.byBranch, total: summary.years, pending: summary.pending?.n ?? null, note,
      }];
    })
    .sort((x, y) => collator.compare(x.name, y.name));
  return { branches: [...SCOUT_BRANCHES], rows };
}
