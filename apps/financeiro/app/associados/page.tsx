import { pageMember } from "@/lib/session";
import { SectionCard, SectionCount, SectionHeader } from "@/components/section-card";
import { AppHeader } from "@/components/app-header";
import { PageBody, PageHeader, SettingsTabs } from "@/components/nav/page-header";
import { AssociateRow, NewAssociate, type AssociateItem } from "@/components/new-associate";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchLabels, isScoutBranch } from "@/lib/associates";
import { cn } from "@/lib/utils";

export default async function AssociatesPage() {
  const membership = await pageMember();
  const { supabase, user } = membership;
  const canEdit = membership.canEdit;
  const { data } = await supabase.from("associates").select("id, name, branch, section, active")
    .eq("group_id", membership.groupId).order("active", { ascending: false }).order("name");
  const associates = (data ?? []) as AssociateItem[];
  const headClass = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/associados" />
    <PageBody>
      <PageHeader title="Configurações" tabs={<SettingsTabs current="associados" canEdit={canEdit} />}
        description="Lista usada para vincular rateios a associados. Inativos deixam de aparecer nos novos lançamentos." />
      {canEdit && <SectionCard><SectionHeader title="Novo associado" /><div className="p-4"><NewAssociate /></div></SectionCard>}
      <SectionCard><SectionHeader title="Cadastrados"><SectionCount>{associates.filter((a) => a.active).length} ativos de {associates.length}</SectionCount></SectionHeader>
        {!associates.length ? <div className="px-6 py-12 text-center text-muted-foreground">Nenhum associado cadastrado.</div> : <div className="overflow-x-auto"><Table className="min-w-[720px]">
          <TableCaption className="sr-only">Associados do grupo</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent"><TableHead className={headClass}>Nome</TableHead><TableHead className={cn(headClass, "w-44")}>Ramo</TableHead><TableHead className={headClass}>Seção</TableHead><TableHead className={cn(headClass, "w-24")}>Status</TableHead>{canEdit && <TableHead className={cn(headClass, "w-36")}><span className="sr-only">Ações</span></TableHead>}</TableRow></TableHeader>
          <TableBody>{associates.map((associate) => canEdit
            ? <AssociateRow key={associate.id} associate={associate} />
            : <TableRow key={associate.id}><TableCell className="px-3 py-1.5">{associate.name}</TableCell><TableCell className="px-3 py-1.5">{isScoutBranch(associate.branch) ? branchLabels[associate.branch] : associate.branch}</TableCell><TableCell className="px-3 py-1.5">{associate.section ?? "—"}</TableCell><TableCell className="px-3 py-1.5">{associate.active ? "Ativo" : "Inativo"}</TableCell></TableRow>)}
          </TableBody>
        </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}
