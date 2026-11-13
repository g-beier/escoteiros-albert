import { PageBody, PageHeader } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/app-header";
import { SetupNeeded } from "@/components/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";
import { MOVEMENT_LABELS, dateTimeBR, relatedName, type MovementType } from "@/lib/inventory";
import { pageSession } from "@/lib/session";

const LIMIT = 100;

export default async function Movements() {
  const { supabase, user, membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const { data } = await supabase.from("inventory_movements")
    .select("id,movement_type,quantity,notes,occurred_at,inventory_items(name),from_location:inventory_locations!inventory_movements_from_location_id_fkey(name),to_location:inventory_locations!inventory_movements_to_location_id_fkey(name)")
    .eq("group_id", membership.groupId).order("occurred_at", { ascending: false }).limit(LIMIT);
  const rows = data ?? [];
  const dash = <span className="text-muted-foreground">—</span>;

  return <div className="shell">
    <AppHeader current="/movimentacoes" email={user.email ?? ""} role={membership.role} />
    <PageBody>
      <PageHeader title="Movimentações" crumbs={[{ label: "Movimentações" }]} description="Entradas, saídas, transferências e ajustes de estoque." />
      <SectionCard>
        <SectionHeader title="Histórico"><SectionCount>{rows.length === LIMIT ? `últimas ${LIMIT}` : `${rows.length} ${rows.length === 1 ? "movimentação" : "movimentações"}`}</SectionCount></SectionHeader>
        {rows.length === 0
          ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma movimentação registrada ainda.</p>
          : <div className="overflow-x-auto"><Table className="min-w-[860px]">
            <TableCaption className="sr-only">Movimentações do inventário</TableCaption>
            <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD_CLASS, "w-24")}>Data</TableHead>
              <TableHead className={HEAD_CLASS}>Item</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-32")}>Tipo</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-28 text-right")}>Quantidade</TableHead>
              <TableHead className={HEAD_CLASS}>Origem</TableHead>
              <TableHead className={HEAD_CLASS}>Destino</TableHead>
              <TableHead className={HEAD_CLASS}>Observação</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((movement) => <TableRow key={movement.id}>
              <TableCell className={cn(CELL_CLASS, "num text-muted-foreground")}>{dateTimeBR(movement.occurred_at)}</TableCell>
              <TableCell className={cn(CELL_CLASS, "font-semibold")}>{relatedName(movement.inventory_items)}</TableCell>
              <TableCell className={CELL_CLASS}><Badge variant="outline">{MOVEMENT_LABELS[movement.movement_type as MovementType]}</Badge></TableCell>
              <TableCell className={cn(CELL_CLASS, "num text-right font-semibold")}>{movement.quantity}</TableCell>
              <TableCell className={CELL_CLASS}>{relatedName(movement.from_location) || dash}</TableCell>
              <TableCell className={CELL_CLASS}>{relatedName(movement.to_location) || dash}</TableCell>
              <TableCell className={cn(CELL_CLASS, "max-w-64 truncate")}>{movement.notes || dash}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}
