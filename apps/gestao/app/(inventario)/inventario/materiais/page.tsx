import Link from "next/link";
import { cookies } from "next/headers";
import { Fragment } from "react";
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/inventory/app-header";
import { ConditionPill } from "@/components/inventory/condition-pill";
import { ColumnMenu, type ColumnFilter } from "@/components/inventory/materials/column-menu";
import { HEAD_TRIGGER, HeadIcons } from "@/components/inventory/materials/head-icons";
import { rootOf, subtree, type LocationPath } from "@/lib/inventory/locations";
import {
  COLUMNS_COOKIE, COLUMN_LABELS, CONDITION_RANK, EXPIRY_LABELS, MINIMUM_LABELS, compareLines, conditionBreakdown, hiddenColumns, matchesFilters, materialsHref, parseListState, withBack,
  type ColumnId, type ListLine, type SortDir, type SortKey,
} from "@/lib/inventory/material-list";
import type { MaterialRow, StockRow } from "@/lib/inventory/model";
import * as families from "@/lib/server/inventory/families";
import * as locations from "@/lib/server/inventory/locations";
import * as materialsData from "@/lib/server/inventory/materials";
import * as movementsData from "@/lib/server/inventory/movements";
import { Expiry } from "@/components/inventory/materials/lots-table";
import { MaterialFilters } from "@/components/inventory/materials/material-filters";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/inventory/table-head";
import { CONDITION_LABELS, EXPIRY_WARNING_DAYS, daysUntil, type Condition } from "@/lib/inventory/vocabulary";
import { formatCents } from "@/lib/format";
import { pageSession } from "@/lib/server/session";

type Line = ListLine & StockRow & { material: MaterialRow };

type Search = Record<string, string | undefined>;

export default async function Materials({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const state = parseListState(params);

  // Contagens dos dois anos anteriores (conferência / planilha); cada coluna só existe se houver contagem.
  const currentYear = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4));
  const years = [currentYear - 1, currentYear - 2] as const;

  const [materialData, stock, paths, familyOptions, counts, cookieStore, toReview, lotData] = await Promise.all([
    materialsData.list(db, groupId, { includeInactive: params.inativos === "1", familyId: params.familia, search: params.q }),
    materialsData.stockByLocation(db, groupId),
    locations.listPaths(db, groupId),
    families.listOptions(db, groupId),
  ]);

  // Colunas: as que existem (anos com contagem) menos as que o usuário ocultou.
  const yearColumns: [ColumnId, number][] = [["anterior1", years[0]], ["anterior2", years[1]]];
  const available: { id: ColumnId; label: string }[] = [
    { id: "estado", label: COLUMN_LABELS.estado },
    { id: "quantidade", label: COLUMN_LABELS.quantidade },
    ...yearColumns.filter(([, year]) => (counts.get(year)?.size ?? 0) > 0).map(([id, year]) => ({ id, label: `Contagem ${year}` })),
    { id: "validade", label: COLUMN_LABELS.validade },
    { id: "unitario", label: COLUMN_LABELS.unitario },
    { id: "total", label: COLUMN_LABELS.total },
  ];
  const hidden = hiddenColumns(cookieStore.get(COLUMNS_COOKIE)?.value);
  const columns = available.filter((column) => !hidden.has(column.id)).map((column) => column.id);
  const yearOf: Partial<Record<ColumnId, number>> = Object.fromEntries(yearColumns);

  // Local macro (aba): a raiz da divisão pedida, ou "Todos".
  const roots = paths.filter((row) => row.depth === 0 && row.active);
  const selected = params.divisao ? paths.find((row) => row.id === params.divisao) : undefined;
  // Sem divisão escolhida, a aba é "Todos" (todos os locais, com os materiais sem estoque no fim).
  const showAll = !selected;
  const root = selected ? rootOf(paths, selected.id) : undefined;
  const scope: LocationPath[] = selected ? subtree(paths, selected.id) : root ? subtree(paths, root.id) : paths;

  // Alerta conta pelo total do material (mínimo e validade de todas as divisões), como no alerta do Início.
  const alerting = (m: MaterialRow) => m.below_minimum || (m.next_expiry !== null && daysUntil(m.next_expiry) <= EXPIRY_WARNING_DAYS);
  const materials = new Map(materialData.filter((m) => params.alerta !== "1" || alerting(m)).map((m) => [m.id, m]));
  const previousOf = (materialId: string, locationId: string): [number | null, number | null] =>
    [counts.get(years[0])?.get(`${materialId}|${locationId}`) ?? null, counts.get(years[1])?.get(`${materialId}|${locationId}`) ?? null];
  const byLocation = new Map<string, Line[]>();
  for (const row of stock) {
    const material = materials.get(row.material_id);
    if (!material) continue;
    const line: Line = { ...row, material, previous: previousOf(row.material_id, row.location_id) };
    if (!matchesFilters(line, state)) continue;
    byLocation.set(row.location_id, [...(byLocation.get(row.location_id) ?? []), line]);
  }
  // Ordem escolhida no cabeçalho, dentro de cada divisão (a árvore não muda).
  const order = compareLines(state.sort, state.dir);
  // Divisões com material, mais as superiores delas (subtítulo de cada nível, mesmo sem material próprio).
  const filled = scope.filter((location) => byLocation.has(location.id));
  const visible = new Set(filled.flatMap((location) => location.ancestors));
  const groups = scope.filter((location) => visible.has(location.id)).map((location) => ({ location, lines: (byLocation.get(location.id) ?? []).sort(order) }));
  const withStock = new Set(stock.map((row) => row.material_id));
  const noStock: Line[] = showAll
    ? [...materials.values()].filter((m) => !withStock.has(m.id))
      .map((material): Line => ({
        material_id: material.id, location_id: "", quantity: 0, value_cents: 0, next_expiry: null, worst_condition: null, conditions: {},
        min_unit_cents: null, max_unit_cents: null, material, previous: [null, null],
      }))
      .filter((line) => matchesFilters(line, state)).sort(order)
    : [];

  const lines = groups.flatMap((group) => group.lines);
  const distinct = new Set([...lines.map((line) => line.material_id), ...noStock.map((line) => line.material_id)]).size;
  const total = lines.reduce((sum, line) => sum + Number(line.value_cents), 0);

  // Esta lista com tudo o que está na URL: detalhes, edição e cadastro voltam para ela.
  const here = materialsHref(params);
  // Abas mantêm busca, filtros e ordem; trocam só o local.
  const hrefFor = (divisao?: string) => materialsHref({ ...params, divisao });
  const sortHref = (key: SortKey) => {
    const dir: SortDir = state.sort === key && state.dir === "asc" ? "desc" : "asc";
    const isDefault = key === "material" && dir === "asc";
    return materialsHref({ ...params, ordem: isDefault ? undefined : key, dir: isDefault || dir === "asc" ? undefined : dir });
  };
  const sortProps = (key: SortKey) => ({ active: state.sort === key, dir: state.dir, href: sortHref(key) });
  const tabs = [
    { href: hrefFor(), label: "Todos", active: showAll },
    ...roots.map((row) => ({ href: hrefFor(row.id), label: row.name, active: root?.id === row.id })),
  ];
  const heading = showAll ? "Todos os locais" : selected && selected.depth > 0 ? selected.path : root?.name ?? "Materiais";

  return <div className="shell">
    <AppHeader current="/inventario/materiais" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Materiais" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Materiais" }]}
        description="Tudo o que o grupo tem, por local: um material em várias divisões aparece em cada uma, com a quantidade de lá."
        actions={member.inventory.canEdit && <Link href="/inventario/materiais/novo" className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Novo material</Link>}>
        <SectionTabs label="Locais" tabs={tabs} />
        <MaterialFilters families={familyOptions} columns={available} hidden={[...hidden]} />
      </PageHeader>
      <SectionCard>
        <SectionHeader title={heading}
          description={selected && selected.depth > 0 && root ? <>Só esta divisão e o que está dentro dela. <Link href={hrefFor(root.id)} className="font-semibold text-primary hover:underline">Ver {root.name} inteiro</Link></> : undefined}>
          <SectionCount>{distinct} {distinct === 1 ? "material" : "materiais"} · valor total <span className="num">{formatCents(total)}</span></SectionCount>
        </SectionHeader>
        {/* A tabela fica mesmo vazia: o cabeçalho tem os menus das colunas, para desfazer o filtro. */}
        <div className="overflow-x-auto"><Table className="min-w-[760px]">
            <TableCaption className="sr-only">Materiais por divisão; a ordem escolhida vale dentro de cada divisão</TableCaption>
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
              {groups.length === 0 && noStock.length === 0 && <TableRow className="hover:bg-transparent">
                <TableCell colSpan={span} className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum material encontrado.</TableCell>
              </TableRow>}
              {noStock.length > 0 && <>
                <GroupRow level="root" columns={columns}>Sem estoque</GroupRow>
                {noStock.map((material) => <MaterialLine key={material.id} depth={0} previous={showPrevious ? null : undefined}
                  line={{ material_id: material.id, location_id: "", quantity: 0, value_cents: 0, next_expiry: null, material }} />)}
              </>}
            </TableBody>
          </Table></div>
      </SectionCard>
    </PageBody>
  </div>;
}

/** Cabeçalho de cada coluna: rótulo, largura e alinhamento. */
const HEADS: Record<ColumnId, { label: string; className: string }> = {
  estado: { label: "Estado", className: "w-32" },
  quantidade: { label: "Quantidade", className: "w-28 text-center" },
  anterior1: { label: "", className: "w-20 text-center" },
  anterior2: { label: "", className: "w-20 text-center" },
  validade: { label: "Validade", className: "w-36" },
  unitario: { label: "Valor unitário", className: "w-36 text-right" },
  total: { label: "Valor total", className: "w-32 text-right" },
};

/** Colunas com menu (ordem + filtro), como na planilha; as outras ordenam com um clique no cabeçalho. */
const optionsOf = <T extends string>(labels: Record<T, string>, order = Object.keys(labels) as T[]) => order.map((value) => ({ value, label: labels[value] }));
const COLUMN_FILTERS: Partial<Record<ColumnId, ColumnFilter>> = {
  estado: { values: { param: "estado", title: "Filtrar por valores", options: optionsOf(CONDITION_LABELS, (Object.keys(CONDITION_RANK) as Condition[]).sort((a, b) => CONDITION_RANK[a] - CONDITION_RANK[b])) } },
  quantidade: {
    values: { param: "minimo", title: "Estoque mínimo", options: optionsOf(MINIMUM_LABELS) },
    range: { from: "qtd_de", to: "qtd_ate", money: false },
  },
  validade: { values: { param: "validade", title: "Filtrar por validade", options: optionsOf(EXPIRY_LABELS) } },
  unitario: { range: { from: "unitario_de", to: "unitario_ate", money: true } },
};

/** Rótulos das duas ordens no menu da coluna. */
const SORT_LABELS: Partial<Record<ColumnId, [string, string]>> = {
  estado: ["Do melhor ao pior", "Do pior ao melhor"],
  quantidade: ["Do menor ao maior", "Do maior ao menor"],
  validade: ["Vence antes primeiro", "Vence depois primeiro"],
  unitario: ["Do menor ao maior valor", "Do maior ao menor valor"],
};

/** Cabeçalho que ordena: clicar ordena por ele (crescente), clicar de novo inverte. */
function SortHead({ label, title, className, active, dir, href }: { label: string; title?: string; className?: string; active: boolean; dir: SortDir; href: string }) {
  return <TableHead className={cn(HEAD_CLASS, className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
    <Link href={href} scroll={false} title={title} className={cn(HEAD_TRIGGER, active && "text-foreground")}>
      {label}
      {active ? <HeadIcons sorted dir={dir} /> : <IconArrowsSort className="size-3.5 shrink-0 opacity-40" aria-hidden />}
      <span className="sr-only">{active ? (dir === "asc" ? ", em ordem crescente. Inverter ordem" : ", em ordem decrescente. Inverter ordem") : ". Ordenar por esta coluna"}</span>
    </Link>
  </TableHead>;
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
  const kinds = Object.values(line.conditions).filter((quantity) => (quantity ?? 0) > 0).length;
  const cells: Record<ColumnId, () => React.ReactNode> = {
    estado: () => <TableCell className={CELL_CLASS}>
      <ConditionPill condition={line.worst_condition} detail={kinds > 1 ? conditionBreakdown(line.conditions) : undefined} />
    </TableCell>,
    quantidade: () => <TableCell className={cn(CELL_CLASS, "num text-center font-semibold")}>
      <span className={cn("inline-flex items-center gap-1", material.below_minimum && "text-destructive")}
        title={material.below_minimum ? `Abaixo do mínimo: ${material.quantity} de ${material.minimum_quantity} no total` : undefined}>
        {material.below_minimum && <IconAlertTriangle className="size-3.5" aria-label="Abaixo do mínimo" />}{line.quantity}
      </span>
      {material.minimum_quantity != null && <span className="block text-[11px] font-normal text-muted-foreground">total {material.quantity} · mín. {material.minimum_quantity}</span>}
    </TableCell>,
    anterior1: () => <TableCell className={cn(CELL_CLASS, "num text-center text-muted-foreground")}>{line.previous[0] ?? "—"}</TableCell>,
    anterior2: () => <TableCell className={cn(CELL_CLASS, "num text-center text-muted-foreground")}>{line.previous[1] ?? "—"}</TableCell>,
    validade: () => <TableCell className={CELL_CLASS}>{line.next_expiry ? <Expiry date={line.next_expiry} /> : empty}</TableCell>,
    unitario: () => <TableCell className={cn(CELL_CLASS, "num text-right")}>{unitValue(line)}</TableCell>,
    total: () => <TableCell className={cn(CELL_CLASS, "num text-right")}>{Number(line.value_cents) > 0 ? formatCents(Number(line.value_cents)) : empty}</TableCell>,
  };
  return <TableRow className={cn(!material.active && "opacity-60")}>
    <TableCell className={cn(CELL_CLASS, "whitespace-normal")} style={indent(depth)}>
      <Link href={withBack(`/inventario/materiais/${material.id}`, back)} className="hover:underline">{material.name}</Link>
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
    <TableCell className={cn(CELL_CLASS, "num text-right")}>{Number(line.value_cents) > 0 ? formatCents(Number(line.value_cents)) : <span className="text-muted-foreground">—</span>}</TableCell>
  </TableRow>;
}
