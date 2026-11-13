import Link from "next/link";
import { Fragment } from "react";
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/app-header";
import { fetchFamilyOptions } from "@/components/materials/data";
import { fetchLocationPaths, rootOf, subtree, type LocationPath } from "@/lib/locations";
import { Expiry } from "@/components/materials/lots-table";
import { MaterialFilters } from "@/components/materials/material-filters";
import { SetupNeeded } from "@/components/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";
import { EXPIRY_WARNING_DAYS, daysUntil } from "@/lib/inventory";
import { money } from "@/lib/money";
import { pageSession } from "@/lib/session";

type MaterialRow = {
  id: string; name: string; consumable: boolean; minimum_quantity: number | null; active: boolean;
  quantity: number; next_expiry: string | null; below_minimum: boolean;
};
type StockRow = { material_id: string; location_id: string; quantity: number; value_cents: number; next_expiry: string | null };
type Line = StockRow & { material: MaterialRow };

type Search = { q?: string; familia?: string; divisao?: string; todos?: string; alerta?: string; inativos?: string };

const byName = (a: Line, b: Line) => a.material.name.localeCompare(b.material.name, "pt-BR");

export default async function Materials({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;

  let materialsQuery = supabase.from("inventory_material_rows")
    .select("id, name, consumable, minimum_quantity, active, quantity, next_expiry, below_minimum")
    .eq("group_id", member.groupId);
  if (params.inativos !== "1") materialsQuery = materialsQuery.eq("active", true);
  if (params.familia) materialsQuery = materialsQuery.eq("family_id", params.familia);
  if (params.q?.trim()) materialsQuery = materialsQuery.ilike("name", `%${params.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const [{ data: materialData }, { data: stockData }, paths, families] = await Promise.all([
    materialsQuery,
    supabase.from("inventory_stock_by_location").select("material_id, location_id, quantity, value_cents, next_expiry").eq("group_id", member.groupId),
    fetchLocationPaths(supabase, member.groupId),
    fetchFamilyOptions(supabase, member.groupId),
  ]);

  // Local macro (aba): a raiz da divisão pedida; sem divisão, a primeira raiz, ou "Todos" na busca.
  const roots = paths.filter((row) => row.depth === 0 && row.active);
  const selected = params.divisao ? paths.find((row) => row.id === params.divisao) : undefined;
  const showAll = !selected && (params.todos === "1" || Boolean(params.q?.trim()) || roots.length === 0);
  const root = selected ? rootOf(paths, selected.id) : showAll ? undefined : roots[0];
  const scope: LocationPath[] = selected ? subtree(paths, selected.id) : root ? subtree(paths, root.id) : paths;

  // Material conta pelo total (mínimo e validade de todas as divisões), como no alerta do Início.
  const alerting = (m: MaterialRow) => m.below_minimum || (m.next_expiry !== null && daysUntil(m.next_expiry) <= EXPIRY_WARNING_DAYS);
  const materials = new Map(((materialData ?? []) as MaterialRow[]).filter((m) => params.alerta !== "1" || alerting(m)).map((m) => [m.id, m]));
  const stock = (stockData ?? []) as StockRow[];
  const byLocation = new Map<string, Line[]>();
  for (const row of stock) {
    const material = materials.get(row.material_id);
    if (!material) continue;
    byLocation.set(row.location_id, [...(byLocation.get(row.location_id) ?? []), { ...row, material }]);
  }
  // Divisões com material, mais as superiores delas (subtítulo de cada nível, mesmo sem material próprio).
  const filled = scope.filter((location) => byLocation.has(location.id));
  const visible = new Set(filled.flatMap((location) => location.ancestors));
  const groups = scope.filter((location) => visible.has(location.id)).map((location) => ({ location, lines: (byLocation.get(location.id) ?? []).sort(byName) }));
  const withStock = new Set(stock.map((row) => row.material_id));
  const noStock = showAll ? [...materials.values()].filter((m) => !withStock.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : [];

  const lines = groups.flatMap((group) => group.lines);
  const distinct = new Set([...lines.map((line) => line.material_id), ...noStock.map((m) => m.id)]).size;
  const total = lines.reduce((sum, line) => sum + Number(line.value_cents), 0);

  // Contagem do ano anterior (conferência / planilha), por material e divisão; a coluna só aparece se houver.
  const previousYear = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4)) - 1;
  const { data: countData } = await supabase.from("inventory_counts").select("material_id, location_id, quantity")
    .eq("group_id", member.groupId).eq("year", previousYear);
  const previous = new Map((countData ?? []).map((row) => [`${row.material_id}|${row.location_id}`, row.quantity as number]));
  const showPrevious = previous.size > 0;
  const columns = showPrevious ? 5 : 4;

  // Abas mantêm busca e filtros; trocam só o local.
  const hrefFor = (change: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const key of ["q", "familia", "alerta", "inativos"] as const) if (params[key]) next.set(key, params[key]!);
    for (const [key, value] of Object.entries(change)) next.set(key, value);
    return `/materiais?${next}`;
  };
  const tabs = [
    ...roots.map((row) => ({ href: hrefFor({ divisao: row.id }), label: row.name, active: root?.id === row.id })),
    { href: hrefFor({ todos: "1" }), label: "Todos", active: showAll },
  ];
  const heading = showAll ? "Todos os locais" : selected && selected.depth > 0 ? selected.path : root?.name ?? "Materiais";

  return <div className="shell">
    <AppHeader current="/materiais" email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Materiais" crumbs={[{ label: "Materiais" }]}
        description="Tudo o que o grupo tem, por local: um material em várias divisões aparece em cada uma, com a quantidade de lá."
        actions={member.canEdit && <Link href="/materiais/novo" className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Novo material</Link>}>
        <SectionTabs label="Locais" tabs={tabs} />
        <MaterialFilters families={families} />
      </PageHeader>
      <SectionCard>
        <SectionHeader title={heading}
          description={selected && selected.depth > 0 && root ? <>Só esta divisão e o que está dentro dela. <Link href={hrefFor({ divisao: root.id })} className="font-semibold text-primary hover:underline">Ver {root.name} inteiro</Link></> : undefined}>
          <SectionCount>{distinct} {distinct === 1 ? "material" : "materiais"} · valor estimado <span className="num">{money(total)}</span></SectionCount>
        </SectionHeader>
        {groups.length === 0 && noStock.length === 0
          ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum material encontrado.</p>
          : <div className="overflow-x-auto"><Table className="min-w-[640px]">
            <TableCaption className="sr-only">Materiais por divisão</TableCaption>
            <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
              <TableHead className={HEAD_CLASS}>Material</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-28 text-center")}>Quantidade</TableHead>
              {showPrevious && <TableHead className={cn(HEAD_CLASS, "w-20 text-center")} title={`Contagem de ${previousYear}`}>{previousYear}</TableHead>}
              <TableHead className={cn(HEAD_CLASS, "w-36")}>Validade</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-32 text-right")}>Valor estimado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {groups.map(({ location, lines: groupLines }) => <Fragment key={location.id}>
                {location.depth === 0
                  ? showAll && <GroupRow level="root" columns={columns}>{location.name}</GroupRow>
                  : <GroupRow level="sub" depth={location.depth} columns={columns} href={hrefFor({ divisao: location.id })}>{location.name}</GroupRow>}
                {groupLines.map((line) => <MaterialLine key={`${line.location_id}-${line.material_id}`} line={line} depth={location.depth}
                  previous={showPrevious ? previous.get(`${line.material_id}|${line.location_id}`) ?? null : undefined} />)}
              </Fragment>)}
              {noStock.length > 0 && <>
                <GroupRow level="root" columns={columns}>Sem estoque</GroupRow>
                {noStock.map((material) => <MaterialLine key={material.id} depth={0} previous={showPrevious ? null : undefined}
                  line={{ material_id: material.id, location_id: "", quantity: 0, value_cents: 0, next_expiry: null, material }} />)}
              </>}
            </TableBody>
          </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}

/** Recuo por nível da divisão (o local macro não recua). */
const indent = (level: number) => ({ paddingLeft: `${0.75 + Math.max(level, 0) * 1.25}rem` });

/** Linha de subtítulo: local macro (na aba Todos) ou subdivisão, recuada pelo nível. */
function GroupRow({ level, depth = 0, columns, href, children }: { level: "root" | "sub"; depth?: number; columns: number; href?: string; children: React.ReactNode }) {
  return <TableRow className="hover:bg-transparent">
    <TableCell colSpan={columns} style={level === "sub" ? indent(depth - 1) : undefined}
      className={cn(CELL_CLASS, level === "root" ? "bg-secondary pt-3 text-sm font-bold" : "bg-muted/60 text-xs font-semibold text-muted-foreground")}>
      {href ? <Link href={href} className="hover:text-foreground hover:underline">{children}</Link> : children}
    </TableCell>
  </TableRow>;
}

/** Material numa divisão: quantidade, contagem do ano anterior (se a coluna existir), validade e valor daquela divisão. */
function MaterialLine({ line, depth, previous }: { line: Line; depth: number; previous?: number | null }) {
  const { material } = line;
  return <TableRow className={cn(!material.active && "opacity-60")}>
    <TableCell className={cn(CELL_CLASS, "whitespace-normal")} style={indent(depth)}>
      <Link href={`/materiais/${material.id}`} className="hover:underline">{material.name}</Link>
      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
        {material.consumable && <Badge variant="outline">Consumível</Badge>}
        {!material.active && <Badge variant="outline">Inativo</Badge>}
      </span>
    </TableCell>
    <TableCell className={cn(CELL_CLASS, "num text-center font-semibold")}>
      <span className={cn("inline-flex items-center gap-1", material.below_minimum && "text-destructive")}
        title={material.below_minimum ? `Abaixo do mínimo: ${material.quantity} de ${material.minimum_quantity} no total` : undefined}>
        {material.below_minimum && <IconAlertTriangle className="size-3.5" aria-label="Abaixo do mínimo" />}{line.quantity}
      </span>
      {material.minimum_quantity != null && <span className="block text-[11px] font-normal text-muted-foreground">total {material.quantity} · mín. {material.minimum_quantity}</span>}
    </TableCell>
    {previous !== undefined && <TableCell className={cn(CELL_CLASS, "num text-center text-muted-foreground")}>{previous ?? "—"}</TableCell>}
    <TableCell className={CELL_CLASS}>{line.next_expiry ? <Expiry date={line.next_expiry} /> : <span className="text-muted-foreground">—</span>}</TableCell>
    <TableCell className={cn(CELL_CLASS, "num text-right")}>{Number(line.value_cents) > 0 ? money(Number(line.value_cents)) : <span className="text-muted-foreground">—</span>}</TableCell>
  </TableRow>;
}
