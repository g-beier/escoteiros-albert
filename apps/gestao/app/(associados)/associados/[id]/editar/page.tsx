import { notFound, redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/associates/app-header";
import { AssociateForm } from "@/components/associates/associate-form";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { todayISO } from "@/lib/associates/model";
import * as associates from "@/lib/server/associates/associates";
import * as sections from "@/lib/server/associates/sections";
import { pageSession } from "@/lib/server/session";

export default async function EditAssociate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.associates.canWrite) redirect(`/associados/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [associate, catalog] = await Promise.all([associates.get(member.db, member.groupId, id), sections.catalog(member.db, member.groupId)]);
  if (!associate) notFound();
  return <div className="shell">
    <AppHeader current={`/associados/${id}`} member={member} />
    <PageBody width="narrow">
      <PageHeader title={`Editar ${associate.name}`}
        crumbs={[{ label: "Associados", href: "/associados" }, { label: associate.name, href: `/associados/${id}` }, { label: "Editar" }]}
        description="Aqui se corrige o cadastro, inclusive ramo, seção e equipe, sem histórico. A passagem para o ramo seguinte (cerimônia) é registrada no detalhe." />
      <SectionCard>
        <SectionHeader title="Associado" />
        <div className="p-4"><AssociateForm catalog={catalog} associate={associate} today={todayISO()} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
