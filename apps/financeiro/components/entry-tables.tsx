import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EntryLink, EntryRow, EntryRowActions, FolderStatus } from "@/components/entries/entry-editor";
import { dateBR, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import type { SplitRow, StatementRow } from "@/lib/entry-queries";
import type { SortOrder } from "@/lib/filters";
import { MultiFilter } from "@/components/entries/multi-filter";
import type { FilterKey } from "@/components/entries/filter-options";

export type { SplitRow, StatementRow };

const cell = "px-2.5 py-1 align-middle whitespace-nowrap";
const wrapCell = "px-2.5 py-1 align-middle whitespace-normal min-w-48";
const headCell = "h-8 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const amountCell = (cents: number) => cn(cell, "text-right font-semibold num whitespace-nowrap", cents < 0 && "text-destructive");

const COLUMN_FILTERS: Record<string, FilterKey> = { "Forma pgto": "forma", "Documentos": "pasta", "Nome do Associado": "associado", "Rubrica": "rubrica" };

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

const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-6 py-12 text-center text-muted-foreground">{children}</div>;

export function StatementTable({ rows, filtered, order, sortHref }: { rows: StatementRow[]; filtered: boolean } & Sort) {
  if (!rows.length) return <Empty>{filtered ? "Nenhum lançamento corresponde aos filtros." : "Nenhum lançamento ainda. Comece pelo botão “Novo lançamento”."}</Empty>;
  return <Table className="min-w-[720px]" containerClassName="overflow-visible">
    <TableCaption className="sr-only">Linhas do extrato. Selecione uma linha para ver os detalhes e o rateio.</TableCaption>
    <Head columns={[{ label: "Data", className: "w-28" }, { label: "Nome do lançamento" }, { label: "Forma pgto", className: "w-40" }, { label: "Documentos", className: "w-48" }, { label: "Valor", className: "w-32 text-right" }]} order={order} sortHref={sortHref} />
    <TableBody>{rows.map((row) => <EntryRow key={row.entry_id} entryId={row.entry_id}>
      <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
      <TableCell className={wrapCell}><EntryLink entryId={row.entry_id}>{row.name}</EntryLink></TableCell>
      <TableCell className={cell}>{row.payment_method_name}</TableCell>
      <TableCell className={cell}><FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} /></TableCell>
      <TableCell className={amountCell(row.total_cents)}>{money(row.total_cents / 100)}</TableCell>
      <TableCell className="px-1 py-0.5 align-middle"><EntryRowActions entryId={row.entry_id} filed={row.document_filed} /></TableCell>
    </EntryRow>)}</TableBody>
  </Table>;
}

export function SplitTable({ rows, filtered, order, sortHref }: { rows: SplitRow[]; filtered: boolean } & Sort) {
  if (!rows.length) return <Empty>{filtered ? "Nenhum rateio corresponde aos filtros." : "Os rateios aparecerão depois do primeiro lançamento."}</Empty>;
  return <Table className="min-w-[1080px]" containerClassName="overflow-visible">
    <TableCaption className="sr-only">Um rateio por linha, repetindo os dados da linha do extrato de origem. Selecione uma linha para ver o lançamento.</TableCaption>
    <Head columns={[{ label: "Data", className: "w-24" }, { label: "Lançamento" }, { label: "Forma pgto" }, { label: "Documentos" }, { label: "Valor", className: "text-right" }, { label: "Nome do Associado" }, { label: "Descrição" }, { label: "Rubrica" }]} order={order} sortHref={sortHref} />
    <TableBody>{rows.map((row, index) => {
      const continued = index > 0 && rows[index - 1].entry_id === row.entry_id;
      return <EntryRow key={row.split_id} entryId={row.entry_id} data-entry-id={row.entry_id} className={cn(continued && "[&_td]:border-t [&_td]:border-dashed")}>
        <TableCell className={cn(cell, "whitespace-nowrap num")}>{dateBR(row.entry_date)}</TableCell>
        <TableCell className={wrapCell}><EntryLink entryId={row.entry_id} className="font-medium">{row.entry_name}</EntryLink></TableCell>
        <TableCell className={cell}>{row.payment_method_name}</TableCell>
        <TableCell className={cell}><FolderStatus entryId={row.entry_id} filed={row.document_filed} document={row.document} /></TableCell>
        <TableCell className={amountCell(row.amount_cents)}>{money(row.amount_cents / 100)}</TableCell>
        <TableCell className={cell}>{row.associate_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className={wrapCell}>{row.description}</TableCell>
        <TableCell className={cell}><CategoryTag code={row.category_code} name={row.category_name} kind={row.category_kind} /></TableCell>
        <TableCell className="px-1 py-0.5 align-middle">{!continued && <EntryRowActions entryId={row.entry_id} filed={row.document_filed} />}</TableCell>
      </EntryRow>;
    })}</TableBody>
  </Table>;
}
