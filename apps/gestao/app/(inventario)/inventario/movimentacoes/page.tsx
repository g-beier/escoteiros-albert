import Link from "next/link";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/inventory/app-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/inventory/table-head";
import {
  CONDITION_LABELS, MOVEMENT_LABELS, REVIEW_LABELS, WRITE_OFF_LABELS, timestampBR,
  type Condition, type MovementKind, type ReviewStatus,
} from "@/lib/inventory/vocabulary";
import * as locations from "@/lib/server/inventory/locations";
import * as movements from "@/lib/server/inventory/movements";
import { pageSession } from "@/lib/server/session";

const LIMIT = 200;
const STATUSES = Object.keys(REVIEW_LABELS) as ReviewStatus[];
const KINDS = Object.keys(MOVEMENT_LABELS) as MovementKind[];

const REVIEW_BADGE: Record<ReviewStatus, string> = {
  revisado: "bg-success-soft text-success",
  pendente: "bg-[#f5eed1] text-[#725d0d]",
  para_revisar: "bg-destructive/10 text-destructive",
};

type Filters = { revisao?: ReviewStatus; tipo?: MovementKind };

/** Lista com os filtros atuais trocando um deles (sem o parâmetro = todos). */
function href(filters: Filters, change: Filters) {
  const next = { ...filters, ...change };
  const query = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
  return query ? `/inventario/movimentacoes?${query}` : "/inventario/movimentacoes";
}

export default async function Movements({ searchParams }: { searchParams: Promise<{ revisao?: string; tipo?: string }> }) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const filters: Filters = {
    revisao: STATUSES.includes(params.revisao as ReviewStatus) ? params.revisao as ReviewStatus : undefined,
    tipo: KINDS.includes(params.tipo as MovementKind) ? params.tipo as MovementKind : undefined,
  };

  const [rows, paths] = await Promise.all([
    movements.list(member.db, member.groupId, { review: filters.revisao, kind: filters.tipo }, LIMIT),
    locations.listPaths(member.db, member.groupId),
  ]);
  const pathOf = new Map(paths.map((p) => [p.id, p.path]));
  const dash = <span className="text-muted-foreground">—</span>;

  return <div className="shell">
    <AppHeader current="/inventario/movimentacoes" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody>
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
      <SectionCard>
        <SectionHeader title="Histórico">
          <SectionCount>{rows.length === LIMIT ? `últimas ${LIMIT}` : `${rows.length} ${rows.length === 1 ? "movimentação" : "movimentações"}`}</SectionCount>
        </SectionHeader>
        {rows.length === 0
          ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">{filters.revisao || filters.tipo ? "Nenhuma movimentação com estes filtros." : "Nenhuma movimentação registrada ainda."}</p>
          : <div className="overflow-x-auto"><Table className="min-w-[1080px]">
            <TableCaption className="sr-only">Movimentações do inventário</TableCaption>
            <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD_CLASS, "w-24")}>Data</TableHead>
              <TableHead className={HEAD_CLASS}>Material</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-32")}>Tipo</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-24 text-right")}>Quantidade</TableHead>
              <TableHead className={HEAD_CLASS}>Divisão</TableHead>
              <TableHead className={HEAD_CLASS}>Detalhe</TableHead>
              <TableHead className={HEAD_CLASS}>Observação</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-40")}>Revisão</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((m) => {
              const from = m.from_location_id ? pathOf.get(m.from_location_id) : undefined;
              // Ajuste e edição não gravam divisão: mostra onde o lote/peça está.
              const to = m.to_location_id ? pathOf.get(m.to_location_id) : !from && m.item_location_id ? pathOf.get(m.item_location_id) : undefined;
              const quantity = signedQuantity(m);
              return <TableRow key={m.id}>
                <TableCell className={cn(CELL_CLASS, "num text-muted-foreground")}>{timestampBR(m.created_at)}</TableCell>
                <TableCell className={cn(CELL_CLASS, "font-semibold")}><Link href={`/inventario/materiais/${m.material_id}`} className="hover:underline">{m.material_name}</Link></TableCell>
                <TableCell className={CELL_CLASS}><Badge variant="outline">{MOVEMENT_LABELS[m.kind]}</Badge></TableCell>
                <TableCell className={cn(CELL_CLASS, "num text-right font-semibold", quantity?.startsWith("−") && "text-destructive", quantity?.startsWith("+") && "text-success")}>{quantity ?? dash}</TableCell>
                <TableCell className={cn(CELL_CLASS, "max-w-72")}>{from && to ? <>{from} <span className="text-muted-foreground">→</span> {to}</> : from ?? to ?? dash}</TableCell>
                <TableCell className={cn(CELL_CLASS, "max-w-96 whitespace-normal")}><Detail row={m} dash={dash} /></TableCell>
                <TableCell className={cn(CELL_CLASS, "max-w-64 truncate")} title={m.notes ?? undefined}>{m.notes || dash}</TableCell>
                <TableCell className={CELL_CLASS}><Badge className={REVIEW_BADGE[m.review_status]}>{REVIEW_LABELS[m.review_status]}</Badge></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}

/** O que mudou: condição com as pills (de → para), ajuste e edição com antes → depois; peça identificada pela etiqueta. */
function Detail({ row, dash }: { row: MovementListRow; dash: React.ReactNode }) {
  const unit = row.unit_label && <span className="num mr-1.5 text-muted-foreground">{row.unit_label}</span>;
  if (row.kind === "condicao") {
    return <span className="inline-flex flex-wrap items-center gap-1.5">{unit}
      <ConditionPill condition={row.from_condition} /><span className="text-muted-foreground" aria-hidden>→</span><span className="sr-only">para</span><ConditionPill condition={row.to_condition} />
    </span>;
  }
  if (row.kind === "entrada" && row.to_condition) return <span className="inline-flex items-center">{unit}<ConditionPill condition={row.to_condition} /></span>;
  const detail = movementDetail(row);
  return detail || unit ? <span className={cn(row.kind === "ajuste" && "num")}>{unit}{detail}</span> : dash;
}
