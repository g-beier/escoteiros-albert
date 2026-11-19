import { notFound, redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/inventory/app-header";
import { MaterialForm } from "@/components/inventory/materials/material-form";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { materialsBackHref, withBack } from "@/lib/inventory/material-list";
import * as families from "@/lib/server/inventory/families";
import * as materials from "@/lib/server/inventory/materials";
import { pageSession } from "@/lib/server/session";

export default async function EditMaterial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string }> }) {
  const [{ id }, { voltar }] = await Promise.all([params, searchParams]);
  const back = materialsBackHref(voltar);
  const detailHref = withBack(`/inventario/materiais/${id}`, back);
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canEdit) redirect(detailHref);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await materials.getForEdit(member.db, member.groupId, id);
  if (!found) notFound();
  const { material, hasStock } = found;
  const familyOptions = await families.listOptions(member.db, member.groupId, material.family_id);
  return <div className="shell">
    <AppHeader current={`/inventario/materiais/${id}`} email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title={`Editar ${material.name}`}
        crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Materiais", href: back }, { label: material.name, href: detailHref }, { label: "Editar" }]} />
      {!member.inventory.canManage && <ReviewNotice />}
      <SectionCard>
        <SectionHeader title="Material" />
        <div className="p-4"><MaterialForm families={familyOptions} material={material} hasStock={hasStock} back={back} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
