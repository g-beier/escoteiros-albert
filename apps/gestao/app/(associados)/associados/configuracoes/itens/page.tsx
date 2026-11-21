import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/associates/app-header";
import { ControlItemsManager } from "@/components/associates/control-items-manager";
import { SettingsTabs, settingsCrumbs } from "@/components/associates/settings-tabs";
import { SetupNeeded } from "@/components/shell/setup-needed";
import * as controls from "@/lib/server/associates/controls";
import { pageSession } from "@/lib/server/session";

export default async function ControlItemsPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const items = await controls.items(member.db, member.groupId);
  const canEdit = member.associates.canEdit;

  return <div className="shell">
    <AppHeader current="/associados/configuracoes/itens" email={user.email} role={member.associates.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="itens" canEdit={canEdit} />} crumbs={settingsCrumbs("itens")}
        description={canEdit
          ? "Itens do controle de dados pessoais (Doc 22), por diretoria: a quem se aplicam, validade e se saem no desligamento. Arraste pela alça para mudar a ordem das colunas da matriz."
          : "Itens do controle de dados pessoais, por diretoria. Só a secretaria altera."} />
      <ControlItemsManager items={items} canEdit={canEdit} />
    </PageBody>
  </div>;
}
