import { Link } from "@geas/ui/components/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AppHeader } from "@/components/finance/app-header";
import { PageBody, PageHeader } from "@/components/finance/nav/page-header";
import { EntryForm } from "@/components/finance/entries/entry-form";
import { listHref } from "@/lib/finance/entries";
import * as attachmentsData from "@/lib/server/finance/attachments";
import {
  fetchEntry,
  history as entryHistory,
  linkedStatementLines,
  type LinkedLine,
} from "@/lib/server/finance/entries";
import { dateBR, money } from "@/lib/format";
import { loadEntryContext } from "../context";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { EntryAttachments } from "@/components/finance/entries/entry-attachments";
import { ReviewEntryNotice } from "@/components/finance/entries/review-entry";
import { ATTACHMENTS_ENABLED } from "@/lib/features";
import { describeHistory, type HistoryItem, type HistoryNames } from "@/lib/finance/entry-history";
import type { Catalogs } from "@/components/finance/entries/entry-form";

/** Linhas do extrato (OFX) vinculadas: o "fato" do banco por trás deste lançamento. */
function StatementLines({ lines }: { lines: LinkedLine[] }) {
  const unique = [...new Map(lines.map((line) => [line.statement_line_id, line])).values()];
  return (
    <SectionCard aria-labelledby="statement-lines-title">
      <SectionHeader
        title="Extrato"
        titleId="statement-lines-title"
        description="Movimentação do banco conciliada com este lançamento. O ID OFX junta os rateios à movimentação."
      />
      <Table>
        <TableCaption className="sr-only">Linhas do extrato vinculadas</TableCaption>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 px-3">Data</TableHead>
            <TableHead className="h-8 px-3">Histórico do banco</TableHead>
            <TableHead className="h-8 px-3">Tipo</TableHead>
            <TableHead className="h-8 px-3">ID OFX</TableHead>
            <TableHead className="h-8 px-3 text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {unique.map((line) => (
            <TableRow key={line.statement_line_id}>
              <TableCell className="px-3 py-1.5 num">{dateBR(line.line_date)}</TableCell>
              <TableCell className="px-3 py-1.5 whitespace-normal">
                {line.line_counterparty ?? line.line_description}
                {line.line_counterparty && <div className="text-xs text-muted-foreground">{line.line_description}</div>}
              </TableCell>
              <TableCell className="px-3 py-1.5">
                {[line.line_kind, line.line_trn_type].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="px-3 py-1.5 num text-xs">
                {line.line_external_id ? (
                  <Link
                    href={`/financeiro/lancamentos/movimentacoes?${new URLSearchParams({ de: "tudo", ofx: line.line_external_id })}`}
                    className="text-primary hover:underline"
                    title="Todos os lançamentos desta movimentação"
                  >
                    {line.line_external_id}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell
                className={`px-3 py-1.5 text-right num font-semibold ${line.line_amount_cents < 0 ? "text-destructive" : ""}`}
              >
                {money(line.line_amount_cents / 100)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function historyNames(catalogs: Catalogs): HistoryNames {
  const byId = (items: { id: string; name: string }[]) => new Map(items.map((item) => [item.id, item.name]));
  return {
    accounts: byId(catalogs.accounts),
    paymentMethods: byId(catalogs.paymentMethods),
    categories: new Map(
      catalogs.categories.map((category) => [
        category.id,
        category.code ? `${category.code} ${category.name}` : category.name,
      ]),
    ),
    associates: byId(catalogs.associates),
  };
}

/** Auditoria do lançamento e dos rateios: quem, quando e o que mudou (mais recente primeiro). */
function History({ items }: { items: HistoryItem[] }) {
  return (
    <SectionCard aria-labelledby="history-title">
      <SectionHeader
        title="Histórico de alterações"
        titleId="history-title"
        description="Registro de auditoria deste lançamento, dos rateios e da conciliação."
      />
      {items.length === 0 ? (
        <p className="m-0 px-5 py-4 text-sm text-muted-foreground">
          Nenhum registro de auditoria para este lançamento.
        </p>
      ) : (
        <ol className="m-0 list-none divide-y p-0">
          {items.map((item) => (
            <li key={item.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">{item.title}</span>
                <span className="text-xs text-muted-foreground">
                  <time dateTime={item.at} className="num">
                    {dateTime.format(new Date(item.at))}
                  </time>{" "}
                  · {item.actor}
                </span>
              </div>
              {item.changes.length > 0 && (
                <dl className="m-0 mt-1 grid grid-cols-[minmax(8rem,max-content)_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {item.changes.map((change, index) => (
                    <div key={index} className="contents">
                      <dt className="text-muted-foreground">{change.label}</dt>
                      <dd className="m-0 break-words">
                        {change.before !== undefined && (
                          <span className={change.after !== undefined ? "text-muted-foreground line-through" : ""}>
                            {change.before}
                          </span>
                        )}
                        {change.before !== undefined && change.after !== undefined && (
                          <span aria-label="passou a ser"> → </span>
                        )}
                        {change.after !== undefined && <span>{change.after}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

export const metadata = { title: "Lançamento · GEAS Financeiro" };

export default async function EntryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ voltar?: string }>;
}) {
  const [{ id }, { voltar }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const { member, db, canEdit, catalogs } = await loadEntryContext();
  const [entry, statementLines, attachments, auditRows] = await Promise.all([
    fetchEntry(db, id),
    linkedStatementLines(db, id),
    ATTACHMENTS_ENABLED ? attachmentsData.listForEntry(db, id) : Promise.resolve([]),
    entryHistory(db, id),
  ]);
  if (!entry) notFound();
  const backHref = listHref(voltar);
  const history = describeHistory(auditRows, historyNames(catalogs));
  const edited = entry.updatedAt.slice(0, 19) !== entry.createdAt.slice(0, 19);

  return (
    <div className="shell">
      <AppHeader member={member} current={`/financeiro/lancamentos/${id}`} />
      <PageBody>
        <PageHeader
          title={entry.name}
          crumbs={[{ label: "Lançamentos", href: backHref }, { label: entry.name }]}
          description={
            <>
              <span className="num">{dateBR(entry.date)}</span> ·{" "}
              <span
                className={
                  entry.totalCents < 0 ? "num font-semibold text-destructive" : "num font-semibold text-foreground"
                }
              >
                {money(entry.totalCents / 100)}
              </span>
              {" · "}
              {entry.splits.length} {entry.splits.length === 1 ? "rubrica" : "rubricas"}
              {" · "}criado em {dateTime.format(new Date(entry.createdAt))}
              {edited && <> · alterado em {dateTime.format(new Date(entry.updatedAt))}</>}
              {!canEdit && " · somente consulta"}
            </>
          }
        />
        {entry.toReview && <ReviewEntryNotice entryId={id} canEdit={member.finance.canReview} />}
        {statementLines.length > 0 && <StatementLines lines={statementLines} />}
        <SectionCard className="p-5">
          <EntryForm entry={entry} catalogs={catalogs} canEdit={canEdit} backHref={backHref} />
        </SectionCard>
        {ATTACHMENTS_ENABLED && <EntryAttachments entryId={id} attachments={attachments} canEdit={canEdit} />}
        <History items={history} />
      </PageBody>
    </div>
  );
}
