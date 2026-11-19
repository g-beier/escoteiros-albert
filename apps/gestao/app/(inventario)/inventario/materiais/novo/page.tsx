import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/inventory/app-header";
import { MaterialForm } from "@/components/inventory/materials/material-form";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";
import { SoftSectionCard, SoftSectionHeader } from "@/components/inventory/soft-section-card";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { locationOptions } from "@/lib/inventory/locations";
import * as families from "@/lib/server/inventory/families";
import * as locations from "@/lib/server/inventory/locations";
import { pageSession } from "@/lib/server/session";

export default async function NewMaterial() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canEdit) redirect("/inventario");
  const [familyOptions, paths] = await Promise.all([families.listOptions(member.db, member.groupId), locations.listPaths(member.db, member.groupId)]);
  return <div className="shell">
    <AppHeader current="/inventario/materiais/novo" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Novo material" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Novo material" }]}
        description="Cadastre o material e, se quiser, já registre a primeira entrada. Depois, no detalhe, adicione mais lotes ou peças." />
      {!member.inventory.canManage && <ReviewNotice />}
      <SoftSectionCard>
        <SoftSectionHeader title="Material" />
        <div className="p-4"><MaterialForm families={familyOptions} locations={locationOptions(paths)} /></div>
      </SoftSectionCard>
    </PageBody>
  </div>;
}
