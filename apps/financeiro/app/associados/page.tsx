import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { AssociateRow, NewAssociate, type AssociateItem } from "@/components/new-associate";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canManageEntries } from "@/lib/auth";
import { branchLabels, isScoutBranch } from "@/lib/associates";
import { cn } from "@/lib/utils";

export default async function AssociatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!membership) redirect("/");
  const canEdit = canManageEntries(membership.role);
  const { data } = await supabase.from("associates").select("id, name, branch, section, active")
    .eq("group_id", membership.group_id).order("active", { ascending: false }).order("name");
  const associates = (data ?? []) as AssociateItem[];
  const headClass = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/associados" />
    <main className="main">
      <div className="page-head"><div><span className="eyebrow">Cadastros</span><h1>Associados</h1><p className="lede">Lista usada para vincular rateios a associados. Inativos deixam de aparecer nos novos lançamentos.</p></div></div>
      {canEdit && <section className="card" style={{ marginBottom: 20 }}><header className="card-head"><h2 className="card-title">Novo associado</h2></header><div className="p-4"><NewAssociate /></div></section>}
      <section className="card"><header className="card-head"><h2 className="card-title">Cadastrados</h2><span className="muted" style={{ fontSize: 12 }}>{associates.filter((a) => a.active).length} ativos de {associates.length}</span></header>
        {!associates.length ? <div className="px-6 py-12 text-center text-muted-foreground">Nenhum associado cadastrado.</div> : <div className="overflow-x-auto"><Table className="min-w-[720px]">
          <TableCaption className="sr-only">Associados do grupo</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent"><TableHead className={headClass}>Nome</TableHead><TableHead className={cn(headClass, "w-44")}>Ramo</TableHead><TableHead className={headClass}>Seção</TableHead><TableHead className={cn(headClass, "w-24")}>Status</TableHead>{canEdit && <TableHead className={cn(headClass, "w-36")}><span className="sr-only">Ações</span></TableHead>}</TableRow></TableHeader>
          <TableBody>{associates.map((associate) => canEdit
            ? <AssociateRow key={associate.id} associate={associate} />
            : <TableRow key={associate.id}><TableCell className="px-3 py-1.5">{associate.name}</TableCell><TableCell className="px-3 py-1.5">{isScoutBranch(associate.branch) ? branchLabels[associate.branch] : associate.branch}</TableCell><TableCell className="px-3 py-1.5">{associate.section ?? "—"}</TableCell><TableCell className="px-3 py-1.5">{associate.active ? "Ativo" : "Inativo"}</TableCell></TableRow>)}
          </TableBody>
        </Table></div>}
      </section>
    </main>
  </div>;
}
