import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/inventory/app-header";
import { QuickForm } from "@/components/inventory/quick/quick-form";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { locationOptions } from "@/lib/inventory/locations";
import * as families from "@/lib/server/inventory/families";
import * as locations from "@/lib/server/inventory/locations";
import { pageSession } from "@/lib/server/session";

/** Cadastro rápido: o material e a primeira entrada de uma vez; o gestor completa valor e detalhes na revisão. */
export default async function QuickNewMaterial() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canEdit) redirect("/inventario/materiais");
  const [familyOptions, paths] = await Promise.all([families.listOptions(member.db, member.groupId), locations.listPaths(member.db, member.groupId)]);
  return <div className="shell">
    <AppHeader current="/inventario/rapido/novo" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Cadastrar material" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Registro rápido", href: "/inventario/rapido" }, { label: "Cadastrar material" }]}
        description="Só o essencial: nome, controle, onde está e quanto tem. Valor, origem e os demais dados ficam para o gestor completar." />
      <SectionCard><div className="p-4"><QuickForm kind="novo" locations={locationOptions(paths)} families={familyOptions} /></div></SectionCard>
    </PageBody>
  </div>;
}
