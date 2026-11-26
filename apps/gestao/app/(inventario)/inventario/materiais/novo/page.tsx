import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/inventory/app-header";
import { MaterialForm } from "@/components/inventory/materials/material-form";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { locationOptions } from "@/lib/inventory/locations";
import { materialsBackHref } from "@/lib/inventory/material-list";
import * as families from "@/lib/server/inventory/families";
import * as locations from "@/lib/server/inventory/locations";
import { pageSession } from "@/lib/server/session";

export default async function NewMaterial({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const back = materialsBackHref((await searchParams).voltar);
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canWrite) redirect(back);
  const [familyOptions, paths] = await Promise.all([families.listOptions(member.db, member.groupId), locations.listPaths(member.db, member.groupId)]);
  return <div className="shell">
    <AppHeader current="/inventario/materiais/novo" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Novo material" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Materiais", href: back }, { label: "Novo material" }]}
        description="Cadastre o material e, se quiser, já registre a primeira entrada. Depois, no detalhe, adicione mais lotes ou peças." />
      {!member.inventory.canReview && <ReviewNotice />}
      <SectionCard>
        <SectionHeader title="Material" />
        <div className="p-4"><MaterialForm families={familyOptions} locations={locationOptions(paths)} back={back} /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
