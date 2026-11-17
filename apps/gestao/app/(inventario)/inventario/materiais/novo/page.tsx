import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/inventory/app-header";
import { fetchFamilyOptions } from "@/components/inventory/materials/data";
import { MaterialForm } from "@/components/inventory/materials/material-form";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { pageSession } from "@/lib/server/session";

export default async function NewMaterial() {
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  if (!member.inventory.canEdit) redirect("/inventario/materiais");
  const families = await fetchFamilyOptions(supabase, member.groupId);
  return <div className="shell">
    <AppHeader current="/inventario/materiais/novo" email={user.email ?? ""} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Novo material" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Materiais", href: "/inventario/materiais" }, { label: "Novo material" }]}
        description="Depois de cadastrar, adicione os lotes (por quantidade) ou as peças (com etiqueta)." />
      {!member.inventory.canManage && <ReviewNotice />}
      <SectionCard>
        <SectionHeader title="Material" />
        <div className="p-4"><MaterialForm families={families} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
