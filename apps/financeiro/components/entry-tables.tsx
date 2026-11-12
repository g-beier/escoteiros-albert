import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntryLink, EntryRow, EntryRowActions, FolderStatus } from "@/components/entries/entry-editor";
import { dateBR, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { IconArrowDown, IconArrowUp, IconCircleCheck, IconPaperclip } from "@tabler/icons-react";
import type { SplitRow, LedgerRow } from "@/lib/entry-queries";
import type { SortOrder } from "@/lib/filters";
import { MultiFilter } from "@/components/entries/multi-filter";
import type { FilterKey } from "@/components/entries/filter-options";
import { OfxIds } from "@/components/entries/ofx-ids";

export type { SplitRow, LedgerRow };

const cell = "px-2.5 py-1 align-middle whitespace-nowrap";
const wrapCell = "px-2.5 py-1 align-middle whitespace-normal min-w-48";
const headCell = "h-8 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const amountCell = (cents: number) => cn(cell, "text-right font-semibold num whitespace-nowrap", cents < 0 && "text-destructive");

const COLUMN_FILTERS: Record<string, FilterKey> = { "Conta": "conta", "Forma pgto": "forma", "Documentos": "pasta", "Nome do Associado": "associado", "Rubrica": "rubrica" };

type Sort = { order: SortOrder; sortHref: string };

function Head({ columns, order, sortHref }: { columns: { label: string; className?: string }[] } & Sort) {
  return <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_var(--border)] [&_tr]:border-b-0">
    <TableRow className="hover:bg-transparent">
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
  return <span className={cn("inline-flex max-w-72 items-center gap-1 truncate rounded px-1.5 py-0.5 font-medium",
    kind === "receita" ? "bg-success-soft text-success" : kind === "despesa" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")} title={code ? `${code} ${name}` : name}>
    {code && <span className="num opacity-80">{code}</span>}{name}
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

export function LedgerTable({ rows, filtered, order, sortHref }: { rows: LedgerRow[]; filtered: boolean } & Sort) {
  if (!rows.length) return <Empty>{filtered ? "Nenhum lançamento corresponde aos filtros." : "Nenhum lançamento ainda. Comece pelo botão “Novo lançamento”."}</Empty>;
  return <Table className="min-w-[980px]" containerClassName="overflow-visible">
    <TableCaption className="sr-only">Um lançamento por linha. Selecione uma linha para ver os detalhes e o rateio.</TableCaption>
    <Head columns={[{ label: "Data", className: "w-28" }, { label: "Histórico" }, { label: "Conta", className: "w-40" }, { label: "Forma pgto", className: "w-40" }, { label: "Documentos", className: "w-48" }, { label: "ID OFX", className: "w-36" }, { label: "Valor", className: "w-32 text-right" }]} order={order} sortHref={sortHref} />
    <TableBody>{rows.map((row) => <EntryRow key={row.entry_id} entryId={row.entry_id}>
      <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
      <TableCell className={wrapCell}><EntryLink entryId={row.entry_id}>{row.name}</EntryLink></TableCell>
      <TableCell className={cell}>{row.account_name}</TableCell>
      <TableCell className={cell}>{row.payment_method_name}</TableCell>
      <TableCell className={cell}><span className="inline-flex items-center gap-1.5"><FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} /><AttachmentClip count={row.attachment_count} /></span></TableCell>
      <TableCell className={cell}><OfxIds ids={row.external_ids ?? []} /></TableCell>
      <TableCell className={amountCell(row.total_cents)}>{row.reconciled && <IconCircleCheck className="mr-1 inline size-3.5 align-[-2px] text-success" aria-label="Conciliado com o extrato" title="Conciliado com o extrato" />}{money(row.total_cents / 100)}</TableCell>
      <TableCell className="px-1 py-0.5 align-middle"><EntryRowActions entryId={row.entry_id} filed={row.document_filed} /></TableCell>
    </EntryRow>)}</TableBody>
  </Table>;
}

export function SplitTable({ rows, filtered, order, sortHref }: { rows: SplitRow[]; filtered: boolean } & Sort) {
  if (!rows.length) return <Empty>{filtered ? "Nenhum rateio corresponde aos filtros." : "Os rateios aparecerão depois do primeiro lançamento."}</Empty>;
  return <Table className="min-w-[1320px]" containerClassName="overflow-visible">
    <TableCaption className="sr-only">Um rateio por linha, repetindo os dados do lançamento de origem. Selecione uma linha para ver o lançamento.</TableCaption>
    <Head columns={[{ label: "Data", className: "w-24" }, { label: "Histórico" }, { label: "Conta" }, { label: "Forma pgto" }, { label: "Documentos" }, { label: "ID OFX" }, { label: "Valor", className: "text-right" }, { label: "Nome do Associado" }, { label: "Descrição" }, { label: "Rubrica" }]} order={order} sortHref={sortHref} />
    <TableBody>{rows.map((row, index) => {
      const continued = index > 0 && rows[index - 1].entry_id === row.entry_id;
      return <EntryRow key={row.split_id} entryId={row.entry_id} data-entry-id={row.entry_id} className={cn(continued && "[&_td]:border-t [&_td]:border-dashed")}>
        <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
        <TableCell className={wrapCell}><EntryLink entryId={row.entry_id} className="font-medium">{row.entry_name}</EntryLink></TableCell>
        <TableCell className={cell}>{row.account_name}</TableCell>
        <TableCell className={cell}>{row.payment_method_name}</TableCell>
        <TableCell className={cell}><span className="inline-flex items-center gap-1.5"><FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} />{!continued && <AttachmentClip count={row.attachment_count} />}</span></TableCell>
        <TableCell className={cell}>{!continued && <OfxIds ids={row.external_ids ?? []} />}</TableCell>
        <TableCell className={amountCell(row.amount_cents)}>{money(row.amount_cents / 100)}</TableCell>
        <TableCell className={cell}>{row.associate_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className={wrapCell}>{row.description}</TableCell>
        <TableCell className={cell}><CategoryTag code={row.category_code} name={row.category_name} kind={row.category_kind} /></TableCell>
        <TableCell className="px-1 py-0.5 align-middle">{!continued && <EntryRowActions entryId={row.entry_id} filed={row.document_filed} />}</TableCell>
      </EntryRow>;
    })}</TableBody>
  </Table>;
}
