import { notFound } from "next/navigation";
import { pageSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUser, UserRoleForm } from "@/components/invite-user";
import { removeUser } from "./actions";
import { AppHeader } from "@/components/app-header";
import { PageBody, PageHeader } from "@/components/nav/page-header";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { ConfirmRemove } from "@/components/confirm-remove";
import { Badge } from "@geas/ui/components/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";

const headClass = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

export default async function UsersPage() {
  const { user, member: ownMembership } = await pageSession();
  if (!ownMembership || ownMembership.role !== "admin") notFound();

  const admin = createAdminClient();
  const [{ data: memberships }, { data: authData }] = await Promise.all([
    admin.from("memberships").select("user_id, role, created_at").eq("group_id", ownMembership.groupId).order("created_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const authUsers = new Map((authData?.users ?? []).map((item) => [item.id, item]));

  return <div className="shell">
    <AppHeader role={ownMembership.role} email={user.email ?? ""} current="/usuarios" />
    <PageBody width="narrow">
      <PageHeader title="Usuários" crumbs={[{ label: "Usuários" }]} description="Convide pessoas do domínio institucional e defina o nível de acesso de cada uma." />
      <SectionCard>
        <SectionHeader title="Convidar usuário"><Badge variant="outline">@escoteirosalbert.com.br</Badge></SectionHeader>
        <div className="p-4"><InviteUser /></div>
      </SectionCard>
      <SectionCard>
        <SectionHeader title="Pessoas com acesso"><SectionCount>{memberships?.length ?? 0} usuários</SectionCount></SectionHeader>
        <div className="overflow-x-auto"><Table className="min-w-[720px]">
          <TableCaption className="sr-only">Usuários com acesso ao grupo</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
            <TableHead className={headClass}>Usuário</TableHead>
            <TableHead className={cn(headClass, "w-40")}>Status</TableHead>
            <TableHead className={cn(headClass, "w-64")}>Papel</TableHead>
            <TableHead className={cn(headClass, "w-28")}><span className="sr-only">Ações</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>{(memberships ?? []).map((membership) => {
            const authUser = authUsers.get(membership.user_id);
            const confirmed = Boolean(authUser?.email_confirmed_at);
            const email = authUser?.email ?? "Usuário indisponível";
            return <TableRow key={membership.user_id}>
              <TableCell className="px-3 py-1.5"><span className="font-semibold">{email}</span>{membership.user_id === user.id && <span className="text-muted-foreground"> (você)</span>}</TableCell>
              <TableCell className="px-3 py-1.5"><Badge className={confirmed ? "bg-success-soft text-success" : "bg-[#f5eed1] text-[#725d0d]"}>{confirmed ? "Ativo" : "Convite pendente"}</Badge></TableCell>
              <TableCell className="px-3 py-1.5"><UserRoleForm userId={membership.user_id} email={email} role={membership.role} /></TableCell>
              <TableCell className="px-3 py-1.5">{membership.user_id !== user.id && <form action={removeUser}><input type="hidden" name="userId" value={membership.user_id} /><ConfirmRemove email={email} /></form>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></div>
      </SectionCard>
    </PageBody>
  </div>;
}
