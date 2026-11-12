import { todayInSaoPaulo } from "@/lib/fees";
import type { CategoryKind } from "@/lib/categories";
import type { RealizedModel } from "./realized";

/**
 * Realizado publicado no site (página Transparência do institucional), lido no build do Astro.
 * Só rubricas e valores agregados: nada de histórico, descrição de rateio ou associado.
 * Mudou o formato? Suba `version` e atualize o schema em apps/institucional/src/content.config.ts.
 */
export type TransparencyReport = {
  version: 1;
  year: number;
  /** Data e hora da exportação (ISO). */
  generatedAt: string;
  /** Último dia coberto: 31/12 para anos encerrados, hoje para o ano em curso. */
  periodEnd: string;
  /** Mesma ordem e hierarquia da tela/planilha do Realizado; centavos por mês, despesas positivas. */
  rows: { code: string | null; name: string; kind: CategoryKind; depth: number; months: number[] }[];
};

/** Linha extra para o valor lançado direto numa rubrica que tem filhas: sem ela, o grupo não fecha com a soma das filhas. */
export const UNDETAILED = "Sem rubrica detalhada";

export function buildTransparencyReport(model: RealizedModel, now = new Date()): TransparencyReport {
  const today = todayInSaoPaulo(now);
  const yearEnd = `${model.year}-12-31`;
  const rows: TransparencyReport["rows"] = [];
  const walk = (i: number) => {
    const row = model.rows[i];
    rows.push({ code: row.code, name: row.name, kind: row.kind, depth: row.depth, months: row.total });
    row.children.forEach(walk);
    if (row.children.length && row.own.some((v) => v !== 0)) {
      rows.push({ code: null, name: UNDETAILED, kind: row.kind, depth: row.depth + 1, months: row.own });
    }
  };
  for (const kind of ["receita", "despesa"] as const) if (model.roots[kind] !== undefined) walk(model.roots[kind]!);
  return { version: 1, year: model.year, generatedAt: now.toISOString(), periodEnd: today < yearEnd ? today : yearEnd, rows };
}
