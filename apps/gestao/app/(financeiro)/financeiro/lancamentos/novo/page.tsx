import { Link } from "@geas/ui/components/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/finance/app-header";
import { PageBody, PageHeader } from "@/components/finance/nav/page-header";
import { EntryForm, type DebtReceivePrefill, type StatementLinePrefill } from "@/components/finance/entries/entry-form";
import { listHref } from "@/lib/finance/entries";
import { dateBR, money } from "@/lib/format";
import { guessPaymentMethod, safeReconciliationHref, suggestedEntryName } from "@/lib/finance/reconciliation";
import { statementLine, type StatementLine } from "@/lib/server/finance/statements";
import { receivable } from "@/lib/server/finance/debts";
import { loadEntryContext } from "../context";

export const metadata = { title: "Novo lançamento · GEAS Financeiro" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEBTS_HREF = "/financeiro/mensalidades/devedores";

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ voltar?: string; linha?: string; receber?: string; divida?: string }> }) {
  const { voltar, linha, receber, divida } = await searchParams;
  const { member, db, canEdit, catalogs } = await loadEntryContext();
  if (!canEdit) notFound();

  // "Criar lançamento" na conciliação: a linha do extrato preenche data, histórico, valor, conta e forma provável
  let line: StatementLine | null = null;
  if (linha && UUID.test(linha)) {
    line = await statementLine(db, linha);
    if (!line) notFound();
  }
  // "Receber" em Devedores (024): `receber` = associado; um rateio ligado a cada linha em aberto (ou só a `divida`).
  let receive: DebtReceivePrefill | undefined;
  if (receber && UUID.test(receber) && !line) {
    if (!member.finance.canReview) notFound();
    receive = await receivable(db, member.groupId, receber, divida && UUID.test(divida) ? divida : undefined) ?? undefined;
    if (!receive) notFound();
  }
  const backHref = line ? safeReconciliationHref(voltar) : receive ? DEBTS_HREF : listHref(voltar);
  const fromLine: StatementLinePrefill | undefined = line ? {
    id: line.id, date: line.line_date, name: suggestedEntryName(line), totalCents: Number(line.amount_cents), accountId: line.account_id,
    paymentMethodId: guessPaymentMethod({ ...line, trnType: line.trn_type }, catalogs.paymentMethods) ?? "",
  } : undefined;

  return <div className="shell">
    <AppHeader member={member} current="/financeiro/lancamentos/novo" />
    <PageBody>
      <PageHeader title={receive ? "Receber dívida" : "Novo lançamento"}
        crumbs={line ? [{ label: "Extrato", href: "/financeiro/extrato/conciliar" }, { label: "Conciliar", href: backHref }, { label: "Novo lançamento" }]
          : receive ? [{ label: "Mensalidades", href: "/financeiro/mensalidades" }, { label: "Devedores", href: DEBTS_HREF }, { label: "Receber" }]
          : [{ label: "Lançamentos", href: backHref }, { label: "Novo lançamento" }]}
        description={receive
          ? <>{receive.associateName}: <span className="num">{money(receive.lines.reduce((sum, l) => sum + l.openCents, 0) / 100)}</span> em aberto ({receive.lines.length} {receive.lines.length === 1 ? "dívida" : "dívidas"}). Recebeu menos? Mude o valor de cada rateio (ou tire rateios) e o total: cada rateio abate a sua dívida. Confira a forma de pagamento e a conta.</>
          : line
          ? <>A partir do extrato: <strong>{line.description}</strong> em <span className="num">{dateBR(line.line_date)}</span>, <span className="num">{money(Number(line.amount_cents) / 100)}</span>. Valor e conta vêm da linha; distribua o valor entre as rubricas. Ao salvar, o lançamento já fica conciliado.</>
          : "Informe o histórico, a conta e a forma de pagamento e distribua o valor total entre as rubricas, cada uma com sua descrição."} />
      {line && line.status !== "aberta"
        ? <SectionCard className="p-5"><p className="m-0">Esta linha do extrato já foi {line.status === "conciliada" ? "conciliada" : "ignorada"}. <Link href={backHref} className="font-semibold underline">Voltar à conciliação</Link></p></SectionCard>
        : <SectionCard className="p-5"><EntryForm entry={null} catalogs={catalogs} canEdit backHref={backHref} fromLine={fromLine} receive={receive} /></SectionCard>}
    </PageBody>
  </div>;
}
