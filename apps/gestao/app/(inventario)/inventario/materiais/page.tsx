import { Link } from "@geas/ui/components/link";
import { cookies } from "next/headers";
import { Fragment } from "react";
import { IconAlertTriangle, IconArrowsSort, IconBolt, IconClipboardCheck, IconPlus, IconPlusMinus } from "@tabler/icons-react";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import type { Option } from "@geas/ui/components/option-controls";
import { AppHeader } from "@/components/inventory/app-header";
import { ColumnMenu, type ColumnFilter } from "@/components/inventory/materials/column-menu";
import { HEAD_TRIGGER, HeadIcons } from "@/components/shell/column-head";
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
import { MaterialFilters } from "@/components/inventory/materials/material-filters";
import { StockEditor } from "@/components/inventory/materials/stock-editor";
import { BulkSelection } from "@/components/inventory/materials/bulk";
import { IconSprite, SpriteIcon } from "@/components/shell/icon-sprite";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import { chunk, cvCols, cvRows } from "@/components/shell/cv-rows";
import { CONDITION_LABELS, EXPIRY_WARNING_DAYS, daysUntil, type Condition } from "@/lib/inventory/vocabulary";
import { dateBR } from "@/lib/format";
import { formatCents } from "@/lib/format";
import { pageSession } from "@/lib/server/session";

type Line = ListLine & StockRow & { material: MaterialRow };
type Row =
  | { kind: "group"; key: string; level: "root" | "sub"; depth?: number; href?: string; label: string }
  | { kind: "line"; key: string; line: Line; depth: number };

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

  const [materialData, stock, paths, familyOptions, counts, cookieStore, toReview] = await Promise.all([
    materialsData.list(db, groupId, { includeInactive: params.inativos === "1", familyId: params.familia, search: params.q }),
    materialsData.stockByLocation(db, groupId),
    locations.listPaths(db, groupId),
    families.listOptions(db, groupId),
    materialsData.countsOfYears(db, groupId, [...years]),
    cookies(),
    member.inventory.canReview ? movementsData.pendingCount(db, groupId) : Promise.resolve(0),
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
  const canEdit = member.inventory.canWrite;
  const span = columns.length + 1 + (canEdit ? 2 : 0);
  // Edição em massa: divisões ativas (na ordem da árvore) e famílias para os diálogos da barra de ações.
  const locationOptions = paths.filter((row) => row.active).map((row) => ({ value: row.id, label: row.path }));
  // Botão ± das linhas (material por quantidade): os lotes vêm do servidor ao clicar (StockEditor), não no HTML.
  const pathOf = new Map(paths.map((row) => [row.id, row.path]));
  const stockActions: StockActions | null = canEdit ? { pathOf } : null;
  // Linhas da tabela em sequência (subtítulos e materiais), cortadas em blocos que o navegador pula fora da tela.
  const rows: Row[] = [
    ...groups.flatMap(({ location, lines: groupLines }): Row[] => [
      ...(location.depth === 0
        ? showAll ? [{ kind: "group", key: location.id, level: "root", label: location.name } as const] : []
        : [{ kind: "group", key: location.id, level: "sub", depth: location.depth, href: hrefFor(location.id), label: location.name } as const]),
      ...groupLines.map((line): Row => ({ kind: "line", key: `${line.location_id}-${line.material_id}`, line, depth: location.depth })),
    ]),
    ...(noStock.length > 0 ? [{ kind: "group", key: "sem-estoque", level: "root", label: "Sem estoque" } as const] : []),
    ...noStock.map((line): Row => ({ kind: "line", key: line.material_id, line, depth: 0 })),
  ];

  return <div className="shell">
    <AppHeader current="/inventario/materiais" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Materiais" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Materiais" }]}
        description="Tudo o que o grupo tem, por local: um material em várias divisões aparece em cada uma, com a quantidade de lá."
        actions={<>
          {toReview > 0 && <Link href="/inventario/movimentacoes?revisao=para_revisar" className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-3 py-1 text-xs font-semibold text-caution hover:ring-1 hover:ring-current">
            <IconClipboardCheck className="size-4" aria-hidden /> {toReview} para revisar</Link>}
          {member.inventory.canWrite && <Link href="/rapido" className={buttonVariants({ variant: "outline", size: "lg" })}><IconBolt data-icon="inline-start" /> Registro rápido</Link>}
          {member.inventory.canWrite && <Link href={withBack("/inventario/materiais/novo", here)} className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Novo material</Link>}
        </>}>
        <SectionTabs label="Locais" tabs={tabs} />
        <MaterialFilters families={familyOptions} columns={available} hidden={[...hidden]} />
      </PageHeader>
      <SectionCard>
        <SectionHeader title={heading}
          description={selected && selected.depth > 0 && root ? <>Só esta divisão e o que está dentro dela. <Link href={hrefFor(root.id)} className="font-semibold text-primary hover:underline">Ver {root.name} inteiro</Link></> : undefined}>
          <SectionCount>{distinct} {distinct === 1 ? "material" : "materiais"} · valor total <span className="num">{formatCents(total)}</span></SectionCount>
        </SectionHeader>
        {/* A tabela fica mesmo vazia: o cabeçalho tem os menus das colunas, para desfazer o filtro. Corpo em blocos
            (`cv-table`/`cv-rows` do tema): o navegador pula os que estão fora da tela. */}
        <IconSprite icons={SPRITE} />
        <EditorFrame canEdit={canEdit} listKey={here} locations={locationOptions} families={familyOptions}><div className="overflow-x-auto"><Table className={cn("cv-table min-w-[760px]", MAT_BODY)} style={cvCols([...(canEdit ? ["2.25rem"] : []), "minmax(12rem, 1fr)", ...columns.map((id) => HEADS[id].track), ...(canEdit ? ["2.5rem"] : [])])}>
            <TableCaption className="sr-only">Materiais por divisão; a ordem escolhida vale dentro de cada divisão</TableCaption>
            <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
              {canEdit && <TableHead className={cn(HEAD_CLASS, "w-9 px-1! text-center")}>
                <input type="checkbox" data-sel-all="" aria-label="Selecionar todas as linhas da lista" title="Selecionar todas (Shift + clique numa linha marca o intervalo)" className="size-4 cursor-pointer accent-primary align-middle" />
              </TableHead>}
              <SortHead label="Material" {...sortProps("material")} />
              {columns.map((id) => COLUMN_FILTERS[id]
                ? <TableHead key={id} className={cn(HEAD_CLASS, HEADS[id].className)} aria-sort={state.sort === id ? (state.dir === "asc" ? "ascending" : "descending") : undefined}>
                  <ColumnMenu label={HEADS[id].label} sortKey={id} filter={COLUMN_FILTERS[id]} sortLabels={SORT_LABELS[id] ?? ["Crescente", "Decrescente"]} align={HEADS[id].className.includes("text-right") ? "end" : "start"} />
                </TableHead>
                : <SortHead key={id} {...sortProps(id)} className={HEADS[id].className}
                  label={yearOf[id] ? String(yearOf[id]) : HEADS[id].label} title={yearOf[id] ? `Contagem de ${yearOf[id]}` : undefined} />)}
              {canEdit && <TableHead className={cn(HEAD_CLASS, "w-10")}><span className="sr-only">Incluir ou remover</span></TableHead>}
            </TableRow></TableHeader>
            {chunk(rows).map((block, index) => <TableBody key={index} className="cv-rows" style={cvRows(block.length, "2.5rem")}>
              {block.map((row) => row.kind === "group"
                ? <GroupRow key={row.key} level={row.level} depth={row.depth} columns={span} href={row.href}>{row.label}</GroupRow>
                : <MaterialLine key={row.key} line={row.line} depth={row.depth} columns={columns} back={here} actions={stockActions} />)}
            </TableBody>)}
            {rows.length === 0 && <TableBody><TableRow className="hover:bg-transparent">
              <TableCell colSpan={span} className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum material encontrado.</TableCell>
            </TableRow></TableBody>}
          </Table></div></EditorFrame>
      </SectionCard>
    </PageBody>
  </div>;
}

/** Cabeçalho de cada coluna: rótulo, largura e alinhamento. */
const HEADS: Record<ColumnId, { label: string; className: string; track: string }> = {
  estado: { label: "Estado", className: "w-32", track: "8rem" },
  quantidade: { label: "Quantidade", className: "w-28 text-center", track: "7rem" },
  anterior1: { label: "", className: "w-20 text-center", track: "5rem" },
  anterior2: { label: "", className: "w-20 text-center", track: "5rem" },
  validade: { label: "Validade", className: "w-36", track: "9rem" },
  unitario: { label: "Valor unitário", className: "w-36 text-right", track: "9rem" },
  total: { label: "Valor total", className: "w-32 text-right", track: "8rem" },
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

const empty = <span className="text-muted-foreground">—</span>;

/** Quem edita ganha o ouvinte único dos botões ± (StockEditor); quem só lê, a tabela pura. */
const EditorFrame = ({ canEdit, listKey, locations, families, children }: { canEdit: boolean; listKey: string; locations: Option[]; families: Option[]; children: React.ReactNode }) =>
  canEdit ? <BulkSelection key={listKey} locations={locations} families={families}><StockEditor>{children}</StockEditor></BulkSelection> : <>{children}</>;

const SPRITE = { "plus-minus": IconPlusMinus, alert: IconAlertTriangle };

/**
 * Estilo das linhas de material, uma vez só no `<table>` (variantes do Tailwind), e não repetido em cada linha: no App
 * Router cada classe vai duas vezes na página (HTML + payload RSC). As células levam só `data-a` (alinhamento:
 * `c` centro, `r` direita, `q` quantidade, `m` contagem esmaecida) e `data-n` (nome, com quebra); o estado é
 * `data-cond` (as cores de ConditionPill), as etiquetas `data-tag` (Badge outline) e o botão ± `data-stock`.
 */
const MAT_BODY = [
  "[&_tr[data-m]]:border-b [&_tr[data-m]]:transition-colors [&_tr[data-m]:hover]:bg-muted/50 [&_tr[data-off]]:opacity-60",
  "[&_tr[data-m]>td]:px-3 [&_tr[data-m]>td]:py-1.5 [&_tr[data-m]>td]:align-middle [&_tr[data-m]>td]:whitespace-nowrap [&_td[data-n]]:whitespace-normal!",
  "[&_td[data-a=c]]:text-center [&_td[data-a=r]]:text-right [&_td[data-a=q]]:text-center [&_td[data-a=q]]:font-semibold [&_td[data-a=m]]:text-center [&_td[data-a=m]]:text-muted-foreground",
  "[&_td[data-a=b]]:px-1! [&_td[data-a=b]]:text-center [&_input[data-sel]]:size-4 [&_input[data-sel]]:cursor-pointer [&_input[data-sel]]:accent-primary [&_input[data-sel]]:align-middle [&_tr[data-m]:has(input[data-sel]:checked)]:bg-primary/5",
  "[&_[data-cond]]:inline-flex [&_[data-cond]]:items-center [&_[data-cond]]:gap-1.5 [&_[data-cond]]:rounded-full [&_[data-cond]]:px-2 [&_[data-cond]]:py-0.5 [&_[data-cond]]:text-xs [&_[data-cond]]:font-medium [&_[data-cond]]:whitespace-nowrap",
  "[&_[data-cond]]:before:size-1.5 [&_[data-cond]]:before:shrink-0 [&_[data-cond]]:before:rounded-full [&_[data-cond]]:before:bg-current [&_[data-cond]]:before:opacity-80 [&_[data-cond]]:before:content-['']",
  "[&_[data-cond=novo]]:bg-success [&_[data-cond=novo]]:text-white [&_[data-cond=bom]]:bg-success-soft [&_[data-cond=bom]]:text-success",
  "[&_[data-cond=regular]]:bg-warning-soft [&_[data-cond=regular]]:text-warning [&_[data-cond=manutencao]]:bg-info-soft [&_[data-cond=manutencao]]:text-info",
  "[&_[data-cond=ruim]]:bg-destructive-soft [&_[data-cond=ruim]]:text-destructive [&_[data-cond=inservivel]]:bg-destructive [&_[data-cond=inservivel]]:text-white",
  "[&_[data-tag]]:inline-flex [&_[data-tag]]:h-5 [&_[data-tag]]:items-center [&_[data-tag]]:rounded-full [&_[data-tag]]:border [&_[data-tag]]:border-border [&_[data-tag]]:bg-card [&_[data-tag]]:px-2 [&_[data-tag]]:py-0.5 [&_[data-tag]]:text-[0.625rem] [&_[data-tag]]:font-medium [&_[data-tag]]:whitespace-nowrap",
  "[&_button[data-stock]]:inline-flex [&_button[data-stock]]:size-6 [&_button[data-stock]]:items-center [&_button[data-stock]]:justify-center [&_button[data-stock]]:rounded-full [&_button[data-stock]]:border [&_button[data-stock]]:border-transparent [&_button[data-stock]]:outline-none",
  "[&_button[data-stock]:hover]:bg-muted [&_button[data-stock]:hover]:text-foreground [&_button[data-stock]:focus-visible]:border-ring [&_button[data-stock]:focus-visible]:ring-2 [&_button[data-stock]:focus-visible]:ring-ring/30 [&_button[data-stock][aria-busy=true]]:animate-pulse",
].join(" ");

/** Faixa do valor unitário: um valor quando todos os lotes/peças têm o mesmo. */
function unitValue(line: Line) {
  if (line.min_unit_cents == null) return empty;
  const min = Number(line.min_unit_cents);
  const max = Number(line.max_unit_cents ?? min);
  return min === max ? formatCents(min) : <span title="Lotes ou peças com valores diferentes">{formatCents(min)} – {formatCents(max)}</span>;
}

/** Validade com o tom de vencido / vencendo (como `Expiry` de lots-table, mas sem componente de cliente por linha). */
function expiry(date: string) {
  const days = daysUntil(date);
  const tone = days < 0 ? "text-destructive font-semibold" : days <= EXPIRY_WARNING_DAYS ? "text-caution font-semibold" : undefined;
  return <span className={cn("num", tone)} title={days < 0 ? "Vencido" : `Vence em ${days} dias`}>{dateBR(date)}{days < 0 && " (vencido)"}</span>;
}

/** Estado (pior condição), como ConditionPill, estilizado pela tabela (`data-cond`). */
function condition(value: Condition | null, detail?: string) {
  if (!value) return empty;
  return <span data-cond={value} title={detail}>{CONDITION_LABELS[value]}{detail && <><span aria-hidden className="opacity-70">+</span><span className="sr-only"> (pior estado; {detail})</span></>}</span>;
}

type StockActions = { pathOf: Map<string, string> };

/**
 * Material numa divisão: as colunas visíveis, com os valores daquela divisão; para quem edita, o botão ± no fim.
 * `<tr>`/`<td>` simples (sem as classes de TableRow/TableCell em cada célula); o material e a divisão vão no `<tr>`
 * para o StockEditor.
 */
function MaterialLine({ line, depth, columns, back, actions }: { line: Line; depth: number; columns: ColumnId[]; back: string; actions: StockActions | null }) {
  const { material } = line;
  const kinds = Object.values(line.conditions).filter((quantity) => (quantity ?? 0) > 0).length;
  const stock = actions && material.tracking === "lot" && material.active && line.location_id;
  const cells: Record<ColumnId, () => React.ReactNode> = {
    estado: () => <td>{condition(line.worst_condition, kinds > 1 ? conditionBreakdown(line.conditions) : undefined)}</td>,
    quantidade: () => <td data-a="q" className="num">
      <span className={cn("inline-flex items-center gap-1", material.below_minimum && "text-destructive")}
        title={material.below_minimum ? `Abaixo do mínimo: ${material.quantity} de ${material.minimum_quantity} no total` : undefined}>
        {material.below_minimum && <><SpriteIcon id="alert" className="size-3.5" /><span className="sr-only">Abaixo do mínimo</span></>}{line.quantity}
      </span>
      {material.minimum_quantity != null && <span className="block text-[11px] font-normal text-muted-foreground">total {material.quantity} · mín. {material.minimum_quantity}</span>}
    </td>,
    anterior1: () => <td data-a="m" className="num">{line.previous[0] ?? "—"}</td>,
    anterior2: () => <td data-a="m" className="num">{line.previous[1] ?? "—"}</td>,
    validade: () => <td>{line.next_expiry ? expiry(line.next_expiry) : empty}</td>,
    unitario: () => <td data-a="r" className="num">{unitValue(line)}</td>,
    total: () => <td data-a="r" className="num">{Number(line.value_cents) > 0 ? formatCents(Number(line.value_cents)) : empty}</td>,
  };
  return <tr data-m={material.id} data-l={stock ? line.location_id : undefined} data-name={stock ? material.name : undefined}
    data-path={stock ? actions.pathOf.get(line.location_id) ?? "" : undefined} data-cons={stock && material.consumable ? "" : undefined} data-off={material.active ? undefined : ""}>
    {actions && <td data-a="b"><input type="checkbox" data-sel="" value={`${material.id}|${line.location_id}`} aria-label={`Selecionar ${material.name}${line.location_id ? ` em ${actions.pathOf.get(line.location_id) ?? ""}` : " (sem estoque)"}`} /></td>}
    <td data-n="" style={indent(depth)}>
      <Link href={withBack(`/inventario/materiais/${material.id}`, back)} className="hover:underline">{material.name}</Link>
      {(material.consumable || !material.active) && <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
        {material.consumable && <span data-tag="">Consumível</span>}
        {!material.active && <span data-tag="">Inativo</span>}
      </span>}
    </td>
    {columns.map((id) => <Fragment key={id}>{cells[id]()}</Fragment>)}
    {actions && <td data-a="b">
      {stock && <button type="button" data-stock="" aria-label={`Incluir ou remover: ${material.name}`} title={`Incluir ou remover: ${material.name}`}><SpriteIcon id="plus-minus" className="size-3" /></button>}
    </td>}
  </tr>;
}
