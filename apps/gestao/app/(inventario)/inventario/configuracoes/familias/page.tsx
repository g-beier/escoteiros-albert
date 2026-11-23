import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/inventory/app-header";
import { SettingsTabs, settingsCrumbs } from "@/components/inventory/settings-tabs";
import { FamiliesManager } from "@/components/inventory/families/families-manager";
import { SetupNeeded } from "@/components/shell/setup-needed";
import * as families from "@/lib/server/inventory/families";
import { pageSession } from "@/lib/server/session";

export default async function FamiliesPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const items = await families.listForSettings(member.db, member.groupId);

  return <div className="shell">
    <AppHeader current="/inventario/configuracoes/familias" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="familias" />} crumbs={settingsCrumbs("familias")}
        description={member.inventory.canReview
          ? "Tipos de material. Clique numa família para ver os materiais dela."
          : "Tipos de material. Só o gestor do inventário altera as famílias."} />
      <FamiliesManager families={items} canManage={member.inventory.canReview} />
    </PageBody>
  </div>;
}
