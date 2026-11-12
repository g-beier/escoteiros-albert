import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntryCard, EntryLink, EntryRow, EntryRowActions, FolderStatus, useEntrySelection } from "@/components/entries/entry-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { dateBR, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { IconArrowDown, IconArrowUp, IconPaperclip } from "@tabler/icons-react";
import type { SplitRow, LedgerRow } from "@/lib/entry-queries";
import type { SortOrder } from "@/lib/filters";
import { MultiFilter } from "@/components/entries/multi-filter";
import type { FilterKey } from "@/components/entries/filter-options";
import { OfxIds } from "@/components/entries/ofx-ids";

export type { SplitRow, LedgerRow };

const cell = "px-2.5 py-1 align-middle whitespace-nowrap";
/** Texto longo numa linha só, cortado com reticências; o texto inteiro fica no `title`. */
const clip = (max: string) => cn("block truncate", max);

function Clip({ text, max }: { text: string | null | undefined; max: string }) {
  return text ? <span className={clip(max)} title={text}>{text}</span> : <span className="text-muted-foreground">—</span>;
}
const headCell = "h-8 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const amountCell = (cents: number) => cn(cell, "text-right font-semibold num whitespace-nowrap", cents < 0 && "text-destructive");

const COLUMN_FILTERS: Record<string, FilterKey> = { "Conta": "conta", "Forma pgto": "forma", "Documentos": "pasta", "Nome do Associado": "associado", "Rubrica": "rubrica" };

type Sort = { order: SortOrder; sortHref: string };

function Head({ columns, order, sortHref, select, virtual }: { columns: { label: string; className?: string }[]; select?: React.ReactNode; virtual: boolean } & Sort) {
  return <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)] [&_tr]:border-b-0">
    <TableRow className="hover:bg-transparent" aria-rowindex={virtual ? 1 : undefined}>
      {select && <TableHead className="h-8 w-8 px-2.5">{select}</TableHead>}
      {columns.map((column) => column.label === "Data"
        ? <TableHead key={column.label} className={cn(headCell, column.className)} aria-sort={order === "desc" ? "descending" : "ascending"}>
            <Link href={sortHref} scroll={false} className="inline-flex items-center gap-1 hover:text-foreground" title={order === "desc" ? "Mostrar mais antigos primeiro" : "Mostrar mais recentes primeiro"}>
              Data {order === "desc" ? <IconArrowDown className="size-3.5" aria-hidden /> : <IconArrowUp className="size-3.5" aria-hidden />}
              <span className="sr-only">{order === "desc" ? ", mais recentes primeiro. Inverter ordem" : ", mais antigos primeiro. Inverter ordem"}</span>
            </Link>
          </TableHead>
        : <TableHead key={column.label} className={cn(headCell, column.className)}>
            {COLUMN_FILTERS[column.label]
              ? <span className={cn("inline-flex items-center gap-0.5", column.className?.includes("text-right") && "flex-row-reverse")}>{column.label}<MultiFilter filterKey={COLUMN_FILTERS[column.label]} variant="icon" /></span>
              : column.label}
          </TableHead>)}
      <TableHead className="h-8 w-10 px-1"><span className="sr-only">Ações</span></TableHead>
    </TableRow>
  </TableHeader>;
}

/** Rubrica com código e cor do tipo, como na planilha: verde receita, vermelho despesa. */
function CategoryTag({ code, name, kind }: { code: string | null; name: string; kind: "receita" | "despesa" | null }) {
  return <span className={cn("inline-flex max-w-full items-center md:max-w-72 gap-1 truncate rounded px-1.5 py-0.5 font-medium",
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

/** Marca todos os lançamentos já carregados (ou desmarca). */
function SelectAll({ rows }: { rows: LedgerRow[] }) {
  const { selected, setSelected } = useEntrySelection();
  const count = rows.filter((row) => selected.has(row.entry_id)).length;
  return <Checkbox aria-label="Selecionar todos os lançamentos carregados" checked={count > 0 && count === rows.length} indeterminate={count > 0 && count < rows.length}
    onCheckedChange={(on) => setSelected(rows.map((row) => [row.entry_id, { accountName: row.account_name, reconciled: Boolean(row.reconciled) }]), on)} />;
}

function SelectRow({ row }: { row: LedgerRow }) {
  const { selected, setSelected } = useEntrySelection();
  return <Checkbox aria-label={`Selecionar ${row.name}`} checked={selected.has(row.entry_id)}
    onCheckedChange={(on) => setSelected([[row.entry_id, { accountName: row.account_name, reconciled: Boolean(row.reconciled) }]], on)} />;
}


/** A partir de quantas linhas carregadas a tabela passa a montar só as que estão perto da tela. */
export const VIRTUALIZE_FROM = 300;
/** Altura do cabeçalho fixo (h-8): as linhas começam abaixo dele dentro da área que rola. */
const HEAD_HEIGHT = 32;

/**
 * Virtualização das linhas da planilha (desktop). Abaixo de VIRTUALIZE_FROM todas as linhas são
 * montadas (como antes; o HTML do servidor traz a primeira página inteira), mas já medidas, para que a
 * troca não faça a lista pular. Acima, só as linhas visíveis (mais uma margem) ficam no DOM, entre
 * duas linhas espaçadoras; aria-rowcount/aria-rowindex mantêm a posição para leitores de tela.
 */
function useVirtualRows(keys: string[], scroller: React.RefObject<HTMLElement | null>) {
  // o app não usa o React Compiler; o aviso só diz que este hook não seria memoizado por ele
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, HTMLTableRowElement>({
    count: keys.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 33,
    getItemKey: (index) => keys[index],
    scrollMargin: HEAD_HEIGHT,
    overscan: 15,
    useFlushSync: false,
  });
  const virtual = keys.length >= VIRTUALIZE_FROM;
  if (!virtual) return { virtual, indexes: keys.map((_, index) => index), top: 0, bottom: 0, measure: virtualizer.measureElement };
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

export function LedgerTable({ rows, filtered, order, sortHref, scroller }: { rows: LedgerRow[]; filtered: boolean } & Sort & Scroller) {
  const { canEdit } = useEntrySelection();
  const { virtual, indexes, top, bottom, measure } = useVirtualRows(rows.map((row) => row.entry_id), scroller);
  if (!rows.length) return <Empty>{filtered ? "Nenhum lançamento corresponde aos filtros." : "Nenhum lançamento ainda. Comece pelo botão “Novo lançamento”."}</Empty>;
  const columns = canEdit ? 9 : 8;
  return <Table className="min-w-[980px]" containerClassName="overflow-visible" aria-rowcount={virtual ? rows.length + 1 : undefined}>
    <TableCaption className="sr-only">Um lançamento por linha. Selecione uma linha para ver os detalhes e o rateio.</TableCaption>
    <Head columns={[{ label: "Data", className: "w-28" }, { label: "Histórico" }, { label: "Conta", className: "w-40" }, { label: "Forma pgto", className: "w-40" }, { label: "Documentos", className: "w-48" }, { label: "ID OFX", className: "w-36" }, { label: "Valor", className: "w-32 text-right" }]} order={order} sortHref={sortHref} select={canEdit ? <SelectAll rows={rows} /> : undefined} virtual={virtual} />
    <TableBody>
      <Spacer height={top} columns={columns} />
      {indexes.map((index) => {
        const row = rows[index];
        return <EntryRow key={row.entry_id} entryId={row.entry_id} ref={measure} data-index={index} aria-rowindex={virtual ? index + 2 : undefined} className={cn(stripe(index))}>
          {canEdit && <TableCell className="px-2.5 py-1 align-middle" onClick={(event) => event.stopPropagation()}><SelectRow row={row} /></TableCell>}
          <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
          <TableCell className={cell} title={row.name}><EntryLink entryId={row.entry_id} className={clip("max-w-96")}>{row.name}</EntryLink></TableCell>
          <TableCell className={cell}><Clip text={row.account_name} max="max-w-44" /></TableCell>
          <TableCell className={cell}><Clip text={row.payment_method_name} max="max-w-40" /></TableCell>
          <TableCell className={cell}><span className="inline-flex items-center gap-1.5"><FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} /><AttachmentClip count={row.attachment_count} /></span></TableCell>
          <TableCell className={cell}><OfxIds ids={row.external_ids ?? []} /></TableCell>
          <TableCell className={amountCell(row.total_cents)}>{money(row.total_cents / 100)}</TableCell>
          <TableCell className="px-1 py-0.5 align-middle"><EntryRowActions entryId={row.entry_id} filed={row.document_filed} /></TableCell>
        </EntryRow>;
      })}
      <Spacer height={bottom} columns={columns} />
    </TableBody>
  </Table>;
}

export function SplitTable({ rows, filtered, order, sortHref, scroller }: { rows: SplitRow[]; filtered: boolean } & Sort & Scroller) {
  const { virtual, indexes, top, bottom, measure } = useVirtualRows(rows.map((row) => row.split_id), scroller);
  if (!rows.length) return <Empty>{filtered ? "Nenhum rateio corresponde aos filtros." : "Os rateios aparecerão depois do primeiro lançamento."}</Empty>;
  const columns = 11;
  return <Table className="min-w-[1220px]" containerClassName="overflow-visible" aria-rowcount={virtual ? rows.length + 1 : undefined}>
    <TableCaption className="sr-only">Um rateio por linha, repetindo os dados do lançamento de origem. Selecione uma linha para ver o lançamento.</TableCaption>
    <Head columns={[{ label: "Data", className: "w-24" }, { label: "Histórico" }, { label: "Conta" }, { label: "Forma pgto" }, { label: "Documentos" }, { label: "ID OFX" }, { label: "Valor", className: "text-right" }, { label: "Nome do Associado" }, { label: "Descrição" }, { label: "Rubrica" }]} order={order} sortHref={sortHref} virtual={virtual} />
    <TableBody>
      <Spacer height={top} columns={columns} />
      {indexes.map((index) => {
        const row = rows[index];
        const continued = index > 0 && rows[index - 1].entry_id === row.entry_id;
        return <EntryRow key={row.split_id} entryId={row.entry_id} data-entry-id={row.entry_id} ref={measure} data-index={index} aria-rowindex={virtual ? index + 2 : undefined}
          className={cn(stripe(index))}>
          <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
          <TableCell className={cell} title={row.entry_name}><EntryLink entryId={row.entry_id} className={cn("font-medium", clip("max-w-52"))}>{row.entry_name}</EntryLink></TableCell>
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
      })}
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

export function LedgerCards({ rows, filtered, order, sortHref }: { rows: LedgerRow[]; filtered: boolean } & Sort) {
  const { canEdit } = useEntrySelection();
  if (!rows.length) return <Empty>{filtered ? "Nenhum lançamento corresponde aos filtros." : "Nenhum lançamento ainda. Comece pelo botão “Novo lançamento”."}</Empty>;
  return <>
    <CardsBar order={order} sortHref={sortHref} select={canEdit ? <SelectAll rows={rows} /> : undefined} />
    <ul aria-label="Lançamentos, um por cartão" className="m-0 list-none p-0">{rows.map((row) => <EntryCard key={row.entry_id} entryId={row.entry_id} className="flex items-start gap-2.5 border-b px-3 py-2.5 even:bg-muted/40">
      {canEdit && <span className="pt-0.5"><SelectRow row={row} /></span>}
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <EntryLink entryId={row.entry_id} className="min-w-0 text-sm break-words">{row.name}</EntryLink>
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
    </EntryCard>)}</ul>
  </>;
}

export function SplitCards({ rows, filtered, order, sortHref }: { rows: SplitRow[]; filtered: boolean } & Sort) {
  if (!rows.length) return <Empty>{filtered ? "Nenhum rateio corresponde aos filtros." : "Os rateios aparecerão depois do primeiro lançamento."}</Empty>;
  return <>
    <CardsBar order={order} sortHref={sortHref} />
    <ul aria-label="Rateios, um por cartão" className="m-0 list-none p-0">{rows.map((row, index) => {
      const continued = index > 0 && rows[index - 1].entry_id === row.entry_id;
      return <EntryCard key={row.split_id} entryId={row.entry_id} data-entry-id={row.entry_id} className={cn("flex items-start gap-2.5 border-t px-3 py-2.5 first:border-t-0", continued && "border-dashed")}>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <EntryLink entryId={row.entry_id} className="min-w-0 text-sm break-words">{row.entry_name}</EntryLink>
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
    })}</ul>
  </>;
}
