import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { SectionCard } from "@/components/section-card";
import { AppHeader } from "@/components/app-header";
import { EntryForm, type StatementLinePrefill } from "@/components/entries/entry-form";
import { listHref } from "@/lib/entries";
import { dateBR, money } from "@/lib/format";
import { guessPaymentMethod, safeReconciliationHref, suggestedEntryName } from "@/lib/reconciliation";
import { loadEntryContext } from "../context";

export const metadata = { title: "Novo lançamento · GEAS Financeiro" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StatementLine = { id: string; account_id: string; line_date: string; description: string; kind: string | null; counterparty: string | null; amount_cents: number; status: string; trn_type: string | null };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ voltar?: string; linha?: string }> }) {
  const { voltar, linha } = await searchParams;
  const { supabase, user, role, canEdit, catalogs } = await loadEntryContext();
  if (!canEdit) notFound();

  // "Criar lançamento" na conciliação: a linha do extrato preenche data, histórico, valor, conta e forma provável
  let line: StatementLine | null = null;
  if (linha && UUID.test(linha)) {
    const { data } = await supabase.from("statement_lines")
      .select("id, account_id, line_date, description, kind, counterparty, amount_cents, status, trn_type").eq("id", linha).maybeSingle();
    line = data as StatementLine | null;
    if (!line) notFound();
  }
  const backHref = line ? safeReconciliationHref(voltar) : listHref(voltar);
  const fromLine: StatementLinePrefill | undefined = line ? {
    id: line.id, date: line.line_date, name: suggestedEntryName(line), totalCents: Number(line.amount_cents), accountId: line.account_id,
    paymentMethodId: guessPaymentMethod({ ...line, trnType: line.trn_type }, catalogs.paymentMethods) ?? "",
  } : undefined;

  return <div className="shell">
    <AppHeader role={role} email={user.email ?? ""} current="/lancamentos/novo" />
    <main className="main">
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><IconArrowLeft className="size-4" aria-hidden /> {line ? "Voltar à conciliação" : "Voltar aos lançamentos"}</Link>
      <div className="page-head"><div><span className="eyebrow">Linha do extrato</span><h1>Novo lançamento</h1>
        {line
          ? <p className="lede">A partir do extrato: <strong>{line.description}</strong> em <span className="num">{dateBR(line.line_date)}</span>, <span className="num">{money(Number(line.amount_cents) / 100)}</span>. Valor e conta vêm da linha; distribua o valor entre as rubricas. Ao salvar, o lançamento já fica conciliado.</p>
          : <p className="lede">Informe os dados do extrato e distribua o valor total entre as rubricas, cada uma com sua descrição.</p>}
      </div></div>
      {line && line.status !== "aberta"
        ? <SectionCard className="p-5"><p className="m-0">Esta linha do extrato já foi {line.status === "conciliada" ? "conciliada" : "ignorada"}. <Link href={backHref} className="font-semibold underline">Voltar à conciliação</Link></p></SectionCard>
        : <SectionCard className="p-5"><EntryForm entry={null} catalogs={catalogs} canEdit backHref={backHref} fromLine={fromLine} /></SectionCard>}
    </main>
  </div>;
}
