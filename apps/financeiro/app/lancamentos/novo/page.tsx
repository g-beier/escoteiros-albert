import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { AppHeader } from "@/components/app-header";
import { PageBody, PageHeader } from "@/components/nav/page-header";
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
    <PageBody>
      <PageHeader title="Novo lançamento"
        crumbs={line ? [{ label: "Extrato", href: "/conciliacao" }, { label: "Conciliar", href: backHref }, { label: "Novo lançamento" }] : [{ label: "Lançamentos", href: backHref }, { label: "Novo lançamento" }]}
        description={line
          ? <>A partir do extrato: <strong>{line.description}</strong> em <span className="num">{dateBR(line.line_date)}</span>, <span className="num">{money(Number(line.amount_cents) / 100)}</span>. Valor e conta vêm da linha; distribua o valor entre as rubricas. Ao salvar, o lançamento já fica conciliado.</>
          : "Informe o histórico, a conta e a forma de pagamento e distribua o valor total entre as rubricas, cada uma com sua descrição."} />
      {line && line.status !== "aberta"
        ? <SectionCard className="p-5"><p className="m-0">Esta linha do extrato já foi {line.status === "conciliada" ? "conciliada" : "ignorada"}. <Link href={backHref} className="font-semibold underline">Voltar à conciliação</Link></p></SectionCard>
        : <SectionCard className="p-5"><EntryForm entry={null} catalogs={catalogs} canEdit backHref={backHref} fromLine={fromLine} /></SectionCard>}
    </PageBody>
  </div>;
}
