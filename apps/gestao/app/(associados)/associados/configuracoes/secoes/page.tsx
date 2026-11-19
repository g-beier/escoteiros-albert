import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/associates/app-header";
import { SectionsManager } from "@/components/associates/sections-manager";
import { SettingsTabs, settingsCrumbs } from "@/components/associates/settings-tabs";
import { SetupNeeded } from "@/components/shell/setup-needed";
import * as sections from "@/lib/server/associates/sections";
import { pageSession } from "@/lib/server/session";

export default async function SectionsPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const [catalog, counts] = await Promise.all([sections.catalog(member.db, member.groupId), sections.activeCounts(member.db, member.groupId)]);
  const canEdit = member.associates.canEdit;

  return <div className="shell">
    <AppHeader current="/associados/configuracoes/secoes" email={user.email} role={member.associates.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="secoes" canEdit={canEdit} />} crumbs={settingsCrumbs("secoes")}
        description={canEdit
          ? "Seções de cada ramo e as equipes (matilhas, patrulhas) dos ramos que se dividem. Inativas deixam de aparecer nos cadastros e passagens."
          : "Seções de cada ramo e as equipes dos ramos que se dividem. Só a secretaria altera."} />
      <SectionsManager {...catalog} counts={counts} canEdit={canEdit} />
    </PageBody>
  </div>;
}
