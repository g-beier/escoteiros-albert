import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { SectionCount } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/inventory/app-header";
import { SoftSectionCard } from "@/components/inventory/soft-section-card";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { SOFT_CELL, SOFT_HEAD, SOFT_ROW_DARK, SOFT_ROW_LIGHT, SOFT_TABLE, softRowRound } from "@/components/inventory/table-head";
import {
  CONDITION_LABELS, MOVEMENT_LABELS, REVIEW_LABELS, WRITE_OFF_LABELS, timestampBR,
  type Condition, type MovementKind, type ReviewStatus,
} from "@/lib/inventory/vocabulary";
import * as locations from "@/lib/server/inventory/locations";
import * as movements from "@/lib/server/inventory/movements";
import { pageSession } from "@/lib/server/session";

const PAGE_SIZE = 15;
const STATUSES = Object.keys(REVIEW_LABELS) as ReviewStatus[];
const KINDS = Object.keys(MOVEMENT_LABELS) as MovementKind[];

const REVIEW_FILL: Record<ReviewStatus, string> = {
  revisado: "bg-muted text-muted-foreground",
  pendente: "bg-[#fdab3d] text-white",
  para_revisar: "bg-[#e2445c] text-white",
};

const DATA_COL = "w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem]";
const MATERIAL_COL = "w-[14rem] min-w-[12rem]";
const TIPO_COL = "w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem]";
const QTD_COL = "w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem]";
const DIVISAO_COL = "w-[14rem] min-w-[12rem]";
const DETALHE_COL = "w-[11rem] min-w-[10rem]";
const OBS_COL = "w-[11rem] min-w-[9rem]";
const REVISAO_COL = "w-[8.5rem] min-w-[8.5rem] max-w-[8.5rem]";

type Filters = { revisao?: ReviewStatus; tipo?: MovementKind; pagina?: number };

/** Lista com os filtros atuais trocando um deles (sem o parâmetro = todos). Troca de filtro reinicia a página. */
function href(filters: Filters, change: Filters) {
  const next: Filters = { ...filters, ...change };
  if (!("pagina" in change)) next.pagina = undefined;
  const q = new URLSearchParams();
  if (next.revisao) q.set("revisao", next.revisao);
  if (next.tipo) q.set("tipo", next.tipo);
  if (next.pagina != null && next.pagina > 1) q.set("pagina", String(next.pagina));
  const s = q.toString();
  return s ? `/inventario/movimentacoes?${s}` : "/inventario/movimentacoes";
}

export default async function Movements({ searchParams }: { searchParams: Promise<{ revisao?: string; tipo?: string; pagina?: string }> }) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const filters: Filters = {
    revisao: STATUSES.includes(params.revisao as ReviewStatus) ? params.revisao as ReviewStatus : undefined,
    tipo: KINDS.includes(params.tipo as MovementKind) ? params.tipo as MovementKind : undefined,
  };
  const pageRequested = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const [{ rows: pageRows, total }, paths] = await Promise.all([
    movements.listPage(member.db, member.groupId, { review: filters.revisao, kind: filters.tipo }, pageRequested, PAGE_SIZE),
    locations.listPaths(member.db, member.groupId),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageRequested, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pathOf = new Map(paths.map((p) => [p.id, p.path]));
  const condition = (value: Condition | null) => value ? CONDITION_LABELS[value] : "sem condição";

  return <div className="shell">
    <AppHeader current="/inventario/movimentacoes" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Movimentações" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Movimentações" }]}
        description="Toda mudança no inventário: entradas, transferências, condição, ajustes, baixas e edições. Os movimentos dos chefes ficam pendentes até a revisão do gestor.">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SectionTabs label="Revisão" tabs={[
            { href: href(filters, { revisao: undefined }), label: "Todas", active: !filters.revisao },
            ...STATUSES.map((status) => ({ href: href(filters, { revisao: status }), label: REVIEW_LABELS[status], active: filters.revisao === status })),
          ]} />
          <SectionTabs label="Tipo" tabs={[
            { href: href(filters, { tipo: undefined }), label: "Todos os tipos", active: !filters.tipo },
            ...KINDS.map((kind) => ({ href: href(filters, { tipo: kind }), label: MOVEMENT_LABELS[kind], active: filters.tipo === kind })),
          ]} />
        </div>
      </PageHeader>

      <section className="grid gap-2">
        <BlockIntro
          title="Movimentos"
          description={filters.revisao || filters.tipo ? "Resultado dos filtros de revisão e tipo." : "Lista cronológica das mudanças no inventário."}
          actions={<SectionCount>{`${total} ${total === 1 ? "movimento" : "movimentos"}`}</SectionCount>}
        />
        <SoftSectionCard>
          {total === 0
            ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">{filters.revisao || filters.tipo ? "Nenhum movimento com estes filtros." : "Nenhum movimento registrado ainda."}</p>
            : <div className="grid gap-2 p-3">
              <div className="overflow-x-auto"><Table className={cn(SOFT_TABLE, "min-w-[68rem] table-fixed")}>
                <TableCaption className="sr-only">Movimentações do inventário</TableCaption>
                <TableHeader className="[&_tr]:border-0"><TableRow className="border-0 hover:bg-transparent">
                  <TableHead className={cn(SOFT_HEAD, DATA_COL, "rounded-l-2xl text-left")}>Data</TableHead>
                  <TableHead className={cn(SOFT_HEAD, MATERIAL_COL, "text-left")}>Material</TableHead>
                  <TableHead className={cn(SOFT_HEAD, TIPO_COL, "text-left")}>Tipo</TableHead>
                  <TableHead className={cn(SOFT_HEAD, QTD_COL, "text-left")}>Quantidade</TableHead>
                  <TableHead className={cn(SOFT_HEAD, DIVISAO_COL, "text-left")}>Divisão</TableHead>
                  <TableHead className={cn(SOFT_HEAD, DETALHE_COL, "text-left")}>Detalhe</TableHead>
                  <TableHead className={cn(SOFT_HEAD, OBS_COL, "text-left")}>Observação</TableHead>
                  <TableHead className={cn(SOFT_HEAD, REVISAO_COL, "rounded-r-2xl text-left")}>Revisão</TableHead>
                </TableRow></TableHeader>
                <TableBody>{pageRows.map((m, index) => {
                  const dark = index % 2 === 1;
                  const rowBg = dark ? SOFT_ROW_DARK : SOFT_ROW_LIGHT;
                  const round = softRowRound(dark);
                  const from = m.from_location_id ? pathOf.get(m.from_location_id) : undefined;
                  const to = m.to_location_id ? pathOf.get(m.to_location_id) : undefined;
                  const detail = m.kind === "condicao" ? `${condition(m.from_condition)} → ${condition(m.to_condition)}`
                    : m.kind === "baixa" && m.write_off_reason ? WRITE_OFF_LABELS[m.write_off_reason]
                    : m.kind === "entrada" && m.to_condition ? condition(m.to_condition) : "";
                  return <TableRow key={m.id} className="border-0 hover:bg-transparent">
                    <TableCell className={cn(SOFT_CELL, DATA_COL, "num text-left text-muted-foreground font-normal", rowBg, round)}>{timestampBR(m.created_at)}</TableCell>
                    <TableCell className={cn(SOFT_CELL, MATERIAL_COL, "text-left font-normal", rowBg, round)}>
                      <Link href={`/inventario/materiais/${m.material_id}`} className="block truncate underline-offset-2 hover:underline" title={m.material_name}>{m.material_name}</Link>
                    </TableCell>
                    <TableCell className={cn(SOFT_CELL, TIPO_COL, "truncate text-left font-normal", rowBg, round)}>{MOVEMENT_LABELS[m.kind]}</TableCell>
                    <TableCell className={cn(SOFT_CELL, QTD_COL, "num text-left font-normal", rowBg, round)}>{m.quantity ?? ""}</TableCell>
                    <TableCell className={cn(SOFT_CELL, DIVISAO_COL, "truncate text-left font-normal", rowBg, round)} title={from && to ? `${from} → ${to}` : from ?? to ?? undefined}>
                      {from && to ? <>{from} <span className="text-muted-foreground">→</span> {to}</> : from ?? to ?? ""}
                    </TableCell>
                    <TableCell className={cn(SOFT_CELL, DETALHE_COL, "truncate text-left font-normal", rowBg, round)} title={detail || undefined}>{detail}</TableCell>
                    <TableCell className={cn(SOFT_CELL, OBS_COL, "truncate text-left font-normal text-muted-foreground", rowBg, round)} title={m.notes ?? undefined}>{m.notes ?? ""}</TableCell>
                    <TableCell className={cn(SOFT_CELL, REVISAO_COL, "text-left", rowBg, round)}>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", REVIEW_FILL[m.review_status])}>
                        {REVIEW_LABELS[m.review_status]}
                      </span>
                    </TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table></div>
              {pageCount > 1 && <Pagination
                page={page}
                pageCount={pageCount}
                from={pageStart + 1}
                to={pageStart + pageRows.length}
                total={total}
                prevHref={page > 1 ? href(filters, { pagina: page - 1 }) : null}
                nextHref={page < pageCount ? href(filters, { pagina: page + 1 }) : null}
              />}
            </div>}
        </SoftSectionCard>
      </section>
    </PageBody>
  </div>;
}

function BlockIntro({ title, description, actions }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode;
}) {
  return <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-1">
    <div className="min-w-0">
      <h2 className="m-0 text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="m-0 text-xs text-balance text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </header>;
}

function Pagination({ page, pageCount, from, to, total, prevHref, nextHref }: {
  page: number; pageCount: number; from: number; to: number; total: number;
  prevHref: string | null; nextHref: string | null;
}) {
  const btn = "inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40";
  return <nav className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1" aria-label="Paginação do histórico">
    <p className="m-0 text-xs text-muted-foreground">
      <span className="num font-semibold text-foreground">{from}–{to}</span> de{" "}
      <span className="num font-semibold text-foreground">{total}</span>
      <span className="sr-only"> (página {page} de {pageCount})</span>
    </p>
    <div className="flex items-center gap-1.5">
      {prevHref
        ? <Link href={prevHref} className={btn} aria-label="Página anterior"><IconChevronLeft className="size-4" /></Link>
        : <span className={btn} aria-disabled="true"><IconChevronLeft className="size-4" /></span>}
      <span className="num px-1 text-xs text-muted-foreground">{page}/{pageCount}</span>
      {nextHref
        ? <Link href={nextHref} className={btn} aria-label="Próxima página"><IconChevronRight className="size-4" /></Link>
        : <span className={btn} aria-disabled="true"><IconChevronRight className="size-4" /></span>}
    </div>
  </nav>;
}
