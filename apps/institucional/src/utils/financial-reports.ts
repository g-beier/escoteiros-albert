import { z } from 'zod';

/**
 * Realizado exportado pelo financeiro ("Exportar para o site", /exportar/transparencia?ano=AAAA).
 * Coloque o arquivo em src/data/prestacao-contas/; o build valida e gera a seção na página Transparência.
 * Formato definido em apps/financeiro/lib/export/transparency.ts (mantenha os dois em sincronia).
 */
const reportSchema = z.object({
  version: z.literal(1),
  year: z.number().int(),
  generatedAt: z.string(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z
    .array(
      z.object({
        code: z.string().nullable(),
        name: z.string(),
        kind: z.enum(['receita', 'despesa']),
        depth: z.number().int().min(0),
        months: z.array(z.number().int()).length(12),
      })
    )
    .min(1),
});

export type FinancialReport = z.infer<typeof reportSchema>;
export type FinancialReportRow = FinancialReport['rows'][number];

const files = import.meta.glob('../data/prestacao-contas/*.json', { eager: true, import: 'default' });

/** Relatórios publicados, do ano mais recente para o mais antigo. Arquivo inválido quebra o build. */
export function getFinancialReports(): FinancialReport[] {
  return Object.entries(files)
    .map(([path, data]) => {
      const parsed = reportSchema.safeParse(data);
      if (!parsed.success) throw new Error(`${path}: formato inválido — ${parsed.error.message}`);
      return parsed.data;
    })
    .sort((a, b) => b.year - a.year);
}

export const sumMonths = (months: number[]) => months.reduce((a, b) => a + b, 0);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatCents = (cents: number) => brl.format(cents / 100);

/** "12/11/2026" a partir de "2026-11-12". */
export const formatDateBR = (iso: string) => iso.split('-').reverse().join('/');
