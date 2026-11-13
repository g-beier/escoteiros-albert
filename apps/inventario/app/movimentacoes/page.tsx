import Link from "next/link";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/app-header";
import { SetupNeeded } from "@/components/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";
import {
  CONDITION_LABELS, MOVEMENT_LABELS, REVIEW_LABELS, WRITE_OFF_LABELS, relatedName, timestampBR,
  type Condition, type MovementKind, type ReviewStatus, type WriteOffReason,
} from "@/lib/inventory";
import { pageSession } from "@/lib/session";

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
  return query ? `/movimentacoes?${query}` : "/movimentacoes";
}

export default async function Movements({ searchParams }: { searchParams: Promise<{ revisao?: string; tipo?: string }> }) {
  const params = await searchParams;
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const filters: Filters = {
    revisao: STATUSES.includes(params.revisao as ReviewStatus) ? params.revisao as ReviewStatus : undefined,
    tipo: KINDS.includes(params.tipo as MovementKind) ? params.tipo as MovementKind : undefined,
  };

  let query = supabase.from("inventory_movements")
    .select("id, kind, quantity, from_location_id, to_location_id, from_condition, to_condition, write_off_reason, notes, review_status, created_at, material_id, inventory_materials(name)")
    .eq("group_id", member.groupId);
  if (filters.revisao) query = query.eq("review_status", filters.revisao);
  if (filters.tipo) query = query.eq("kind", filters.tipo);
  const [{ data }, { data: paths }] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(LIMIT),
    supabase.from("inventory_location_paths").select("id, path").eq("group_id", member.groupId),
  ]);
  const rows = data ?? [];
  const pathOf = new Map((paths ?? []).map((p) => [p.id as string, p.path as string]));
  const dash = <span className="text-muted-foreground">—</span>;
  const condition = (value: string | null) => value ? CONDITION_LABELS[value as Condition] : "sem condição";

  return <div className="shell">
    <AppHeader current="/movimentacoes" email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody>
      <PageHeader title="Movimentações" crumbs={[{ label: "Movimentações" }]}
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
              const to = m.to_location_id ? pathOf.get(m.to_location_id) : undefined;
              const detail = m.kind === "condicao" ? `${condition(m.from_condition)} → ${condition(m.to_condition)}`
                : m.kind === "baixa" && m.write_off_reason ? WRITE_OFF_LABELS[m.write_off_reason as WriteOffReason]
                : m.kind === "entrada" && m.to_condition ? condition(m.to_condition) : "";
              return <TableRow key={m.id}>
                <TableCell className={cn(CELL_CLASS, "num text-muted-foreground")}>{timestampBR(m.created_at)}</TableCell>
                <TableCell className={cn(CELL_CLASS, "font-semibold")}><Link href={`/materiais/${m.material_id}`} className="hover:underline">{relatedName(m.inventory_materials)}</Link></TableCell>
                <TableCell className={CELL_CLASS}><Badge variant="outline">{MOVEMENT_LABELS[m.kind as MovementKind]}</Badge></TableCell>
                <TableCell className={cn(CELL_CLASS, "num text-right font-semibold")}>{m.quantity ?? dash}</TableCell>
                <TableCell className={cn(CELL_CLASS, "max-w-72")}>{from && to ? <>{from} <span className="text-muted-foreground">→</span> {to}</> : from ?? to ?? dash}</TableCell>
                <TableCell className={CELL_CLASS}>{detail || dash}</TableCell>
                <TableCell className={cn(CELL_CLASS, "max-w-64 truncate")} title={m.notes ?? undefined}>{m.notes || dash}</TableCell>
                <TableCell className={CELL_CLASS}><Badge className={REVIEW_BADGE[m.review_status as ReviewStatus]}>{REVIEW_LABELS[m.review_status as ReviewStatus]}</Badge></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}
