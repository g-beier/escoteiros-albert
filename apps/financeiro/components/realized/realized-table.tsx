"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { MONTHS, MONTHS_SHORT } from "@/lib/export/period";
import { rowFilterTokens, type RealizedModel } from "@/lib/export/realized";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Período do mês (0–11) ou do ano inteiro (12), limites inclusivos. */
function bounds(year: number, month: number) {
  if (month === 12) return { de: `${year}-01-01`, ate: `${year}-12-31` };
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { de: `${year}-${pad(month + 1)}-01`, ate: `${year}-${pad(month + 1)}-${pad(lastDay)}` };
}

/**
 * Realizado do ano na tela: rubricas × meses, com pais somando os filhos (mesmo modelo da planilha).
 * Cada valor leva ao Detalhamento filtrado pela rubrica (o filtro compacto já inclui as filhas) e pelo período.
 */
export function RealizedTable({ model }: { model: RealizedModel }) {
  const { year, rows, roots } = model;
  const parents = useMemo(() => rows.flatMap((row, i) => row.children.length ? [i] : []), [rows]);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const blocks = (["receita", "despesa"] as const).flatMap((kind) => roots[kind] === undefined ? [] : [{ kind, root: roots[kind]! }]);

  const visible = (root: number) => {
    const out: number[] = [];
    const walk = (i: number) => { out.push(i); if (!collapsed.has(i)) rows[i].children.forEach(walk); };
    walk(root);
    return out;
  };
  const toggle = (i: number) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(i)) next.add(i);
    return next;
  });

  const hrefFor = (i: number, month: number) => {
    const tokens = rowFilterTokens(model, i);
    if (!tokens.length) return null;
    return `/lancamentos/detalhamento?${new URLSearchParams({ rubrica: tokens.join(","), ...bounds(year, month) })}`;
  };

  const valueCell = (cents: number, href: string | null, title: string, bold: boolean) => {
    const text = cents ? money(cents / 100) : "—";
    const className = cn("num whitespace-nowrap", cents < 0 && "text-destructive", !cents && "text-muted-foreground/60", bold && "font-semibold");
    return href && cents
      ? <Link href={href} title={title} className={cn(className, "text-inherit no-underline hover:underline")}>{text}</Link>
      : <span className={className}>{text}</span>;
  };

  const totalOf = (i: number | undefined) => i === undefined ? Array<number>(12).fill(0) : rows[i].total;
  const saldo = totalOf(roots.receita).map((v, m) => v - totalOf(roots.despesa)[m]);

  if (!blocks.length) {
    return <p className="m-0 rounded-lg border bg-card px-4 py-8 text-center text-muted-foreground">Nenhuma rubrica com código nem movimento em {year}. Cadastre as rubricas em Configurações › Rubricas.</p>;
  }

  return <div className="flex flex-col gap-2 md:min-h-0 md:flex-1">
    <div className="flex flex-wrap items-center gap-2">
      <p className="m-0 text-xs text-muted-foreground">Despesas aparecem positivas; estornos, negativos. Clique em um valor para ver os rateios.</p>
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())} disabled={!collapsed.size}>Expandir tudo</Button>
        <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set(parents.filter((i) => rows[i].depth >= 1)))}>Só grupos</Button>
      </div>
    </div>
    <div className="overflow-auto rounded-lg border bg-card md:min-h-0">
      <table className="w-full min-w-[1180px] border-collapse text-xs">
        <caption className="sr-only">Realizado de {year}: receitas e despesas por rubrica, mês a mês</caption>
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-64 bg-muted px-3 py-2 text-left font-semibold">Rubrica</th>
            {MONTHS_SHORT.map((m, i) => <th key={m} scope="col" className="w-24 px-2 py-2 text-right font-semibold"><abbr title={MONTHS[i]} className="no-underline">{m.charAt(0) + m.slice(1).toLowerCase()}</abbr></th>)}
            <th scope="col" className="w-28 px-3 py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        {blocks.map(({ kind, root }) => <tbody key={kind} className="border-t-2 border-border first:border-t-0">
          {visible(root).map((i) => {
            const row = rows[i];
            const hasChildren = row.children.length > 0;
            const isCollapsed = collapsed.has(i);
            const strong = row.depth === 0 || hasChildren;
            // opaco: a primeira coluna é fixa e passa por cima dos valores ao rolar
            const rowBg = row.depth === 0 ? (kind === "receita" ? "bg-success-soft" : "bg-[color-mix(in_srgb,var(--destructive)_10%,var(--card))]") : "bg-card";
            return <tr key={row.id} className={cn("border-t border-border/60", rowBg)}>
              <th scope="row" className={cn("sticky left-0 px-3 py-1 text-left text-xs tracking-normal normal-case text-foreground", rowBg, strong ? "font-semibold" : "font-normal")}>
                <div className="flex items-center gap-1" style={{ paddingLeft: `${row.depth * 14}px` }}>
                  {hasChildren
                    ? <button type="button" onClick={() => toggle(i)} aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? "Expandir" : "Recolher"} ${row.label}`}
                        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                        {isCollapsed ? <IconChevronRight className="size-3.5" aria-hidden /> : <IconChevronDown className="size-3.5" aria-hidden />}
                      </button>
                    : <span className="size-5 shrink-0" aria-hidden />}
                  <span className={cn("whitespace-nowrap", row.depth === 0 && (kind === "receita" ? "text-success" : "text-destructive"))}>{row.label}</span>
                </div>
              </th>
              {row.total.map((cents, m) => <td key={m} className="px-2 py-1 text-right">{valueCell(cents, hrefFor(i, m), `${row.label} — ${MONTHS[m]} de ${year}`, strong)}</td>)}
              <td className="px-3 py-1 text-right">{valueCell(sum(row.total), hrefFor(i, 12), `${row.label} — ${year}`, true)}</td>
            </tr>;
          })}
        </tbody>)}
        <tfoot className="sticky bottom-0 z-10 bg-muted shadow-[0_-1px_0_var(--border)]">
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-1.5 text-left text-xs font-semibold tracking-normal normal-case text-foreground">Saldo (receitas − despesas)</th>
            {saldo.map((cents, m) => <td key={m} className="px-2 py-1.5 text-right">{valueCell(cents, null, "", true)}</td>)}
            <td className="px-3 py-1.5 text-right">{valueCell(sum(saldo), null, "", true)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>;
}
