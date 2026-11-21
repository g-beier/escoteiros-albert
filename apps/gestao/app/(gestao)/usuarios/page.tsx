import { notFound } from "next/navigation";
import { UsersManager } from "@geas/ui/components/users-manager";
import { listGroupUsers } from "@/lib/server/users";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { PageBody, PageHeader } from "@geas/ui";
import { pageSession } from "@/lib/server/session";
import { inviteUser, removeUser, saveUserRoles } from "./actions";

export default async function UsersPage() {
  const { user, member } = await pageSession();
  if (!member || !member.isAdmin) notFound();
  const users = await listGroupUsers(member.groupId);

  return <div className="shell">
    <GestaoHeader current="/usuarios" email={user.email} role={member.finance.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Usuários" crumbs={[{ label: "Usuários" }]} description="Convide pessoas do domínio institucional e defina o acesso de cada uma no Financeiro, no Inventário e no Associados." />
      <UsersManager users={users} currentUserId={user.id} actions={{ invite: inviteUser, save: saveUserRoles, remove: removeUser }} />
    </PageBody>
  </div>;
}
