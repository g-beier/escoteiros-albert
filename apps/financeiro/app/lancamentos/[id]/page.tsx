import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { EntryForm } from "@/components/entries/entry-form";
import { fetchEntry, listHref } from "@/lib/entries";
import { dateBR, money } from "@/lib/format";
import { loadEntryContext } from "../context";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionCard, SectionHeader } from "@/components/section-card";

type LinkedLine = {
  statement_line_id: string; line_date: string; line_description: string; line_kind: string | null; line_counterparty: string | null;
  line_amount_cents: number; line_external_id: string | null; line_trn_type: string | null;
};

/** Linhas do extrato (OFX) vinculadas: o "fato" do banco por trás deste lançamento. */
function StatementLines({ lines }: { lines: LinkedLine[] }) {
  const unique = [...new Map(lines.map((line) => [line.statement_line_id, line])).values()];
  return <SectionCard className="mb-4" aria-labelledby="statement-lines-title">
    <SectionHeader title="Extrato" titleId="statement-lines-title" description="Movimentação do banco conciliada com este lançamento. O ID OFX junta os rateios à movimentação." />
    <Table>
      <TableCaption className="sr-only">Linhas do extrato vinculadas</TableCaption>
      <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className="h-8 px-3">Data</TableHead><TableHead className="h-8 px-3">Histórico do banco</TableHead>
        <TableHead className="h-8 px-3">Tipo</TableHead><TableHead className="h-8 px-3">ID OFX</TableHead><TableHead className="h-8 px-3 text-right">Valor</TableHead>
      </TableRow></TableHeader>
      <TableBody>{unique.map((line) => <TableRow key={line.statement_line_id}>
        <TableCell className="px-3 py-1.5 num">{dateBR(line.line_date)}</TableCell>
        <TableCell className="px-3 py-1.5 whitespace-normal">{line.line_counterparty ?? line.line_description}{line.line_counterparty && <div className="text-xs text-muted-foreground">{line.line_description}</div>}</TableCell>
        <TableCell className="px-3 py-1.5">{[line.line_kind, line.line_trn_type].filter(Boolean).join(" · ") || "—"}</TableCell>
        <TableCell className="px-3 py-1.5 num text-xs">{line.line_external_id
          ? <Link href={`/lancamentos?${new URLSearchParams({ de: "tudo", ofx: line.line_external_id })}`} className="text-primary hover:underline" title="Todos os lançamentos desta movimentação">{line.line_external_id}</Link>
          : "—"}</TableCell>
        <TableCell className={`px-3 py-1.5 text-right num font-semibold ${line.line_amount_cents < 0 ? "text-destructive" : ""}`}>{money(line.line_amount_cents / 100)}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </SectionCard>;
}

export const metadata = { title: "Lançamento · GEAS Financeiro" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function EntryDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string }> }) {
  const [{ id }, { voltar }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user, role, canEdit, catalogs } = await loadEntryContext();
  const [entry, { data: statementLines }] = await Promise.all([
    fetchEntry(supabase, id),
    supabase.from("reconciliation_link_rows")
      .select("statement_line_id, line_date, line_description, line_kind, line_counterparty, line_amount_cents, line_external_id, line_trn_type")
      .eq("ledger_entry_id", id).order("line_date"),
  ]);
  if (!entry) notFound();
  const backHref = listHref(voltar);
  const edited = entry.updatedAt.slice(0, 19) !== entry.createdAt.slice(0, 19);

  return <div className="shell">
    <AppHeader role={role} email={user.email ?? ""} current={`/lancamentos/${id}`} />
    <main className="main">
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><IconArrowLeft className="size-4" aria-hidden /> Voltar aos lançamentos</Link>
      <div className="page-head">
        <div>
          <span className="eyebrow">{dateBR(entry.date)} · {entry.splits.length} {entry.splits.length === 1 ? "rubrica" : "rubricas"}</span>
          <h1 className="break-words text-[clamp(28px,4vw,44px)]">{entry.name}</h1>
          <p className="lede">
            <span className={entry.totalCents < 0 ? "font-semibold text-destructive" : "font-semibold text-foreground"}>{money(entry.totalCents / 100)}</span>
            {" · "}Criado em {dateTime.format(new Date(entry.createdAt))}{edited && <> · alterado em {dateTime.format(new Date(entry.updatedAt))}</>}
          </p>
        </div>
      </div>
      {!canEdit && <p className="mb-3 text-xs text-muted-foreground">Seu acesso é somente de consulta.</p>}
      {(statementLines?.length ?? 0) > 0 && <StatementLines lines={statementLines as LinkedLine[]} />}
      <SectionCard className="p-5"><EntryForm entry={entry} catalogs={catalogs} canEdit={canEdit} backHref={backHref} /></SectionCard>
    </main>
  </div>;
}
