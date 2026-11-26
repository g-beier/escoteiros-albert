import { Link } from "@geas/ui/components/link";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconPencil } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/inventory/app-header";
import { locationOptions } from "@/lib/inventory/locations";
import { movementDetail, saleEntryId, signedQuantity } from "@/lib/inventory/movements";
import { materialsBackHref, withBack } from "@/lib/inventory/material-list";
import type { Lot, Movement, Unit } from "@/lib/inventory/model";
import * as locationsData from "@/lib/server/inventory/locations";
import * as materials from "@/lib/server/inventory/materials";
import * as movementsData from "@/lib/server/inventory/movements";
import { AddLotButton, Expiry, LotsTable } from "@/components/inventory/materials/lots-table";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";
import { ReviewButton } from "@/components/inventory/review";
import { ReviewDetails } from "@/components/inventory/review-details";
import { reviewMovements } from "../../movimentacoes/actions";
import { AddUnitButton, UnitsTable } from "@/components/inventory/materials/units-table";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import {
  CONDITION_LABELS, MOVEMENT_LABELS, REVIEW_LABELS, TRACKING_LABELS, WRITE_OFF_LABELS, timestampBR,
  type Condition, type ReviewStatus,
} from "@/lib/inventory/vocabulary";
import { formatCents } from "@/lib/format";
import { pageSession } from "@/lib/server/session";

const REVIEW_TONES: Record<ReviewStatus, string> = {
  para_revisar: "border-caution-line bg-caution-soft text-caution",
  revisado: "text-muted-foreground",
};


export default async function MaterialDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string }> }) {
  const [{ id }, { voltar }] = await Promise.all([params, searchParams]);
  const back = materialsBackHref(voltar);
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const material = await materials.get(db, groupId, id);
  if (!material) notFound();
  const isLot = material.tracking === "lot";

  const [paths, lotData, unitData, movements, nextTag] = await Promise.all([
    locationsData.listPaths(db, groupId),
    isLot ? materials.lots(db, id) : Promise.resolve([] as Lot[]),
    isLot ? Promise.resolve([] as Unit[]) : materials.units(db, id),
    movementsData.forMaterial(db, id, 100),
    !isLot && material.family_id && member.inventory.canWrite ? materials.nextTag(db, material.family_id) : Promise.resolve(null),
  ]);
  const pathOf = new Map(paths.map((row) => [row.id, row.path]));
  const withPath = <T extends { location_id: string }>(rows: T[]) => rows
    .map((row) => ({ ...row, path: pathOf.get(row.location_id) ?? "—" }))
    .sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  const lots = withPath(lotData);
  const units = withPath(unitData);
  const unitLabel = new Map(units.map((row) => [row.id, row.tag ?? row.legacy_code ?? "peça"]));
  const locations = locationOptions(paths);
  const pending = movements.filter((row) => row.review_status === "para_revisar").length;

  return <div className="shell">
    <AppHeader current={`/inventario/materiais/${id}`} member={member} />
    <PageBody width="narrow">
      <PageHeader title={material.name} crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Materiais", href: back }, { label: material.name }]}
        description={material.description ?? undefined}
        actions={member.inventory.canWrite && <Link href={withBack(`/inventario/materiais/${id}/editar`, back)} className={buttonVariants({ variant: "outline", size: "lg" })}><IconPencil data-icon="inline-start" /> Editar material</Link>}>
        <dl className="m-0 flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <Fact label="Controle">{TRACKING_LABELS[material.tracking]}{material.consumable && " · consumível"}</Fact>
          <Fact label="Família">{material.family_name ? <>{material.family_name}{material.family_code && <span className="num text-muted-foreground"> ({material.family_code})</span>}</> : "—"}</Fact>
          <Fact label={isLot ? "Quantidade" : "Peças"}>
            <span className={cn("num inline-flex items-center gap-1 font-semibold", material.below_minimum && "text-destructive")}>
              {material.below_minimum && <IconAlertTriangle className="size-3.5" aria-label="Abaixo do mínimo" />}{material.quantity}
            </span>
            {material.minimum_quantity != null && <span className="text-muted-foreground"> (mínimo {material.minimum_quantity})</span>}
          </Fact>
          <Fact label="Valor estimado"><span className="num">{formatCents(Number(material.estimated_value_cents))}</span></Fact>
          {material.next_expiry && <Fact label="Próxima validade"><Expiry date={material.next_expiry} /></Fact>}
          {material.for_sale && <Fact label="Lojinha">À venda · {material.sale_price_cents != null
            ? <span className="num">{formatCents(material.sale_price_cents)}</span> : <span className="text-muted-foreground">sem preço</span>}</Fact>}
          {!material.active && <Fact label="Situação"><Badge variant="outline">Inativo</Badge></Fact>}
        </dl>
      </PageHeader>
      {member.inventory.canWrite && !member.inventory.canReview && <ReviewNotice />}

      <SectionCard>
        <SectionHeader title={isLot ? "Lotes" : "Peças"} description={isLot
          ? "Cada lote é uma quantidade numa divisão, com condição, valor e validade próprios."
          : "Cada peça tem divisão, condição e etiqueta próprias."}>
          <SectionCount>{isLot ? `${lots.length} ${lots.length === 1 ? "lote" : "lotes"}` : `${units.filter((row) => !row.written_off_at).length} ${units.length === 1 ? "peça" : "peças"}`}</SectionCount>
          {member.inventory.canWrite && material.active && (isLot
            ? <AddLotButton materialId={id} locations={locations} />
            : <AddUnitButton materialId={id} locations={locations} nextTag={nextTag} familyCode={material.family_code} />)}
        </SectionHeader>
        {isLot
          ? <LotsTable materialId={id} materialName={material.name} consumable={material.consumable} lots={lots} locations={locations} canEdit={member.inventory.canWrite} />
          : <UnitsTable materialId={id} units={units} locations={locations} canEdit={member.inventory.canWrite} nextTag={nextTag} familyCode={material.family_code} />}
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Histórico">
          <SectionCount>{movements.length === 100 ? "últimos 100" : `${movements.length} ${movements.length === 1 ? "movimento" : "movimentos"}`}{pending > 0 && ` · ${pending} para revisar`}</SectionCount>
        </SectionHeader>
        {movements.length === 0
          ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum movimento registrado.</p>
          : <div className="overflow-x-auto"><Table className="min-w-[760px]">
            <TableCaption className="sr-only">Histórico de movimentos do material</TableCaption>
            <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
              <TableHead className={cn(HEAD_CLASS, "w-24")}>Data</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-28")}>Movimento</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-20 text-right")}>Qtd.</TableHead>
              <TableHead className={HEAD_CLASS}>Detalhe</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-48")}>Revisão</TableHead>
            </TableRow></TableHeader>
            <TableBody>{movements.map((row) => <TableRow key={row.id}>
              <TableCell className={cn(CELL_CLASS, "num text-muted-foreground")}>{timestampBR(row.created_at)}</TableCell>
              <TableCell className={cn(CELL_CLASS, "font-semibold")}>{MOVEMENT_LABELS[row.kind]}</TableCell>
              <TableCell className={cn(CELL_CLASS, "num text-right")}>{signedQuantity(row) ?? "—"}</TableCell>
              <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>
                {describe(row, pathOf, unitLabel)}
                <SaleEntryLink row={row} canRead={member.finance.canRead} />
                {row.notes && <span className="block text-muted-foreground">{row.notes}</span>}
              </TableCell>
              <TableCell className={CELL_CLASS}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={REVIEW_TONES[row.review_status]}>{REVIEW_LABELS[row.review_status]}</Badge>
                  <ReviewDetails status={row.review_status} channel={row.channel} byYou={row.created_by === user.id} reviewedByYou={row.reviewed_by === user.id}
                    reviewedAt={row.reviewed_at} notes={row.review_notes} />
                  {member.inventory.canReview && row.review_status === "para_revisar" && <ReviewButton id={row.id} action={reviewMovements} />}
                </div>
              </TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}

/** "ver lançamento" da venda ou devolução (019), para quem lê o Financeiro. */
function SaleEntryLink({ row, canRead }: { row: Movement; canRead: boolean }) {
  const entryId = saleEntryId(row);
  if (!entryId || !canRead) return null;
  return <> · <Link href={`/financeiro/lancamentos/${entryId}`} className="font-medium text-primary hover:underline">ver lançamento</Link></>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-0.5"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="m-0">{children}</dd></div>;
}

/** Texto do movimento: de onde para onde, condição, motivo da baixa, contagem antes e depois. */
function describe(row: Movement, pathOf: Map<string, string>, unitLabel: Map<string, string>) {
  const where = (locationId: string | null) => (locationId ? pathOf.get(locationId) ?? "divisão removida" : null);
  const unit = row.unit_id ? unitLabel.get(row.unit_id) : null;
  const prefix = unit ? `${unit}: ` : "";
  const condition = (value: Condition | null) => (value ? CONDITION_LABELS[value].toLowerCase() : "sem condição");
  switch (row.kind) {
    case "entrada": return `${prefix}em ${where(row.to_location_id)}${row.to_condition ? `, ${condition(row.to_condition)}` : ""}`;
    case "transferencia": return `${prefix}${where(row.from_location_id)} → ${where(row.to_location_id)}`;
    case "condicao": return `${prefix}${condition(row.from_condition)} → ${condition(row.to_condition)}`;
    case "ajuste": return `${prefix}Quantidade ${movementDetail(row) || "ajustada"}`;
    case "baixa": return `${prefix}${row.write_off_reason ? WRITE_OFF_LABELS[row.write_off_reason] : "Baixa"}${row.from_location_id ? ` em ${where(row.from_location_id)}` : ""}`;
    case "edicao": return `${prefix}${movementDetail(row)}`;
  }
}
