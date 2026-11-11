import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUser } from "@/components/invite-user";
import { changeRole, removeUser } from "./actions";
import { Brand } from "@/components/brand";
import { ConfirmRemove } from "@/components/confirm-remove";

const roleLabels = { admin: "Administrador", treasurer: "Tesoureiro", viewer: "Consulta" } as const;

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: ownMembership } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!ownMembership || ownMembership.role !== "admin") notFound();

  const admin = createAdminClient();
  const [{ data: memberships }, { data: authData }] = await Promise.all([
    admin.from("memberships").select("user_id, role, created_at").eq("group_id", ownMembership.group_id).order("created_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const authUsers = new Map((authData?.users ?? []).map((item) => [item.id, item]));

  return <div className="shell">
    <header className="topbar"><Brand /><nav className="nav-actions" aria-label="Navegação principal"><Link href="/">Lançamentos</Link><span className="nav-email">{user.email}</span></nav></header>
    <main className="main">
      <div className="page-head"><div><span className="eyebrow">Administração</span><h1>Usuários</h1><p className="lede">Convide pessoas do domínio institucional e defina o nível de acesso de cada uma.</p></div></div>
      <section className="card invite-card"><header className="card-head"><h2 className="card-title">Convidar usuário</h2><span className="badge">@escoteirosalbert.com.br</span></header><div style={{ padding: 22 }}><InviteUser /></div></section>
      <section className="card" style={{ marginTop: 20 }}><header className="card-head"><h2 className="card-title">Pessoas com acesso</h2><span className="muted" style={{ fontSize: 12 }}>{memberships?.length ?? 0} usuários</span></header>
        <div className="table-wrap"><table><caption className="sr-only">Usuários com acesso ao grupo</caption><thead><tr><th scope="col">Usuário</th><th scope="col">Status</th><th scope="col">Papel</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead><tbody>{(memberships ?? []).map((membership) => {
          const authUser = authUsers.get(membership.user_id);
          const confirmed = Boolean(authUser?.email_confirmed_at);
          const email = authUser?.email ?? "Usuário indisponível";
          return <tr key={membership.user_id}><td><strong>{email}</strong>{membership.user_id === user.id && <span className="muted"> (você)</span>}</td><td><span className={`badge ${confirmed ? "" : "pending-badge"}`}>{confirmed ? "Ativo" : "Convite pendente"}</span></td><td><form action={changeRole} className="inline-form"><input type="hidden" name="userId" value={membership.user_id} /><label className="sr-only" htmlFor={`role-${membership.user_id}`}>Papel de {email}</label><select id={`role-${membership.user_id}`} className="input compact" name="role" defaultValue={membership.role}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button className="button secondary" aria-label={`Salvar papel de ${email}`}>Salvar</button></form></td><td>{membership.user_id !== user.id && <form action={removeUser}><input type="hidden" name="userId" value={membership.user_id} /><ConfirmRemove email={email} /></form>}</td></tr>;
        })}</tbody></table></div>
      </section>
    </main>
  </div>;
}
