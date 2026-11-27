import { notFound } from "next/navigation";
import { ROLE_MODULES } from "@geas/ui/lib/roles";
import { UsersManager } from "@geas/ui/components/users-manager";
import { linkableAssociates, listGroupUsers } from "@/lib/server/users";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { PageBody, PageHeader } from "@geas/ui";
import { pageSession } from "@/lib/server/session";
import { inviteUser, removeUser, saveUserRoles } from "./actions";

/** Usuários: quem administra algum módulo; cada um muda só o papel nos módulos que administra. */
export default async function UsersPage() {
  const { user, member } = await pageSession();
  if (!member || !member.managesUsers) notFound();
  const adminOf = ROLE_MODULES.filter((module) => member[module].canAdmin);
  const linksAssociates = member.associates.canAdmin;
  const [users, associates] = await Promise.all([
    listGroupUsers(member.db, member.groupId),
    linksAssociates ? linkableAssociates(member.db, member.groupId) : Promise.resolve([]),
  ]);

  return (
    <div className="shell">
      <GestaoHeader current="/usuarios" member={member} />
      <PageBody>
        <PageHeader
          title="Usuários"
          crumbs={[{ label: "Administração" }, { label: "Usuários" }]}
          description="Cadastre o e-mail da conta Google de cada pessoa e defina o acesso dela em cada módulo. Cada administrador muda só os módulos que administra; quem fica sem acesso a todos sai do grupo."
        />
        <UsersManager
          users={users}
          associates={associates}
          currentUserId={user.id}
          adminOf={adminOf}
          linksAssociates={linksAssociates}
          actions={{ invite: inviteUser, save: saveUserRoles, remove: removeUser }}
        />
      </PageBody>
    </div>
  );
}
