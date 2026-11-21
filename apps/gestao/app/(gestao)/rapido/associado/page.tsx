import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard } from "@geas/ui/components/section-card";
import { AssociateForm } from "@/components/associates/associate-form";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { todayISO } from "@/lib/associates/model";
import * as sections from "@/lib/server/associates/sections";
import { pageSession } from "@/lib/server/session";

/** Associado novo pelo registro rápido: o formulário do cadastro, para a Secretaria revisar. */
export default async function QuickAssociate() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.associates.canEdit) redirect("/rapido");
  const catalog = await sections.catalog(member.db, member.groupId);
  return <div className="shell">
    <GestaoHeader current="/rapido/associado" email={user.email} role={member.finance.role} isAdmin={member.isAdmin} quick />
    <PageBody width="narrow">
      <PageHeader title="Associado novo" crumbs={[{ label: "Registro rápido", href: "/rapido" }, { label: "Associado novo" }]}
        description="Nome, divisão e as datas que souber. Documentos e contatos ficam no Paxtu; a Secretaria revisa o cadastro." />
      <SectionCard><div className="p-4"><AssociateForm catalog={catalog} today={todayISO()} quick /></div></SectionCard>
    </PageBody>
  </div>;
}
