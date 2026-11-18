import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp, IconSelector } from "@tabler/icons-react";
import { PageBody } from "@geas/ui";
import { SectionCount } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/inventory/app-header";
import { MaterialsSection } from "@/components/inventory/materials/new-material-button";
import { SoftSectionCard } from "@/components/inventory/soft-section-card";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { locationOptions } from "@/lib/inventory/locations";
import type { MaterialRow, StockRow } from "@/lib/inventory/model";
import {
  MATERIAL_OWNER_DOT,
  MATERIAL_OWNER_LABELS,
  MATERIAL_STATUS_LABELS,
  dateBR,
  daysUntil,
  materialStatus,
  ownerFromLocationPath,
  type MaterialOwner,
  type MaterialStatus,
} from "@/lib/inventory/vocabulary";
import { formatInventoryCents } from "@/lib/format";
import * as families from "@/lib/server/inventory/families";
import * as locations from "@/lib/server/inventory/locations";
import * as materialsData from "@/lib/server/inventory/materials";
import { pageSession } from "@/lib/server/session";

type HomeRow = MaterialRow & {
  status: MaterialStatus;
  location: string;
  owner: MaterialOwner | null;
};

type SortKey = "estado" | "dono" | "material" | "quantidade" | "validade" | "valor";
type SortDir = "asc" | "desc";

/** Cores sólidas no estilo monday.com (célula inteira + texto branco). */
const STATUS_FILL: Record<MaterialStatus, string> = {
  bom: "bg-[#00c875] text-white",
  medio: "bg-[#fdab3d] text-white",
  ruim: "bg-[#e2445c] text-white",
};

const BAR_TONE: Record<MaterialStatus, string> = {
  bom: "bg-[#00c875]",
  medio: "bg-[#fdab3d]",
  ruim: "bg-[#e2445c]",
};

const OWNER_FILL: Record<MaterialOwner, string> = {
  diretoria: "bg-[#2563eb] text-white",
  escoteiro: "bg-[#14532d] text-white",
  senior: "bg-[#7a1f3d] text-white",
  pioneiro: "bg-[#dc2626] text-white",
  lobinho: "bg-[#eab308] text-[#1a1a1a]",
};

const STATUS_ORDER: MaterialStatus[] = ["bom", "medio", "ruim"];
const OWNER_ORDER: MaterialOwner[] = ["diretoria", "escoteiro", "senior", "pioneiro", "lobinho"];
const OWNER_SORT: MaterialOwner[] = ["lobinho", "escoteiro", "senior", "pioneiro", "diretoria"];
const STATUS_SORT: Record<MaterialStatus, number> = { ruim: 0, medio: 1, bom: 2 };

const SORT_KEYS: SortKey[] = ["estado", "dono", "material", "quantidade", "validade", "valor"];
const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  estado: "asc",
  dono: "asc",
  material: "asc",
  quantidade: "asc",
  validade: "asc",
  valor: "desc",
};

const STATUS_COL = "w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem]";
const DONO_COL = "w-32 min-w-[7.5rem]";
const MATERIAL_COL = "w-[14rem] min-w-[12rem]";
const MINIMO_COL = "w-[4.75rem] min-w-[4.75rem] max-w-[4.75rem]";
const QTD_COL = "w-[6.5rem] min-w-[6.5rem]";
const VALIDADE_COL = "w-28 min-w-[7rem]";
const VALOR_COL = "w-28 min-w-[6.5rem]";
const HEAD_BAR = "h-9 px-3 py-0 text-xs font-semibold tracking-wide whitespace-nowrap text-foreground";
const CELL_SOFT = "px-3 py-1.5 whitespace-nowrap";
const ROW_LIGHT = "bg-card";
const ROW_DARK = "bg-muted";
const PAGE_SIZE = 15;

export default async function Materials({ searchParams }: {
  searchParams: Promise<{ status?: string; dono?: string; ord?: string; dir?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const filter = STATUS_ORDER.includes(params.status as MaterialStatus) ? (params.status as MaterialStatus) : null;
  const ownerFilter = OWNER_ORDER.includes(params.dono as MaterialOwner) ? (params.dono as MaterialOwner) : null;
  const sortKey: SortKey = SORT_KEYS.includes(params.ord as SortKey) ? (params.ord as SortKey) : "material";
  const sortDir: SortDir = params.dir === "asc" || params.dir === "desc"
    ? params.dir
    : SORT_DEFAULT_DIR[sortKey];
  const pageRequested = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;

  const [materialData, stock, paths, familyOptions] = await Promise.all([
    materialsData.list(db, groupId, { includeInactive: false }),
    materialsData.stockByLocation(db, groupId),
    locations.listPaths(db, groupId),
    member.inventory.canEdit ? families.listOptions(db, groupId) : Promise.resolve([]),
  ]);

  const pathOf = new Map(paths.map((row) => [row.id, row.path]));
  const bestByMaterial = new Map<string, StockRow>();
  for (const row of stock) {
    const best = bestByMaterial.get(row.material_id);
    if (!best || row.quantity > best.quantity) bestByMaterial.set(row.material_id, row);
  }
  const primaryLocation = new Map<string, string>();
  for (const [materialId, best] of bestByMaterial) {
    primaryLocation.set(materialId, pathOf.get(best.location_id) ?? "");
  }

  const rows: HomeRow[] = materialData.map((row) => {
    const location = primaryLocation.get(row.id) ?? "";
    return {
      ...row,
      status: materialStatus(row),
      location,
      owner: ownerFromLocationPath(location),
    };
  });
  const counts = { bom: 0, medio: 0, ruim: 0 } satisfies Record<MaterialStatus, number>;
  const ownerCounts = { diretoria: 0, escoteiro: 0, senior: 0, pioneiro: 0, lobinho: 0 } satisfies Record<MaterialOwner, number>;
  for (const row of rows) {
    counts[row.status] += 1;
    if (row.owner) ownerCounts[row.owner] += 1;
  }
  const total = rows.length;
  const filtered = rows
    .filter((row) => (!filter || row.status === filter) && (!ownerFilter || row.owner === ownerFilter))
    .sort((a, b) => compareRows(a, b, sortKey, sortDir));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pageRequested, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const locationOpts = member.inventory.canEdit ? locationOptions(paths) : [];

  const query = (next: {
    status?: MaterialStatus | null; dono?: MaterialOwner | null;
    ord?: SortKey | null; dir?: SortDir | null; pagina?: number | null;
  }) => {
    const q = new URLSearchParams();
    const status = next.status === undefined ? filter : next.status;
    const dono = next.dono === undefined ? ownerFilter : next.dono;
    const ord = next.ord === undefined ? sortKey : next.ord;
    const dir = next.dir === undefined ? sortDir : next.dir;
    const pagina = next.pagina === undefined ? null : next.pagina;
    if (status) q.set("status", status);
    if (dono) q.set("dono", dono);
    if (ord && !(ord === "material" && (dir ?? "asc") === "asc")) {
      q.set("ord", ord);
      q.set("dir", dir ?? SORT_DEFAULT_DIR[ord]);
    }
    if (pagina != null && pagina > 1) q.set("pagina", String(pagina));
    const s = q.toString();
    return s ? `/inventario?${s}` : "/inventario";
  };

  const hrefFor = (status: MaterialStatus | null, owner: MaterialOwner | null) =>
    query({ status, dono: owner, pagina: null });

  const sortHref = (key: SortKey) => {
    if (sortKey === key) {
      return query({ ord: key, dir: sortDir === "asc" ? "desc" : "asc", pagina: null });
    }
    return query({ ord: key, dir: SORT_DEFAULT_DIR[key], pagina: null });
  };

  return <div className="shell">
    <AppHeader current="/inventario" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <h1 className="geas-sr-only">Materiais</h1>

      <section className="grid gap-2">
        <BlockIntro
          title="Estado dos Materiais"
          description={total === 0 ? "Nenhum material ativo cadastrado." : "Resumo dos materiais por Estado."}
          actions={<SectionCount>
            {STATUS_ORDER.map((status, index) => <span key={status}>
              {index > 0 && " · "}
              <span className="font-semibold text-foreground">{counts[status]}</span> {MATERIAL_STATUS_LABELS[status].toLowerCase()}
            </span>)}
          </SectionCount>}
        />
        <SoftSectionCard>
          <div className="grid gap-4 p-4">
            {total > 0 && <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Bom ${counts.bom}, Médio ${counts.medio}, Ruim ${counts.ruim}`}>
              {STATUS_ORDER.map((status) => counts[status] > 0 && (
                <span key={status} className={cn("h-full", BAR_TONE[status])} style={{ width: `${(counts[status] / total) * 100}%` }} title={`${MATERIAL_STATUS_LABELS[status]}: ${counts[status]}`} />
              ))}
            </div>}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por status e dono">
              {STATUS_ORDER.map((status) => (
                <StatusChip key={status}
                  href={hrefFor(filter === status ? null : status, ownerFilter)}
                  active={filter === status}
                  label={MATERIAL_STATUS_LABELS[status]} count={counts[status]} status={status} />
              ))}
              <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
              {OWNER_ORDER.map((owner) => (
                <OwnerChip key={owner}
                  href={hrefFor(filter, ownerFilter === owner ? null : owner)}
                  active={ownerFilter === owner}
                  label={MATERIAL_OWNER_LABELS[owner]} count={ownerCounts[owner]} owner={owner} />
              ))}
            </div>
          </div>
        </SoftSectionCard>
      </section>

      {member.inventory.canEdit
        ? <MaterialsSection
            title={filter ? MATERIAL_STATUS_LABELS[filter] : "Materiais"}
            description="Clique no Nome do material para ler os detalhes."
            countLabel={<>{filtered.length} {filtered.length === 1 ? "material" : "materiais"}</>}
            families={familyOptions}
            locations={locationOpts}
            showReviewNotice={!member.inventory.canManage}>
            <MaterialsCard
              filtered={filtered}
              visible={visible}
              sortKey={sortKey}
              sortDir={sortDir}
              sortHref={sortHref}
              page={page}
              pageCount={pageCount}
              pageStart={pageStart}
              query={query}
            />
          </MaterialsSection>
        : <section className="grid gap-2">
          <BlockIntro
            title={filter ? MATERIAL_STATUS_LABELS[filter] : "Materiais"}
            description="Clique no Nome do material para ler os detalhes."
            actions={<SectionCount>{filtered.length} {filtered.length === 1 ? "material" : "materiais"}</SectionCount>}
          />
          <MaterialsCard
            filtered={filtered}
            visible={visible}
            sortKey={sortKey}
            sortDir={sortDir}
            sortHref={sortHref}
            page={page}
            pageCount={pageCount}
            pageStart={pageStart}
            query={query}
          />
        </section>}
    </PageBody>
  </div>;
}

function MaterialsCard({ filtered, visible, sortKey, sortDir, sortHref, page, pageCount, pageStart, query }: {
  filtered: HomeRow[];
  visible: HomeRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  sortHref: (key: SortKey) => string;
  page: number;
  pageCount: number;
  pageStart: number;
  query: (next: { pagina?: number | null }) => string;
}) {
  const slots = Array.from({ length: PAGE_SIZE }, (_, index) => visible[index] ?? null);
  return <SoftSectionCard>
    <div className="grid gap-2 p-3">
      <Table
        className={cn(
          "min-w-[52rem] table-fixed border-separate border-spacing-y-1",
          "[&_td]:!border-0 [&_th]:!border-0",
        )}
        containerClassName="overflow-x-auto">
        <TableCaption className="sr-only">Materiais do inventário com status Bom, Médio ou Ruim</TableCaption>
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="border-0 hover:bg-transparent">
            <SortHead className={cn(STATUS_COL, "rounded-l-2xl bg-muted")} label="Estado" column="estado" active={sortKey} dir={sortDir} href={sortHref("estado")} />
            <SortHead className={cn(DONO_COL, "bg-muted")} label="Dono" column="dono" active={sortKey} dir={sortDir} href={sortHref("dono")} />
            <SortHead className={cn(MATERIAL_COL, "bg-muted")} label="Material" column="material" active={sortKey} dir={sortDir} href={sortHref("material")} />
            <TableHead className={cn(HEAD_BAR, MINIMO_COL, "bg-muted")}>Mínimo</TableHead>
            <SortHead className={cn(QTD_COL, "bg-muted")} label="Quantidade" column="quantidade" active={sortKey} dir={sortDir} href={sortHref("quantidade")} />
            <SortHead className={cn(VALIDADE_COL, "bg-muted")} label="Validade" column="validade" active={sortKey} dir={sortDir} href={sortHref("validade")} />
            <SortHead className={cn(VALOR_COL, "bg-muted", "rounded-r-2xl")} label="Valor" column="valor" active={sortKey} dir={sortDir} href={sortHref("valor")} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {slots.map((row, index) => {
            const dark = index % 2 === 1;
            const rowBg = dark ? ROW_DARK : ROW_LIGHT;
            const round = dark ? "first:rounded-l-2xl last:rounded-r-2xl" : "";
            if (!row) {
              return <TableRow key={`empty-${index}`} className="border-0 hover:bg-transparent" aria-hidden>
                <TableCell className={cn(CELL_SOFT, STATUS_COL, ROW_LIGHT)}>
                  {/* Mesma altura do pill de Estado, sem aparecer. */}
                  <span className="invisible inline-flex min-w-[4.25rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold">Bom</span>
                </TableCell>
                <TableCell className={cn(CELL_SOFT, DONO_COL, ROW_LIGHT)} />
                <TableCell className={cn(CELL_SOFT, MATERIAL_COL, ROW_LIGHT)}>
                  {filtered.length === 0 && index === 0
                    ? <span className="text-xs text-muted-foreground">Nenhum material neste filtro.</span>
                    : null}
                </TableCell>
                <TableCell className={cn(CELL_SOFT, MINIMO_COL, ROW_LIGHT)} />
                <TableCell className={cn(CELL_SOFT, QTD_COL, ROW_LIGHT)} />
                <TableCell className={cn(CELL_SOFT, VALIDADE_COL, ROW_LIGHT)} />
                <TableCell className={cn(CELL_SOFT, VALOR_COL, ROW_LIGHT)} />
              </TableRow>;
            }
            return (
              <TableRow key={row.id} className="border-0 hover:bg-transparent">
                <TableCell className={cn(CELL_SOFT, STATUS_COL, rowBg, round)}>
                  <span className={cn(
                    "inline-flex min-w-[4.25rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
                    STATUS_FILL[row.status],
                  )}>
                    {MATERIAL_STATUS_LABELS[row.status]}
                  </span>
                </TableCell>
                <TableCell className={cn(CELL_SOFT, DONO_COL, "font-normal", rowBg, round)}><OwnerCell owner={row.owner} /></TableCell>
                <TableCell className={cn(CELL_SOFT, MATERIAL_COL, rowBg, round)}>
                  <Link href={`/inventario/materiais/${row.id}`}
                    className="block truncate font-normal text-foreground underline-offset-2 hover:underline"
                    title={row.name}>{row.name}</Link>
                </TableCell>
                <TableCell className={cn(CELL_SOFT, MINIMO_COL, "num text-left font-normal", rowBg, round)}>{row.minimum_quantity ?? ""}</TableCell>
                <TableCell className={cn(CELL_SOFT, QTD_COL, "num text-left font-normal", rowBg, round, row.below_minimum && "text-[#e2445c]")}>{row.quantity}</TableCell>
                <TableCell className={cn(CELL_SOFT, VALIDADE_COL, "font-normal", rowBg, round)}><Validity date={row.next_expiry} /></TableCell>
                <TableCell className={cn(CELL_SOFT, VALOR_COL, "num text-left font-normal", rowBg, round)}>
                  {Number(row.estimated_value_cents) > 0 ? formatInventoryCents(Number(row.estimated_value_cents)) : ""}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {pageCount > 1 && <Pagination
        page={page}
        pageCount={pageCount}
        from={pageStart + 1}
        to={pageStart + visible.length}
        total={filtered.length}
        prevHref={page > 1 ? query({ pagina: page - 1 }) : null}
        nextHref={page < pageCount ? query({ pagina: page + 1 }) : null}
      />}
    </div>
  </SoftSectionCard>;
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
  return <nav className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1" aria-label="Paginação dos materiais">
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

function quantityDelta(row: HomeRow) {
  if (row.minimum_quantity == null) return 0;
  return row.quantity - row.minimum_quantity;
}

function compareRows(a: HomeRow, b: HomeRow, key: SortKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case "estado":
      cmp = STATUS_SORT[a.status] - STATUS_SORT[b.status];
      break;
    case "dono": {
      const ai = a.owner ? OWNER_SORT.indexOf(a.owner) : OWNER_SORT.length;
      const bi = b.owner ? OWNER_SORT.indexOf(b.owner) : OWNER_SORT.length;
      cmp = ai - bi;
      break;
    }
    case "material":
      cmp = a.name.localeCompare(b.name, "pt-BR");
      break;
    case "quantidade":
      cmp = quantityDelta(a) - quantityDelta(b);
      break;
    case "validade": {
      const ad = a.next_expiry ? daysUntil(a.next_expiry) : Number.POSITIVE_INFINITY;
      const bd = b.next_expiry ? daysUntil(b.next_expiry) : Number.POSITIVE_INFINITY;
      cmp = ad - bd;
      break;
    }
    case "valor":
      cmp = Number(a.estimated_value_cents) - Number(b.estimated_value_cents);
      break;
  }
  if (cmp !== 0) return cmp * sign;
  return a.name.localeCompare(b.name, "pt-BR");
}

function SortHead({ label, column, active, dir, href, className }: {
  label: string; column: SortKey; active: SortKey; dir: SortDir; href: string; className?: string;
}) {
  const isActive = active === column;
  const Icon = !isActive ? IconSelector : dir === "asc" ? IconChevronUp : IconChevronDown;
  return <TableHead className={cn(HEAD_BAR, className)} aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}>
    <Link href={href} className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap text-foreground/80 transition-colors hover:text-foreground",
      isActive && "text-foreground",
    )}>
      {label}
      <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
    </Link>
  </TableHead>;
}

function Validity({ date }: { date: string | null }) {
  if (!date) return null;
  const days = daysUntil(date);
  return <span className={cn("num font-normal", days < 0 && "text-[#e2445c]")} title={days < 0 ? "Vencido" : undefined}>{dateBR(date)}</span>;
}

function OwnerCell({ owner }: { owner: MaterialOwner | null }) {
  if (!owner) return null;
  return <span className="inline-flex items-center gap-2 font-normal">
    <span className={cn("size-2.5 shrink-0 rounded-full", MATERIAL_OWNER_DOT[owner])} aria-hidden />
    {MATERIAL_OWNER_LABELS[owner]}
  </span>;
}

const CHIP_CLASS = "inline-flex h-8 min-w-[5.75rem] items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors";

function StatusChip({ href, active, label, count, status }: {
  href: string; active: boolean; label: string; count: number; status: MaterialStatus;
}) {
  return <Link href={href} aria-current={active ? "true" : undefined}
    className={cn(
      CHIP_CLASS,
      active && cn("border-transparent", STATUS_FILL[status]),
      !active && "border-border bg-card text-foreground hover:bg-muted",
    )}>
    <span className={cn("size-2.5 shrink-0 rounded-sm", active ? "bg-white/85" : BAR_TONE[status])} aria-hidden />
    <span className="tabular-nums">{label}{" "}
      <span className={cn("num", active ? "opacity-90" : "text-muted-foreground")}>{count}</span>
    </span>
  </Link>;
}

function OwnerChip({ href, active, label, count, owner }: {
  href: string; active: boolean; label: string; count: number; owner: MaterialOwner;
}) {
  return <Link href={href} aria-current={active ? "true" : undefined}
    className={cn(
      CHIP_CLASS,
      "min-w-[6.5rem]",
      active && cn("border-transparent", OWNER_FILL[owner]),
      !active && "border-border bg-card text-foreground hover:bg-muted",
    )}>
    <span className={cn(
      "size-2.5 shrink-0 rounded-full",
      active ? (owner === "lobinho" ? "bg-[#1a1a1a]/50" : "bg-white/85") : MATERIAL_OWNER_DOT[owner],
    )} aria-hidden />
    <span className="tabular-nums">{label}{" "}
      <span className={cn("num", active ? "opacity-90" : "text-muted-foreground")}>{count}</span>
    </span>
  </Link>;
}
