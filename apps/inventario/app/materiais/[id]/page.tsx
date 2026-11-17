import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconPencil } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCard, SectionCount } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/app-header";
import { fetchLocationPaths, locationOptions } from "@/lib/locations";
import { AddLotButton, Expiry, LotsTable, type LotRow } from "@/components/materials/lots-table";
import { ReviewNotice } from "@/components/materials/review-notice";
import { AddUnitButton, UnitsTable, type UnitRow } from "@/components/materials/units-table";
import { SetupNeeded } from "@/components/setup-needed";
import { SOFT_CELL, SOFT_HEAD, SOFT_ROW_DARK, SOFT_ROW_LIGHT, SOFT_TABLE, softRowRound } from "@/components/table-head";
import {
  MATERIAL_OWNER_DOT,
  MATERIAL_OWNER_LABELS,
  MATERIAL_STATUS_LABELS,
  MOVEMENT_LABELS,
  REVIEW_LABELS,
  TRACKING_LABELS,
  WRITE_OFF_LABELS,
  CONDITION_LABELS,
  materialStatus,
  ownerFromLocationPath,
  timestampBR,
  type Condition,
  type MaterialOwner,
  type MaterialStatus,
  type MovementKind,
  type ReviewStatus,
  type Tracking,
  type WriteOffReason,
} from "@/lib/inventory";
import { money } from "@/lib/money";
import { pageSession } from "@/lib/session";

type Material = {
  id: string; name: string; tracking: Tracking; consumable: boolean; minimum_quantity: number | null; description: string | null; active: boolean;
  family_id: string | null; family_name: string | null; family_code: string | null;
  quantity: number; estimated_value_cents: number; next_expiry: string | null; below_minimum: boolean;
};

type Movement = {
  id: number; kind: MovementKind; quantity: number | null; from_location_id: string | null; to_location_id: string | null;
  from_condition: Condition | null; to_condition: Condition | null; write_off_reason: WriteOffReason | null;
  notes: string | null; details: Record<string, unknown>; review_status: ReviewStatus; created_by: string | null; created_at: string;
  lot_id: string | null; unit_id: string | null;
};

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

const CARD = "rounded-2xl shadow-[0_8px_24px_rgba(37,35,40,0.10)]";

export default async function MaterialDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await supabase.from("inventory_material_rows")
    .select("id, name, tracking, consumable, minimum_quantity, description, active, family_id, family_name, family_code, quantity, estimated_value_cents, next_expiry, below_minimum")
    .eq("id", id).eq("group_id", member.groupId).maybeSingle();
  if (!data) notFound();
  const material = data as Material;
  const isLot = material.tracking === "lot";
  const status = materialStatus(material);

  const [paths, { data: lotData }, { data: unitData }, { data: movementData }, nextTag] = await Promise.all([
    fetchLocationPaths(supabase, member.groupId),
    isLot
      ? supabase.from("inventory_lots").select("id, location_id, quantity, condition, unit_value_cents, expires_on, acquired_on, origin, supplier, invoice, notes").eq("material_id", id).gt("quantity", 0).order("created_at")
      : Promise.resolve({ data: [] }),
    isLot
      ? Promise.resolve({ data: [] })
      : supabase.from("inventory_units").select("id, location_id, tag, legacy_code, description, condition, unit_value_cents, acquired_on, origin, supplier, invoice, notes, written_off_at, write_off_reason").eq("material_id", id).order("tag", { nullsFirst: false }).order("created_at"),
    supabase.from("inventory_movements")
      .select("id, kind, quantity, from_location_id, to_location_id, from_condition, to_condition, write_off_reason, notes, details, review_status, created_by, created_at, lot_id, unit_id")
      .eq("material_id", id).order("created_at", { ascending: false }).limit(100),
    !isLot && material.family_id && member.canEdit
      ? supabase.rpc("inventory_next_tag", { p_family_id: material.family_id }).then(({ data: tag }) => (tag as string | null) ?? null)
      : Promise.resolve(null),
  ]);
  const pathOf = new Map(paths.map((row) => [row.id, row.path]));
  const withPath = <T extends { location_id: string }>(rows: T[]) => rows
    .map((row) => ({ ...row, path: pathOf.get(row.location_id) ?? "—" }))
    .sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  const lots = withPath((lotData ?? []) as Omit<LotRow, "path">[]);
  const units = withPath((unitData ?? []) as Omit<UnitRow, "path">[]);
  const movements = (movementData ?? []) as Movement[];
  const unitLabel = new Map(units.map((row) => [row.id, row.tag ?? row.legacy_code ?? "peça"]));
  const locations = locationOptions(paths);
  const pending = movements.filter((row) => row.review_status !== "revisado").length;
  const stockCount = isLot ? lots.length : units.filter((row) => !row.written_off_at).length;
  const primaryPath = (isLot ? lots[0]?.path : units.find((row) => !row.written_off_at)?.path) ?? "";
  const owner = ownerFromLocationPath(primaryPath);

  return <div className="shell">
    <AppHeader current={`/materiais/${id}`} email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow" className="!gap-7 !pt-7">
      <PageHeader title={material.name} crumbs={[{ label: "Materiais", href: "/" }, { label: material.name }]}
        description={material.description ?? undefined}
        actions={member.canEdit && <Link href={`/materiais/${id}/editar`} className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "rounded-md border-transparent bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}><IconPencil data-icon="inline-start" /> Editar material</Link>} />
      {member.canEdit && !member.canManage && <ReviewNotice />}

      <section className="grid gap-2">
        <BlockIntro
          title="Resumo"
          description={`${TRACKING_LABELS[material.tracking]}${material.consumable ? " · consumível" : ""}${!material.active ? " · inativo" : ""}`}
        />
        <SectionCard className={CARD}>
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
            <Fact label="Valor estimado"><span className="num">{money(Number(material.estimated_value_cents))}</span></Fact>
            {material.next_expiry && <Fact label="Próxima validade"><Expiry date={material.next_expiry} /></Fact>}
          </dl>
        </SectionCard>
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
            {member.canEdit && material.active && (isLot
              ? <AddLotButton materialId={id} locations={locations} />
              : <AddUnitButton materialId={id} locations={locations} nextTag={nextTag} familyCode={material.family_code} />)}
          </>}
        />
        <SectionCard className={CARD}>
          {isLot
            ? <LotsTable materialId={id} lots={lots} locations={locations} canEdit={member.canEdit} />
            : <UnitsTable materialId={id} units={units} locations={locations} canEdit={member.canEdit} nextTag={nextTag} familyCode={material.family_code} />}
        </SectionCard>
      </section>

      <section className="grid gap-2">
        <BlockIntro
          title="Histórico"
          actions={<SectionCount>
            {movements.length === 100 ? "últimos 100" : `${movements.length} ${movements.length === 1 ? "movimento" : "movimentos"}`}
            {pending > 0 && ` · ${pending} a revisar`}
          </SectionCount>}
        />
        <SectionCard className={CARD}>
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
        </SectionCard>
      </section>
    </PageBody>
  </div>;
}

/** Título/descrição no fundo da página (sem card); o modal fica só no conteúdo abaixo. */
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
