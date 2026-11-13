import { notFound, redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/app-header";
import { fetchFamilyOptions } from "@/components/materials/data";
import { MaterialForm, type MaterialDefaults } from "@/components/materials/material-form";
import { ReviewNotice } from "@/components/materials/review-notice";
import { SetupNeeded } from "@/components/setup-needed";
import { pageSession } from "@/lib/session";

export default async function EditMaterial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  if (!member.canEdit) redirect(`/materiais/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: material }, { count: lots }, { count: units }] = await Promise.all([
    supabase.from("inventory_materials").select("id, name, family_id, tracking, consumable, minimum_quantity, description, active").eq("id", id).eq("group_id", member.groupId).maybeSingle(),
    supabase.from("inventory_lots").select("id", { count: "exact", head: true }).eq("material_id", id),
    supabase.from("inventory_units").select("id", { count: "exact", head: true }).eq("material_id", id),
  ]);
  if (!material) notFound();
  const families = await fetchFamilyOptions(supabase, member.groupId, material.family_id as string | null);
  return <div className="shell">
    <AppHeader current={`/materiais/${id}`} email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title={`Editar ${material.name}`}
        crumbs={[{ label: "Materiais", href: "/materiais" }, { label: material.name as string, href: `/materiais/${id}` }, { label: "Editar" }]} />
      {!member.canManage && <ReviewNotice />}
      <SectionCard>
        <SectionHeader title="Material" />
        <div className="p-4"><MaterialForm families={families} material={material as MaterialDefaults} hasStock={(lots ?? 0) + (units ?? 0) > 0} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
