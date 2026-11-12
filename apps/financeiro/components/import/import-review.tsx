"use client";

import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateBR, money } from "@/lib/format";
import type { ParsedStatement } from "@/lib/statement-import";
import type { PreviewLine } from "@/lib/import-schema";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const MAX_ROWS = 1000;
const brl = (cents: number) => money(cents / 100);

/** Conferência antes de gravar: totais, saldos, linhas normalizadas, erros e linhas ignoradas. */
const STATUS_LABEL = { nova: "Nova", importada: "Já importada", suspeita: "Suspeita" } as const;

/** `statuses[i]` é a situação da linha i na pré-conferência; suspeitas têm caixa para incluir. */
export function ImportReview({ statement, statuses, includedSuspects, onToggleSuspect }: {
  statement: ParsedStatement;
  statuses?: PreviewLine[];
  includedSuspects?: Set<number>;
  onToggleSuspect?: (index: number) => void;
}) {
  const { lines, errors, ignored, totals, balanceCheck } = statement;
  const mismatchRow = balanceCheck?.ok === false ? balanceCheck.firstMismatchRow : undefined;
  const hasBalance = lines.some((line) => line.balanceCents !== undefined);
  const hasId = lines.some((line) => line.externalId);
  const hasType = lines.some((line) => line.trnType);

  return <div className="grid gap-4">
    <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Stat label="Linhas" value={String(lines.length)} />
      <Stat label="Período" value={statement.periodFrom && statement.periodTo ? `${dateBR(statement.periodFrom)} a ${dateBR(statement.periodTo)}` : "—"} />
      <Stat label="Entradas" value={brl(totals.creditsCents)} tone="text-success" />
      <Stat label="Saídas" value={brl(totals.debitsCents)} tone="text-destructive" />
      <Stat label="Líquido" value={brl(totals.netCents)} />
    </dl>

    <BalanceStatus statement={statement} mismatchRow={mismatchRow} />

    {errors.length > 0 && <details open className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-semibold text-destructive">Linhas que não puderam ser lidas ({errors.length}) — não serão importadas</summary>
      <ul className="m-0 mt-2 grid gap-1 pl-4">{errors.map((error, i) => <li key={i}><span className="num">Linha {error.sourceRow}:</span> {error.message}</li>)}</ul>
    </details>}

    {ignored.length > 0 && <details className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-semibold">Linhas ignoradas ({ignored.length})</summary>
      <ul className="m-0 mt-2 grid gap-1 pl-4">{ignored.map((row, i) => <li key={i}><span className="num">Linha {row.sourceRow}:</span> {row.reason}</li>)}</ul>
    </details>}

    {lines.length > 0 && <Table containerClassName="max-h-[28rem] overflow-y-auto rounded-md border" className="min-w-0">
      <TableCaption className="sr-only">Linhas que serão importadas</TableCaption>
      <TableHeader className="sticky top-0 z-10 bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className="h-8 px-2 text-right">Linha</TableHead>
        {statuses && <TableHead className="h-8 px-2">Situação</TableHead>}
        <TableHead className="h-8 px-2">Data</TableHead>
        <TableHead className="h-8 px-2">Tipo</TableHead>
        {hasType && <TableHead className="h-8 px-2">TRNTYPE</TableHead>}
        <TableHead className="h-8 px-2">Contraparte</TableHead>
        <TableHead className="h-8 px-2">Descrição</TableHead>
        <TableHead className="h-8 px-2 text-right">Valor</TableHead>
        {hasBalance && <TableHead className="h-8 px-2 text-right">Saldo</TableHead>}
        {hasId && <TableHead className="h-8 px-2">ID OFX</TableHead>}
      </TableRow></TableHeader>
      <TableBody>{lines.slice(0, MAX_ROWS).map((line, index) => {
        const preview = statuses?.[index];
        const skipped = preview?.status === "importada" || (preview?.status === "suspeita" && !includedSuspects?.has(index));
        return <TableRow key={line.sourceRow} id={`linha-${line.sourceRow}`}
        className={cn(line.sourceRow === mismatchRow && "bg-destructive/10 hover:bg-destructive/15", skipped && "text-muted-foreground line-through decoration-muted-foreground/40")}>
        <TableCell className="px-2 py-1 text-right text-muted-foreground num">{line.sourceRow}</TableCell>
        {statuses && <TableCell className="px-2 py-1 whitespace-nowrap no-underline" title={preview?.matchDescription ? `Já existe: ${preview.matchDescription}` : undefined}>
          {preview?.status === "suspeita"
            ? <label className="inline-flex items-center gap-1.5 text-destructive"><Checkbox checked={includedSuspects?.has(index) ?? false} onCheckedChange={() => onToggleSuspect?.(index)} aria-label={`Importar mesmo assim a linha ${line.sourceRow}`} />Suspeita</label>
            : preview ? STATUS_LABEL[preview.status] : "…"}
        </TableCell>}
        <TableCell className="px-2 py-1 num">{dateBR(line.date)}</TableCell>
        <TableCell className="max-w-40 truncate px-2 py-1" title={line.kind}>{line.kind}</TableCell>
        {hasType && <TableCell className="px-2 py-1 text-muted-foreground">{line.trnType}</TableCell>}
        <TableCell className="max-w-48 truncate px-2 py-1" title={line.counterparty}>{line.counterparty}</TableCell>
        <TableCell className="max-w-72 truncate px-2 py-1 text-muted-foreground" title={line.description}>{line.description}</TableCell>
        <TableCell className={cn("px-2 py-1 text-right font-medium num", line.amountCents < 0 ? "text-destructive" : "text-success")}>{brl(line.amountCents)}</TableCell>
        {hasBalance && <TableCell className="px-2 py-1 text-right num">{line.balanceCents === undefined ? "" : brl(line.balanceCents)}</TableCell>}
        {hasId && <TableCell className="max-w-40 truncate px-2 py-1 text-muted-foreground num" title={line.externalId}>{line.externalId}</TableCell>}
      </TableRow>;
      })}</TableBody>
    </Table>}
    {lines.length > MAX_ROWS && <p className="m-0 text-xs text-muted-foreground">Mostrando {MAX_ROWS} de {lines.length} linhas; todas serão importadas.</p>}
  </div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-md border px-3 py-2">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className={cn("m-0 text-sm font-semibold num", tone)}>{value}</dd>
  </div>;
}

function BalanceStatus({ statement, mismatchRow }: { statement: ParsedStatement; mismatchRow?: number }) {
  const { balanceCheck, openingBalanceCents, closingBalanceCents } = statement;
  const balances = [
    openingBalanceCents !== undefined && `saldo inicial ${brl(openingBalanceCents)}`,
    closingBalanceCents !== undefined && `saldo final ${brl(closingBalanceCents)}`,
  ].filter(Boolean).join(" · ");
  if (!balanceCheck) {
    return <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground"><IconInfoCircle className="size-4 shrink-0" />
      Sem saldos suficientes no arquivo para conferir a sequência{balances ? ` (${balances})` : ""}.</p>;
  }
  if (balanceCheck.ok) {
    return <p className="m-0 flex items-center gap-2 text-xs text-success"><IconCircleCheck className="size-4 shrink-0" />
      Saldos conferem{balances ? `: ${balances}` : ""}.</p>;
  }
  return <p role="alert" className="m-0 flex items-center gap-2 text-xs text-destructive"><IconAlertTriangle className="size-4 shrink-0" />
    <span>Os saldos não fecham{mismatchRow !== undefined
      ? <> a partir da <a href={`#linha-${mismatchRow}`} className="font-semibold underline num">linha {mismatchRow}</a> do arquivo</>
      : <> com o total dos movimentos</>}{balances ? ` (${balances})` : ""}. Confira as linhas ignoradas nos ajustes de leitura.</span></p>;
}
