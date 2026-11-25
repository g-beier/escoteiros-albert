import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard } from "@geas/ui/components/section-card";
import { QuickEntryForm } from "@/components/finance/quick-entry-form";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { entryCatalogs } from "@/lib/server/finance/registry";
import { ATTACHMENTS_ENABLED } from "@/lib/features";
import { pageSession } from "@/lib/server/session";

/** Lançamento pelo registro rápido: receita ou despesa (sem rubrica) e o comprovante; quem revisa classifica e completa. */
export default async function QuickEntry() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.finance.canWrite) redirect("/rapido");
  const { paymentMethods } = await entryCatalogs(member.db, member.groupId);
  return <div className="shell">
    <GestaoHeader current="/rapido/lancamento" member={member} quick />
    <PageBody width="narrow">
      <PageHeader title="Lançamento financeiro" crumbs={[{ label: "Registro rápido", href: "/rapido" }, { label: "Lançamento financeiro" }]}
        description={`Receita ou despesa, valor e histórico${ATTACHMENTS_ENABLED ? ", com a foto do comprovante" : ""}. A conta é a padrão da forma de pagamento; rubrica, documento e rateio quem revisa completa.`} />
      <SectionCard><div className="p-4">
        <QuickEntryForm paymentMethods={paymentMethods} today={todayInSaoPaulo()} />
      </div></SectionCard>
    </PageBody>
  </div>;
}
