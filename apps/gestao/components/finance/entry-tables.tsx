import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { EntryCard, EntryLink, EntryRow, EntryRowActions, FolderStatus, ReviewMark, useEntrySelection } from "@/components/finance/entries/entry-editor";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Label } from "@geas/ui/components/label";
import { dateBR, money } from "@/lib/format";
import { cn } from "@geas/ui/lib/utils";
import { Link } from "@geas/ui/components/link";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { IconArrowDown, IconArrowUp, IconPaperclip } from "@tabler/icons-react";
import type { SplitRow, LedgerRow } from "@/lib/finance/entry-rows";
import { parseEntrySort, type EntrySort, type SortOrder } from "@/lib/finance/filters";
import { useSearchParams } from "next/navigation";
import { SortMenu, type ColumnRange, type ColumnSort } from "@/components/finance/entries/sort-menu";
import { MultiFilter } from "@/components/finance/entries/multi-filter";
import { AssociateFilter } from "@/components/finance/entries/associate-filter";
import type { FilterKey } from "@/components/finance/entries/filter-options";
import { OfxIds } from "@/components/finance/entries/ofx-ids";

export type { SplitRow, LedgerRow };

const cell = "px-2.5 py-1 align-middle whitespace-nowrap";
/** Texto longo numa linha só, cortado com reticências; o texto inteiro fica no `title`. */
const clip = (max: string) => cn("block truncate", max);

function Clip({ text, max }: { text: string | null | undefined; max: string }) {
  return text ? <span className={clip(max)} title={text}>{text}</span> : <span className="text-muted-foreground">—</span>;
}
const headCell = "h-8 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const amountCell = (cents: number) => cn(cell, "text-right font-semibold num whitespace-nowrap", cents < 0 && "text-destructive");

const COLUMN_FILTERS: Record<string, FilterKey> = { "Conta": "conta", "Forma pgto": "forma", "Documentos": "pasta", "ID OFX": "conciliado", "Rubrica": "rubrica" };

export const COLUMN_SORTS: Record<string, ColumnSort> = {
  "Data": { key: "data", labels: ["Mais antigas primeiro", "Mais recentes primeiro"] },
  "Histórico": { key: "historico", labels: ["A → Z", "Z → A"] },
  "Conta": { key: "conta", labels: ["A → Z", "Z → A"] },
  "Forma pgto": { key: "forma", labels: ["A → Z", "Z → A"] },
  "Valor": { key: "valor", labels: ["Menor → maior", "Maior → menor"] },
};

/** Colunas numéricas com filtro de faixa (de/até em reais, com sinal) no menu da coluna. */
export const COLUMN_RANGES: Record<string, ColumnRange> = {
  "Valor": { from: "valor_de", to: "valor_ate" },
};

/** `order`/`sortHref` ficam para a barra dos cartões; o cabeçalho lê a ordem da URL. */
type Sort = { order: SortOrder; sortHref: string; sort?: EntrySort };

type Column = { label: string; className?: string };

/** Memoizado: com a virtualização, a tabela re-renderiza a cada rolagem, e o cabeçalho (menus de coluna) não muda. */
const Head = memo(function Head({ columns, selectRows, virtual }: { columns: Column[]; selectRows?: LedgerRow[]; virtual: boolean }) {
  const params = useSearchParams();
  const current = parseEntrySort(Object.fromEntries(params.entries()));
  return <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)] [&_tr]:border-b-0">
    <TableRow className="hover:bg-transparent" aria-rowindex={virtual ? 1 : undefined}>
      {selectRows && <TableHead className="size-8 px-2.5"><SelectAll rows={selectRows} /></TableHead>}
      {columns.map((column) => {
        const right = column.className?.includes("text-right");
        const sort = COLUMN_SORTS[column.label];
        const filterKey = COLUMN_FILTERS[column.label];
        const align = right ? "end" : "start";
        return <TableHead key={column.label} className={cn(headCell, column.className)} aria-sort={sort && sort.key === current.key ? (current.dir === "asc" ? "ascending" : "descending") : undefined}>
          {column.label === "Associado" ? <AssociateFilter align={align} />
            : filterKey ? <MultiFilter filterKey={filterKey} variant="head" label={column.label} align={align} sort={sort} />
            : sort ? <SortMenu label={column.label} sort={sort} range={COLUMN_RANGES[column.label]} period={sort.key === "data"} align={align} /> : column.label}
        </TableHead>;
      })}
      <TableHead className="h-8 w-10 px-1"><span className="sr-only">Ações</span></TableHead>
    </TableRow>
  </TableHeader>;
});

const LEDGER_COLUMNS: Column[] = [{ label: "Data", className: "w-28" }, { label: "Histórico" }, { label: "Conta", className: "w-40" }, { label: "Forma pgto", className: "w-40" }, { label: "Documentos", className: "w-48" }, { label: "ID OFX", className: "w-36" }, { label: "Valor", className: "w-32 text-right" }];
const SPLIT_COLUMNS: Column[] = [{ label: "Data", className: "w-24" }, { label: "Histórico" }, { label: "Conta" }, { label: "Forma pgto" }, { label: "Documentos" }, { label: "ID OFX" }, { label: "Valor", className: "text-right" }, { label: "Associado" }, { label: "Descrição" }, { label: "Rubrica", className: "w-40" }];

/**
 * Rubrica com código e cor do tipo, como na planilha: verde receita, vermelho despesa.
 * Na tabela a coluna tem largura fixa (`w-40` no cabeçalho, com o padding da célula): a etiqueta cabe
 * no espaço útil (10rem − 1.25rem) e corta o nome com reticências, para a largura não variar
 * conforme as rubricas das linhas visíveis.
 */
function CategoryTag({ code, name, kind }: { code: string | null; name: string; kind: "receita" | "despesa" | null }) {
  return <span className={cn("inline-flex max-w-full items-center md:max-w-[8.75rem] gap-1 truncate rounded px-1.5 py-0.5 font-medium",
    kind === "receita" ? "bg-success-soft text-success" : kind === "despesa" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")} title={code ? `${code} ${name}` : name}>
    {code && <span className="num shrink-0 opacity-80">{code}</span>}<span className="min-w-0 truncate">{name}</span>
  </span>;
}

/** Clipe com a quantidade de comprovantes anexados ao lançamento. */
function AttachmentClip({ count }: { count?: number }) {
  if (!count) return null;
  const label = count === 1 ? "1 comprovante anexado" : `${count} comprovantes anexados`;
  return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={label}>
    <IconPaperclip className="size-3.5" aria-hidden />{count > 1 && <span className="num" aria-hidden>{count}</span>}<span className="sr-only">{label}</span>
  </span>;
}


const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-6 py-12 text-center text-muted-foreground">{children}</div>;

/** Sem linhas: a mensagem fica no corpo da tabela, sob o cabeçalho (que continua com os menus de filtro). */
const EmptyRow = ({ columns, children }: { columns: number; children: React.ReactNode }) => <TableRow className="hover:bg-transparent">
  <TableCell colSpan={columns} className="px-6 py-12 text-center whitespace-normal text-muted-foreground">{children}</TableCell>
</TableRow>;

/** Marca todos os lançamentos já carregados (ou desmarca). */
function SelectAll({ rows }: { rows: LedgerRow[] }) {
  const { selected, setSelected } = useEntrySelection();
  const count = rows.filter((row) => selected.has(row.entry_id)).length;
  return <Checkbox aria-label="Selecionar todos os lançamentos carregados" disabled={!rows.length} checked={count > 0 && count === rows.length} indeterminate={count > 0 && count < rows.length}
    onCheckedChange={(on) => setSelected(rows.map((row) => [row.entry_id, { accountName: row.account_name, reconciled: Boolean(row.reconciled) }]), on)} />;
}

function SelectRow({ row }: { row: LedgerRow }) {
  const { selected, setSelected } = useEntrySelection();
  return <Checkbox aria-label={`Selecionar ${row.name}`} checked={selected.has(row.entry_id)}
    onCheckedChange={(on) => setSelected([[row.entry_id, { accountName: row.account_name, reconciled: Boolean(row.reconciled) }]], on)} />;
}


/** A partir de quantas linhas carregadas a tabela passa a montar só as que estão perto da tela. */
export const VIRTUALIZE_FROM = 100;
/** Altura do cabeçalho fixo (h-8): as linhas começam abaixo dele dentro da área que rola. */
const HEAD_HEIGHT = 32;

/**
 * Virtualização das linhas da planilha (desktop). Abaixo de VIRTUALIZE_FROM todas as linhas são
 * montadas (o HTML do servidor traz a primeira página inteira) e o virtualizador fica desligado: ligado, ele
 * re-renderiza a tabela inteira a cada evento de rolagem (era o lag com ~200 lançamentos). Acima, só as linhas
 * visíveis (mais uma margem) ficam no DOM, entre duas linhas espaçadoras; aria-rowcount/aria-rowindex mantêm a
 * posição para leitores de tela. Medição: e2e/perf/lancamentos.perf.ts.
 */
function useVirtualRows(keys: string[], scroller: React.RefObject<HTMLElement | null>) {
  // o app não usa o React Compiler; o aviso só diz que este hook não seria memoizado por ele
  const virtual = keys.length >= VIRTUALIZE_FROM;
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
    enabled: virtual,
    count: keys.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 33,
    getItemKey: (index) => keys[index],
    scrollMargin: HEAD_HEIGHT,
    overscan: 15,
    useFlushSync: false,
  });
  if (!virtual) return { virtual, indexes: keys.map((_, index) => index), top: 0, bottom: 0, measure: undefined };
  const items = virtualizer.getVirtualItems();
  const first = items[0];
  const last = items[items.length - 1];
  return {
    virtual,
    indexes: items.map((item) => item.index),
    top: first ? first.start - HEAD_HEIGHT : 0,
    bottom: last ? virtualizer.getTotalSize() - (last.end - HEAD_HEIGHT) : 0,
    measure: virtualizer.measureElement,
  };
}

/** Linha vazia que ocupa a altura das linhas não montadas. */
const Spacer = ({ height, columns }: { height: number; columns: number }) => height > 0
  ? <tr aria-hidden className="border-0"><td colSpan={columns} className="p-0" style={{ height }} /></tr>
  : null;

/** Listra zebrada pelo índice (e não por :nth-child, que as linhas espaçadoras deslocariam). */
const stripe = (index: number) => index % 2 === 1 && "bg-muted/40";

type Scroller = { scroller: React.RefObject<HTMLElement | null> };

export function LedgerTable({ rows, filtered, scroller }: { rows: LedgerRow[]; filtered: boolean } & Sort & Scroller) {
  const { canEdit } = useEntrySelection();
  const { virtual, indexes, top, bottom, measure } = useVirtualRows(rows.map((row) => row.entry_id), scroller);
  const columns = canEdit ? 9 : 8;
  return <Table className="min-w-[980px]" containerClassName="overflow-visible" aria-rowcount={virtual ? rows.length + 1 : undefined}>
    <TableCaption className="sr-only">Um lançamento por linha. Selecione uma linha para ver os detalhes e o rateio.</TableCaption>
    <Head columns={LEDGER_COLUMNS} selectRows={canEdit ? rows : undefined} virtual={virtual} />
    <TableBody>
      {!rows.length && <EmptyRow columns={columns}>{filtered ? "Nenhum lançamento corresponde aos filtros." : "Nenhum lançamento ainda. Comece pelo botão “Novo lançamento”."}</EmptyRow>}
      <Spacer height={top} columns={columns} />
      {indexes.map((index) => <LedgerLine key={rows[index].entry_id} row={rows[index]} index={index} virtual={virtual} measure={measure} canEdit={canEdit} />)}
      <Spacer height={bottom} columns={columns} />
    </TableBody>
  </Table>;
}

type LineProps = { index: number; virtual: boolean; measure?: (node: HTMLTableRowElement | null) => void };

/** Uma linha de Movimentações; memoizada para a rolagem só montar as linhas novas. */
const LedgerLine = memo(function LedgerLine({ row, index, virtual, measure, canEdit }: LineProps & { row: LedgerRow; canEdit: boolean }) {
  return <EntryRow entryId={row.entry_id} ref={measure} data-index={index} aria-rowindex={virtual ? index + 2 : undefined} className={cn(stripe(index))}>
    {canEdit && <TableCell className="px-2.5 py-1 align-middle" onClick={(event) => event.stopPropagation()}><SelectRow row={row} /></TableCell>}
    <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
    <TableCell className={cell} title={row.name}><span className="flex items-center"><EntryLink entryId={row.entry_id} className={clip("max-w-96")}>{row.name}</EntryLink><ReviewMark entryId={row.entry_id} status={row.review_status} /></span></TableCell>
    <TableCell className={cell}><Clip text={row.account_name} max="max-w-44" /></TableCell>
    <TableCell className={cell}><Clip text={row.payment_method_name} max="max-w-40" /></TableCell>
    <TableCell className={cell}><span className="inline-flex items-center gap-1.5"><FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} /><AttachmentClip count={row.attachment_count} /></span></TableCell>
    <TableCell className={cell}><OfxIds ids={row.external_ids ?? []} /></TableCell>
    <TableCell className={amountCell(row.total_cents)}>{money(row.total_cents / 100)}</TableCell>
    <TableCell className="px-1 py-0.5 align-middle"><EntryRowActions entryId={row.entry_id} filed={row.document_filed} /></TableCell>
  </EntryRow>;
});

/** Uma linha do Detalhamento (`continued`: rateio seguinte do mesmo lançamento). */
const SplitLine = memo(function SplitLine({ row, index, virtual, measure, continued }: LineProps & { row: SplitRow; continued: boolean }) {
  return <EntryRow entryId={row.entry_id} data-entry-id={row.entry_id} ref={measure} data-index={index} aria-rowindex={virtual ? index + 2 : undefined}
    className={cn(stripe(index))}>
    <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
    <TableCell className={cell} title={row.entry_name}><span className="flex items-center"><EntryLink entryId={row.entry_id} className={cn("font-medium", clip("max-w-52"))}>{row.entry_name}</EntryLink>{!continued && <ReviewMark entryId={row.entry_id} status={row.review_status} />}</span></TableCell>
    <TableCell className={cell}><Clip text={row.account_name} max="max-w-40" /></TableCell>
    <TableCell className={cell}><Clip text={row.payment_method_name} max="max-w-36" /></TableCell>
    <TableCell className={cell}><span className="inline-flex items-center gap-1.5"><FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} />{!continued && <AttachmentClip count={row.attachment_count} />}</span></TableCell>
    <TableCell className={cell}>{!continued && <OfxIds ids={row.external_ids ?? []} />}</TableCell>
    <TableCell className={amountCell(row.amount_cents)}>{money(row.amount_cents / 100)}</TableCell>
    <TableCell className={cell}><Clip text={row.associate_name} max="max-w-48" /></TableCell>
    <TableCell className={cell}><Clip text={row.description} max="max-w-56" /></TableCell>
    <TableCell className={cell}><CategoryTag code={row.category_code} name={row.category_name} kind={row.category_kind} /></TableCell>
    <TableCell className="px-1 py-0.5 align-middle">{!continued && <EntryRowActions entryId={row.entry_id} filed={row.document_filed} />}</TableCell>
  </EntryRow>;
});

export function SplitTable({ rows, filtered, scroller }: { rows: SplitRow[]; filtered: boolean } & Sort & Scroller) {
  const { virtual, indexes, top, bottom, measure } = useVirtualRows(rows.map((row) => row.split_id), scroller);
  const columns = 11;
  return <Table className="min-w-[1220px]" containerClassName="overflow-visible" aria-rowcount={virtual ? rows.length + 1 : undefined}>
    <TableCaption className="sr-only">Um rateio por linha, repetindo os dados do lançamento de origem. Selecione uma linha para ver o lançamento.</TableCaption>
    <Head columns={SPLIT_COLUMNS} virtual={virtual} />
    <TableBody>
      {!rows.length && <EmptyRow columns={columns}>{filtered ? "Nenhum rateio corresponde aos filtros." : "Os rateios aparecerão depois do primeiro lançamento."}</EmptyRow>}
      <Spacer height={top} columns={columns} />
      {indexes.map((index) => <SplitLine key={rows[index].split_id} row={rows[index]} index={index} virtual={virtual} measure={measure}
        continued={index > 0 && rows[index - 1].entry_id === rows[index].entry_id} />)}
      <Spacer height={bottom} columns={columns} />
    </TableBody>
  </Table>;
}

/* Telas estreitas (< md): um cartão por lançamento ou rateio, com as informações principais. */

const cardAmount = (cents: number) => cn("num shrink-0 text-sm font-semibold whitespace-nowrap", cents < 0 && "text-destructive");
const Meta = ({ parts }: { parts: (React.ReactNode | null | undefined)[] }) => <p className="m-0 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
  {parts.filter(Boolean).map((part, index) => <span key={index}>{index > 0 && <span aria-hidden>· </span>}{part}</span>)}
</p>;

/** Barra acima dos cartões: marcar todos (quem edita) e inverter a ordem por data. */
function CardsBar({ order, sortHref, select }: Sort & { select?: React.ReactNode }) {
  return <div className="flex items-center gap-2 border-b bg-muted px-3 py-1.5 text-xs">
    {select && <Label className="gap-2 text-xs font-normal">{select} Selecionar todos</Label>}
    <Link href={sortHref} scroll={false} className="ml-auto inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground">
      {order === "desc" ? "Mais recentes primeiro" : "Mais antigos primeiro"}
      {order === "desc" ? <IconArrowDown className="size-3.5" aria-hidden /> : <IconArrowUp className="size-3.5" aria-hidden />}
      <span className="sr-only">. Inverter ordem</span>
    </Link>
  </div>;
}

/** Altura estimada de um cartão antes de medir (a altura real varia com o texto e é medida). */
const CARD_ESTIMATE = 96;

/**
 * Virtualização dos cartões do celular, que rolam com a janela. Mesma regra das tabelas: abaixo de VIRTUALIZE_FROM
 * o virtualizador fica desligado e todos os cartões são montados; acima, só os que estão perto da tela, com o resto
 * da altura em padding da lista (o sentinel da rolagem infinita continua no fim). `scrollMargin` é a posição da lista
 * na página, atualizada quando a página muda de altura. aria-setsize/aria-posinset mantêm a posição para leitores de
 * tela. Medição: e2e/perf/lancamentos.perf.ts (cartões).
 */
function useVirtualCards(keys: string[], list: React.RefObject<HTMLUListElement | null>) {
  const virtual = keys.length >= VIRTUALIZE_FROM;
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    if (!virtual) return;
    const update = () => { if (list.current) setMargin(Math.round(list.current.getBoundingClientRect().top + window.scrollY)); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [virtual, list]);
  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    enabled: virtual,
    count: keys.length,
    estimateSize: () => CARD_ESTIMATE,
    getItemKey: (index) => keys[index],
    scrollMargin: margin,
    overscan: 8,
    // no servidor (e antes de medir) monta os cartões da primeira tela, e não uma lista vazia
    initialRect: { width: 0, height: 900 },
    useFlushSync: false,
  });
  if (!virtual) return { virtual, indexes: keys.map((_, index) => index), style: undefined, measure: undefined };
  const items = virtualizer.getVirtualItems();
  const first = items[0];
  const last = items[items.length - 1];
  const top = first ? first.start - margin : 0;
  const bottom = last ? virtualizer.getTotalSize() - (last.end - margin) : 0;
  return { virtual, indexes: items.map((item) => item.index), style: { paddingTop: top, paddingBottom: bottom }, measure: virtualizer.measureElement };
}

type CardProps = { index: number; total?: number; measure?: (node: HTMLLIElement | null) => void };
/** Posição do cartão na lista inteira (só com a lista virtualizada). */
const position = (index: number, total?: number) => total === undefined ? {} : { "aria-setsize": total, "aria-posinset": index + 1 };

export function LedgerCards({ rows, filtered, order, sortHref }: { rows: LedgerRow[]; filtered: boolean } & Sort) {
  const { canEdit } = useEntrySelection();
  const list = useRef<HTMLUListElement>(null);
  const { virtual, indexes, style, measure } = useVirtualCards(rows.map((row) => row.entry_id), list);
  if (!rows.length) return <Empty>{filtered ? "Nenhum lançamento corresponde aos filtros." : "Nenhum lançamento ainda. Comece pelo botão “Novo lançamento”."}</Empty>;
  return <>
    <CardsBar order={order} sortHref={sortHref} select={canEdit ? <SelectAll rows={rows} /> : undefined} />
    <ul ref={list} aria-label="Lançamentos, um por cartão" className="m-0 list-none p-0" style={style}>
      {indexes.map((index) => <LedgerCard key={rows[index].entry_id} row={rows[index]} index={index} total={virtual ? rows.length : undefined} measure={measure} canEdit={canEdit} />)}
    </ul>
  </>;
}

/** Um cartão de lançamento; memoizado para a rolagem só montar os cartões novos. */
const LedgerCard = memo(function LedgerCard({ row, index, total, measure, canEdit }: CardProps & { row: LedgerRow; canEdit: boolean }) {
  return <EntryCard entryId={row.entry_id} ref={measure} data-index={index} {...position(index, total)} className={cn("flex items-start gap-2.5 border-b px-3 py-2.5", stripe(index))}>
    {canEdit && <span className="pt-0.5"><SelectRow row={row} /></span>}
    <div className="grid min-w-0 flex-1 gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0"><EntryLink entryId={row.entry_id} className="text-sm break-words">{row.name}</EntryLink><ReviewMark entryId={row.entry_id} status={row.review_status} /></span>
        <span className={cardAmount(row.total_cents)}>{money(row.total_cents / 100)}</span>
      </div>
      <Meta parts={[<span key="date" className="num">{dateBR(row.entry_date)}</span>, row.account_name, row.payment_method_name]} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} />
        <AttachmentClip count={row.attachment_count} />
        {(row.external_ids ?? []).length > 0 && <OfxIds ids={row.external_ids ?? []} />}
      </div>
    </div>
    <EntryRowActions entryId={row.entry_id} filed={row.document_filed} />
  </EntryCard>;
});

export function SplitCards({ rows, filtered, order, sortHref }: { rows: SplitRow[]; filtered: boolean } & Sort) {
  const list = useRef<HTMLUListElement>(null);
  const { virtual, indexes, style, measure } = useVirtualCards(rows.map((row) => row.split_id), list);
  if (!rows.length) return <Empty>{filtered ? "Nenhum rateio corresponde aos filtros." : "Os rateios aparecerão depois do primeiro lançamento."}</Empty>;
  return <>
    <CardsBar order={order} sortHref={sortHref} />
    <ul ref={list} aria-label="Rateios, um por cartão" className="m-0 list-none p-0" style={style}>
      {indexes.map((index) => <SplitCard key={rows[index].split_id} row={rows[index]} index={index} total={virtual ? rows.length : undefined} measure={measure}
        continued={index > 0 && rows[index - 1].entry_id === rows[index].entry_id} />)}
    </ul>
  </>;
}

/** Um cartão de rateio (`continued`: rateio seguinte do mesmo lançamento, borda tracejada e sem as ações). */
const SplitCard = memo(function SplitCard({ row, index, total, measure, continued }: CardProps & { row: SplitRow; continued: boolean }) {
  return <EntryCard entryId={row.entry_id} data-entry-id={row.entry_id} ref={measure} data-index={index} {...position(index, total)}
    className={cn("flex items-start gap-2.5 px-3 py-2.5", index > 0 && "border-t", continued && "border-dashed")}>
    <div className="grid min-w-0 flex-1 gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0"><EntryLink entryId={row.entry_id} className="text-sm break-words">{row.entry_name}</EntryLink><ReviewMark entryId={row.entry_id} status={row.review_status} /></span>
        <span className={cardAmount(row.amount_cents)}>{money(row.amount_cents / 100)}</span>
      </div>
      <Meta parts={[<span key="date" className="num">{dateBR(row.entry_date)}</span>, row.account_name, row.payment_method_name]} />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <CategoryTag code={row.category_code} name={row.category_name} kind={row.category_kind} />
        {row.description && <span className="min-w-0 break-words">{row.description}</span>}
      </div>
      {row.associate_name && <p className="m-0 text-xs"><span className="text-muted-foreground">Associado:</span> {row.associate_name}</p>}
      {!continued && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} />
        <AttachmentClip count={row.attachment_count} />
        {(row.external_ids ?? []).length > 0 && <OfxIds ids={row.external_ids ?? []} />}
      </div>}
    </div>
    {!continued && <EntryRowActions entryId={row.entry_id} filed={row.document_filed} />}
  </EntryCard>;
});
