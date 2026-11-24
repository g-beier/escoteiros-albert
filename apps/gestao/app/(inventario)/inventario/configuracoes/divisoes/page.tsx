import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/inventory/app-header";
import { SettingsTabs, settingsCrumbs } from "@/components/inventory/settings-tabs";
import { LocationsManager } from "@/components/inventory/locations/locations-manager";
import { SetupNeeded } from "@/components/shell/setup-needed";
import * as locations from "@/lib/server/inventory/locations";
import { pageSession } from "@/lib/server/session";

export default async function LocationsPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const items = await locations.listForSettings(member.db, member.groupId);

  return <div className="shell">
    <AppHeader current="/inventario/configuracoes/divisoes" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="divisoes" canImport={member.inventory.canReview} />} crumbs={settingsCrumbs("divisoes")}
        description={member.inventory.canReview
          ? "Onde os materiais do grupo ficam guardados. Arraste pela alça para reordenar ou pôr dentro de outra; clique numa divisão para ver o que há nela."
          : "Onde os materiais do grupo ficam guardados. Só o gestor do inventário altera as divisões."} />
      <LocationsManager locations={items} canManage={member.inventory.canReview} />
    </PageBody>
  </div>;
}
