import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconPencil } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCount } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/inventory/app-header";
import { SoftSectionCard } from "@/components/inventory/soft-section-card";
import { locationOptions } from "@/lib/inventory/locations";
import type { Lot, Movement, Unit } from "@/lib/inventory/model";
import * as locationsData from "@/lib/server/inventory/locations";
import * as materials from "@/lib/server/inventory/materials";
import * as movementsData from "@/lib/server/inventory/movements";
import { AddLotButton, Expiry, LotsTable } from "@/components/inventory/materials/lots-table";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";
import { AddUnitButton, UnitsTable } from "@/components/inventory/materials/units-table";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { SOFT_CELL, SOFT_HEAD, SOFT_ROW_DARK, SOFT_ROW_LIGHT, SOFT_TABLE, softRowRound } from "@/components/inventory/table-head";
import {
  CONDITION_LABELS, MATERIAL_OWNER_DOT, MATERIAL_OWNER_LABELS, MATERIAL_STATUS_LABELS,
  MOVEMENT_LABELS, REVIEW_LABELS, TRACKING_LABELS, WRITE_OFF_LABELS, materialStatus, ownerFromLocationPath, timestampBR,
  type Condition, type MaterialOwner, type MaterialStatus, type ReviewStatus,
} from "@/lib/inventory/vocabulary";
import { formatInventoryCents } from "@/lib/format";
import { pageSession } from "@/lib/server/session";

const STATUS_FILL: Record<MaterialStatus, string> = {
  bom: "bg-[#00c875] text-white",
  medio: "bg-[#fdab3d] text-white",
  ruim: "bg-[#e2445c] text-white",
};

const REVIEW_FILL: Record<ReviewStatus, string> = {
  revisado: "bg-muted text-muted-foreground",
  pendente: "bg-[#fdab3d] text-white",
  para_revisar: "bg-[#e2445c] text-white",
};

const EDIT_ACTIONS: Record<string, string> = {
  material_created: "Material cadastrado", material_updated: "Material editado", lot_updated: "Dados do lote editados", unit_updated: "Dados da peça editados",
};

export default async function MaterialDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const material = await materials.get(db, groupId, id);
  if (!material) notFound();
  const isLot = material.tracking === "lot";
  const status = materialStatus(material);

  const [paths, lotData, unitData, movements, nextTag] = await Promise.all([
    locationsData.listPaths(db, groupId),
    isLot ? materials.lots(db, id) : Promise.resolve([] as Lot[]),
    isLot ? Promise.resolve([] as Unit[]) : materials.units(db, id),
    movementsData.forMaterial(db, id, 100),
    !isLot && material.family_id && member.inventory.canEdit ? materials.nextTag(db, material.family_id) : Promise.resolve(null),
  ]);
  const pathOf = new Map(paths.map((row) => [row.id, row.path]));
  const withPath = <T extends { location_id: string }>(rows: T[]) => rows
    .map((row) => ({ ...row, path: pathOf.get(row.location_id) ?? "—" }))
    .sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  const lots = withPath(lotData);
  const units = withPath(unitData);
  const unitLabel = new Map(units.map((row) => [row.id, row.tag ?? row.legacy_code ?? "peça"]));
  const locations = locationOptions(paths);
  const pending = movements.filter((row) => row.review_status !== "revisado").length;
  const stockCount = isLot ? lots.length : units.filter((row) => !row.written_off_at).length;
  const primaryPath = (isLot ? lots[0]?.path : units.find((row) => !row.written_off_at)?.path) ?? "";
  const owner = ownerFromLocationPath(primaryPath);

  return <div className="shell">
    <AppHeader current={`/inventario/materiais/${id}`} email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title={material.name} crumbs={[{ label: "Inventário", href: "/inventario" }, { label: material.name }]}
        description={material.description ?? undefined}
        actions={member.inventory.canEdit && <Link href={`/inventario/materiais/${id}/editar`} className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "rounded-md border-transparent bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}><IconPencil data-icon="inline-start" /> Editar material</Link>} />
      {member.inventory.canEdit && !member.inventory.canManage && <ReviewNotice />}

      <section className="grid gap-2">
        <BlockIntro
          title="Resumo"
          description={`${TRACKING_LABELS[material.tracking]}${material.consumable ? " · consumível" : ""}${!material.active ? " · inativo" : ""}`}
        />
        <SoftSectionCard>
          <dl className="m-0 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
            <Fact label="Estado">
              <span className={cn("inline-flex min-w-[4.25rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_FILL[status])}>
                {MATERIAL_STATUS_LABELS[status]}
              </span>
            </Fact>
            {owner && <Fact label="Dono"><OwnerCell owner={owner} /></Fact>}
            <Fact label="Categoria">
              {material.family_name
                ? (material.family_code ? <span className="num">{material.family_code} - {material.family_name}</span> : material.family_name)
                : "—"}
            </Fact>
            <Fact label={isLot ? "Quantidade" : "Peças"}>
              <span className={cn("num inline-flex items-center gap-1 font-semibold", material.below_minimum && "text-[#e2445c]")}>
                {material.below_minimum && <IconAlertTriangle className="size-3.5" aria-label="Abaixo do mínimo" />}
                {material.quantity}
              </span>
              {material.minimum_quantity != null && <span className="text-muted-foreground"> (mín. {material.minimum_quantity})</span>}
            </Fact>
            <Fact label="Valor estimado"><span className="num">{formatInventoryCents(Number(material.estimated_value_cents))}</span></Fact>
            {material.next_expiry && <Fact label="Próxima validade"><Expiry date={material.next_expiry} /></Fact>}
          </dl>
        </SoftSectionCard>
      </section>

      <section className="grid gap-2">
        <BlockIntro
          title={isLot ? "Lotes" : "Peças"}
          description={isLot
            ? "Cada lote é uma quantidade numa divisão, com condição, valor e validade próprios."
            : "Cada peça tem divisão, condição e etiqueta próprias."}
          actions={<>
            <SectionCount>
              {isLot
                ? `${stockCount} ${stockCount === 1 ? "lote" : "lotes"}`
                : `${stockCount} ${stockCount === 1 ? "peça" : "peças"}`}
            </SectionCount>
            {member.inventory.canEdit && material.active && (isLot
              ? <AddLotButton materialId={id} locations={locations} />
              : <AddUnitButton materialId={id} locations={locations} nextTag={nextTag} familyCode={material.family_code} />)}
          </>}
        />
        <SoftSectionCard>
          {isLot
            ? <LotsTable materialId={id} lots={lots} locations={locations} canEdit={member.inventory.canEdit} />
            : <UnitsTable materialId={id} units={units} locations={locations} canEdit={member.inventory.canEdit} nextTag={nextTag} familyCode={material.family_code} />}
        </SoftSectionCard>
      </section>

      <section className="grid gap-2">
        <BlockIntro
          title="Histórico"
          actions={<SectionCount>
            {movements.length === 100 ? "últimos 100" : `${movements.length} ${movements.length === 1 ? "movimento" : "movimentos"}`}
            {pending > 0 && ` · ${pending} a revisar`}
          </SectionCount>}
        />
        <SoftSectionCard>
          {movements.length === 0
            ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum movimento registrado.</p>
            : <div className="grid gap-2 p-3">
              <div className="overflow-x-auto"><Table className={SOFT_TABLE}>
                <TableCaption className="sr-only">Histórico de movimentos do material</TableCaption>
                <TableHeader className="[&_tr]:border-0"><TableRow className="border-0 hover:bg-transparent">
                  <TableHead className={cn(SOFT_HEAD, "w-28 rounded-l-2xl")}>Data</TableHead>
                  <TableHead className={cn(SOFT_HEAD, "w-32")}>Movimento</TableHead>
                  <TableHead className={cn(SOFT_HEAD, "w-20 text-right")}>Qtd.</TableHead>
                  <TableHead className={SOFT_HEAD}>Detalhe</TableHead>
                  <TableHead className={cn(SOFT_HEAD, "w-40 rounded-r-2xl")}>Revisão</TableHead>
                </TableRow></TableHeader>
                <TableBody>{movements.map((row, index) => {
                  const dark = index % 2 === 1;
                  const rowBg = dark ? SOFT_ROW_DARK : SOFT_ROW_LIGHT;
                  const round = softRowRound(dark);
                  return <TableRow key={row.id} className="border-0 hover:bg-transparent">
                    <TableCell className={cn(SOFT_CELL, "num text-muted-foreground font-normal", rowBg, round)}>{timestampBR(row.created_at)}</TableCell>
                    <TableCell className={cn(SOFT_CELL, "font-normal", rowBg, round)}>{MOVEMENT_LABELS[row.kind]}</TableCell>
                    <TableCell className={cn(SOFT_CELL, "num text-right font-normal", rowBg, round)}>{row.quantity ?? ""}</TableCell>
                    <TableCell className={cn(SOFT_CELL, "whitespace-normal font-normal", rowBg, round)}>
                      {describe(row, pathOf, unitLabel)}
                      {row.notes && <span className="block text-muted-foreground">{row.notes}</span>}
                    </TableCell>
                    <TableCell className={cn(SOFT_CELL, rowBg, round)}>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", REVIEW_FILL[row.review_status])}>
                        {REVIEW_LABELS[row.review_status]}
                      </span>
                      {row.created_by === user.id && <span className="ml-1 text-[11px] text-muted-foreground">por você</span>}
                    </TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table></div>
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1">
    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="m-0 text-sm">{children}</dd>
  </div>;
}

function OwnerCell({ owner }: { owner: MaterialOwner }) {
  return <span className="inline-flex items-center gap-2 font-normal">
    <span className={cn("size-2.5 shrink-0 rounded-full", MATERIAL_OWNER_DOT[owner])} aria-hidden />
    {MATERIAL_OWNER_LABELS[owner]}
  </span>;
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
    case "ajuste": return `Contagem ${row.details.from ?? "?"} → ${row.details.to ?? "?"}`;
    case "baixa": return `${prefix}${row.write_off_reason ? WRITE_OFF_LABELS[row.write_off_reason] : "Baixa"}${row.from_location_id ? ` em ${where(row.from_location_id)}` : ""}`;
    case "edicao": return `${prefix}${EDIT_ACTIONS[String(row.details.action)] ?? "Edição"}`;
  }
}
