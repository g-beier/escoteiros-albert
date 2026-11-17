import { notFound } from "next/navigation";
import { UsersManager } from "@geas/ui/components/users-manager";
import { listGroupUsers } from "@geas/ui/lib/users";
import { AppHeader } from "@/components/app-header";
import { PageBody, PageHeader } from "@/components/nav/page-header";
import { pageSession } from "@/lib/session";
import { inviteUser, removeUser, saveUserRoles } from "./actions";

export default async function UsersPage() {
  const { user, member } = await pageSession();
  if (!member || member.role !== "admin") notFound();
  const users = await listGroupUsers(member.groupId);

  return <div className="shell">
    <AppHeader role={member.role} email={user.email ?? ""} current="/usuarios" />
    <PageBody width="narrow">
      <PageHeader title="Usuários" crumbs={[{ label: "Usuários" }]} description="Convide pessoas do domínio institucional e defina o acesso de cada uma no Financeiro e no Inventário." />
      <UsersManager users={users} currentUserId={user.id} actions={{ invite: inviteUser, save: saveUserRoles, remove: removeUser }} />
    </PageBody>
  </div>;
}
