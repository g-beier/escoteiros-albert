import { pageMember } from "@/lib/session";
import { SectionCard, SectionCount, SectionHeader } from "@/components/section-card";
import { AppHeader } from "@/components/app-header";
import { AssociatesImport } from "@/components/associates-import";
import { PageBody, PageHeader, SectionTabs, SettingsTabs } from "@/components/nav/page-header";
import { AssociateRow, NewAssociate, type AssociateItem } from "@/components/new-associate";
import { SectionsManager } from "@/components/sections-manager";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchLabels, groupBySection, isScoutBranch, matchesSection, NO_SECTION, NO_SECTION_PARAM, sectionsOf, type PatrolItem, type SectionItem } from "@/lib/associates";
import { cn } from "@/lib/utils";

type Params = { visao?: string; secao?: string };

export default async function AssociatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const bySection = params.visao === "secoes";
  const membership = await pageMember();
  const { supabase, user } = membership;
  const canEdit = membership.canEdit;
  const [{ data }, { data: sectionRows }, { data: patrolRows }] = await Promise.all([
    supabase.from("associate_rows").select("id, name, branch, section_id, section, patrol_id, patrol, active")
      .eq("group_id", membership.groupId).order("active", { ascending: false }).order("name"),
    supabase.from("sections").select("id, branch, name, active").eq("group_id", membership.groupId).order("name"),
    supabase.from("patrols").select("id, section_id, name, active").eq("group_id", membership.groupId).order("name"),
  ]);
  const associates = (data ?? []) as AssociateItem[];
  const catalog = {
    sections: (sectionRows ?? []) as SectionItem[],
    patrols: (patrolRows ?? []).map((p) => ({ id: p.id as string, sectionId: p.section_id as string, name: p.name as string, active: p.active as boolean })) satisfies PatrolItem[],
  };
  const counts: Record<string, number> = {};
  for (const a of associates) for (const key of [a.section_id, a.patrol_id]) if (key) counts[key] = (counts[key] ?? 0) + 1;
  const sections = sectionsOf(associates);
  const sectionFilter = params.secao && (params.secao === NO_SECTION_PARAM || sections.includes(params.secao)) ? params.secao : undefined;
  const shown = associates.filter((a) => matchesSection(a, sectionFilter));
  const href = (patch: Params) => {
    const next = new URLSearchParams();
    const merged = { visao: bySection ? "secoes" : undefined, secao: sectionFilter, ...patch };
    if (merged.visao) next.set("visao", merged.visao);
    if (merged.secao) next.set("secao", merged.secao);
    return next.size ? `/associados?${next}` : "/associados";
  };
  const headClass = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/associados" />
    <PageBody>
      <PageHeader title="Configurações" tabs={<SettingsTabs current="associados" canEdit={canEdit} />}
        description="Lista usada para vincular rateios a associados. Inativos deixam de aparecer nos novos lançamentos." />
      {canEdit && <SectionsManager {...catalog} counts={counts} />}
      {canEdit && <SectionCard><SectionHeader title="Novo associado" /><div className="p-4"><NewAssociate {...catalog} /></div></SectionCard>}
      {canEdit && <AssociatesImport existing={associates} {...catalog} />}
      <SectionCard><SectionHeader title="Cadastrados"><SectionCount>{shown.filter((a) => a.active).length} ativos de {shown.length}</SectionCount>
          <SectionTabs label="Visualização" tabs={[
            { href: href({ visao: undefined }), label: "Lista", active: !bySection },
            { href: href({ visao: "secoes" }), label: "Por seção", active: bySection },
          ]} />
        </SectionHeader>
        {sections.length > 1 && <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <span className="text-xs text-muted-foreground">Seção</span>
          <SectionTabs label="Filtrar por seção" tabs={[
            { href: href({ secao: undefined }), label: "Todas", active: !sectionFilter },
            ...sections.map((section) => ({ href: href({ secao: section ?? NO_SECTION_PARAM }), label: section ?? NO_SECTION, active: sectionFilter === (section ?? NO_SECTION_PARAM) })),
          ]} />
        </div>}
        {!associates.length ? <div className="px-6 py-12 text-center text-muted-foreground">Nenhum associado cadastrado.</div>
        : bySection ? <SectionGroups associates={shown} />
        : <div className="overflow-x-auto"><Table className="min-w-[860px]">
          <TableCaption className="sr-only">Associados do grupo</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent"><TableHead className={headClass}>Nome</TableHead><TableHead className={cn(headClass, "w-44")}>Ramo</TableHead><TableHead className={headClass}>Seção</TableHead><TableHead className={headClass}>Patrulha</TableHead><TableHead className={cn(headClass, "w-24")}>Status</TableHead>{canEdit && <TableHead className={cn(headClass, "w-36")}><span className="sr-only">Ações</span></TableHead>}</TableRow></TableHeader>
          <TableBody>{shown.map((associate) => canEdit
            ? <AssociateRow key={associate.id} associate={associate} catalog={catalog} />
            : <TableRow key={associate.id}><TableCell className="px-3 py-1.5">{associate.name}</TableCell><TableCell className="px-3 py-1.5">{isScoutBranch(associate.branch) ? branchLabels[associate.branch] : associate.branch}</TableCell><TableCell className="px-3 py-1.5">{associate.section ?? "—"}</TableCell><TableCell className="px-3 py-1.5">{associate.patrol ?? "—"}</TableCell><TableCell className="px-3 py-1.5">{associate.active ? "Ativo" : "Inativo"}</TableCell></TableRow>)}
          </TableBody>
        </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}

/** Visão por seção (só leitura): um bloco por seção, nomes em ordem alfabética, inativos esmaecidos. */
function SectionGroups({ associates }: { associates: AssociateItem[] }) {
  return <div className="grid gap-4 p-4">
    {groupBySection(associates).map((group) => {
      const active = group.members.filter((m) => m.active).length;
      return <section key={group.section ?? NO_SECTION} aria-label={group.section ?? NO_SECTION} className="grid gap-2">
        <h3 className="m-0 flex items-baseline gap-2 border-b pb-1 text-sm font-semibold">
          {group.section ?? NO_SECTION}
          <span className="num text-xs font-normal text-muted-foreground">{active} {active === 1 ? "ativo" : "ativos"}{group.members.length > active && ` · ${group.members.length - active} ${group.members.length - active === 1 ? "inativo" : "inativos"}`}</span>
        </h3>
        <ul className="m-0 grid list-none gap-x-6 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {group.members.map((member) => <li key={member.id} className={cn("flex items-baseline gap-2 text-xs", !member.active && "text-muted-foreground")}>
            <span className={cn("truncate", member.active && "font-medium")}>{member.name}</span>
            <span className="shrink-0 text-muted-foreground">{member.patrol ?? (isScoutBranch(member.branch) ? branchLabels[member.branch] : member.branch)}{!member.active && " · inativo"}</span>
          </li>)}
        </ul>
      </section>;
    })}
  </div>;
}
