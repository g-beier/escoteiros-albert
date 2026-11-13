import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { UsersManager } from "@geas/ui/components/users-manager";
import { listGroupUsers } from "@geas/ui/lib/users";
import { AppHeader } from "@/components/app-header";
import { SettingsTabs, settingsCrumbs } from "@/components/settings-tabs";
import { pageSession } from "@/lib/session";
import { inviteUser, removeUser, saveUserRoles } from "./actions";

export default async function UsersPage() {
  const { user, member } = await pageSession();
  if (!member?.isAdmin) notFound();
  const users = await listGroupUsers(member.groupId);

  return <div className="shell">
    <AppHeader current="/configuracoes/usuarios" email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="usuarios" isAdmin />} crumbs={settingsCrumbs("usuarios")}
        description="Convide pessoas do domínio institucional e defina o acesso de cada uma no Financeiro e no Inventário." />
      <UsersManager users={users} currentUserId={user.id} actions={{ invite: inviteUser, save: saveUserRoles, remove: removeUser }} />
    </PageBody>
  </div>;
}
