import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/associates/app-header";
import { AssociateForm } from "@/components/associates/associate-form";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { todayISO } from "@/lib/associates/model";
import * as sections from "@/lib/server/associates/sections";
import { pageSession } from "@/lib/server/session";

export default async function NewAssociate() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.associates.canWrite) redirect("/associados");
  const catalog = await sections.catalog(member.db, member.groupId);
  return <div className="shell">
    <AppHeader current="/associados/novo" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Novo associado" crumbs={[{ label: "Associados", href: "/associados" }, { label: "Novo associado" }]}
        description="Nome, divisão e datas. Documentos e contatos ficam no Paxtu." />
      <SectionCard>
        <SectionHeader title="Associado" />
        <div className="p-4"><AssociateForm catalog={catalog} today={todayISO()} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
