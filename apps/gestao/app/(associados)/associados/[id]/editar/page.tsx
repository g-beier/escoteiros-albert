import { notFound, redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/associates/app-header";
import { AssociateForm } from "@/components/associates/associate-form";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { todayISO } from "@/lib/associates/model";
import * as associates from "@/lib/server/associates/associates";
import { pageSession } from "@/lib/server/session";

export default async function EditAssociate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.associates.canEdit) redirect(`/associados/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const associate = await associates.get(member.db, member.groupId, id);
  if (!associate) notFound();
  return <div className="shell">
    <AppHeader current={`/associados/${id}`} email={user.email} role={member.associates.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title={`Editar ${associate.name}`}
        crumbs={[{ label: "Associados", href: "/associados" }, { label: associate.name, href: `/associados/${id}` }, { label: "Editar" }]}
        description="Ramo, seção e equipe mudam pela Passagem, no detalhe." />
      <SectionCard>
        <SectionHeader title="Associado" />
        <div className="p-4"><AssociateForm catalog={{ sections: [], patrols: [] }} associate={associate} today={todayISO()} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
