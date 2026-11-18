import { notFound, redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/inventory/app-header";
import { MaterialForm } from "@/components/inventory/materials/material-form";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";
import { SoftSectionCard, SoftSectionHeader } from "@/components/inventory/soft-section-card";
import { SetupNeeded } from "@/components/shell/setup-needed";
import * as families from "@/lib/server/inventory/families";
import * as materials from "@/lib/server/inventory/materials";
import { pageSession } from "@/lib/server/session";

export default async function EditMaterial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canEdit) redirect(`/inventario/materiais/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await materials.getForEdit(member.db, member.groupId, id);
  if (!found) notFound();
  const { material, hasStock } = found;
  const familyOptions = await families.listOptions(member.db, member.groupId, material.family_id);
  return <div className="shell">
    <AppHeader current={`/inventario/materiais/${id}`} email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title={`Editar ${material.name}`}
        crumbs={[{ label: "Inventário", href: "/inventario" }, { label: material.name, href: `/inventario/materiais/${id}` }, { label: "Editar" }]} />
      {!member.inventory.canManage && <ReviewNotice />}
      <SoftSectionCard>
        <SoftSectionHeader title="Material" />
        <div className="p-4"><MaterialForm families={familyOptions} material={material} hasStock={hasStock} /></div>
      </SoftSectionCard>
    </PageBody>
  </div>;
}
