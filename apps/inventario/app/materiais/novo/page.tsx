import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/app-header";
import { fetchFamilyOptions } from "@/components/materials/data";
import { MaterialForm } from "@/components/materials/material-form";
import { ReviewNotice } from "@/components/materials/review-notice";
import { SetupNeeded } from "@/components/setup-needed";
import { pageSession } from "@/lib/session";

export default async function NewMaterial() {
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  if (!member.canEdit) redirect("/materiais");
  const families = await fetchFamilyOptions(supabase, member.groupId);
  return <div className="shell">
    <AppHeader current="/materiais/novo" email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Novo material" crumbs={[{ label: "Materiais", href: "/materiais" }, { label: "Novo material" }]}
        description="Depois de cadastrar, adicione os lotes (por quantidade) ou as peças (com etiqueta)." />
      {!member.canManage && <ReviewNotice />}
      <SectionCard>
        <SectionHeader title="Material" />
        <div className="p-4"><MaterialForm families={families} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
