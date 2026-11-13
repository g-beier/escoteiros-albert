import { pageMember } from "@/lib/session";
import { SectionBody, SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/app-header";
import { AssociatesImport } from "@/components/associates-import";
import { FilterOptionsProvider } from "@/components/entries/filter-options";
import { MultiFilter } from "@/components/entries/multi-filter";
import { PageBody, PageHeader, SectionTabs, settingsCrumbs, SettingsTabs } from "@/components/nav/page-header";
import { AssociateRow, NewAssociate, type AssociateItem } from "@/components/new-associate";
import { SectionsManager } from "@/components/sections-manager";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { branchLabels, groupBySection, isScoutBranch, matchesSections, placementLabel, NO_SECTION, NO_SECTION_PARAM, sectionsOf, type PatrolItem, type SectionItem } from "@/lib/associates";
import { cn } from "@geas/ui/lib/utils";

type Params = { agrupar?: string; secao?: string };

export default async function AssociatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const bySection = params.agrupar === "secao";
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
  // secao=A,B,nenhuma: uma ou mais seções (mesmo filtro de /mensalidades); valores desconhecidos são ignorados
  const sectionValues = sections.map((section) => section ?? NO_SECTION_PARAM);
  const selectedSections = (params.secao ?? "").split(",").map((v) => v.trim()).filter((v) => sectionValues.includes(v));
  const sectionFilter = selectedSections.length && selectedSections.length < sectionValues.length ? selectedSections.join(",") : undefined;
  const shown = sectionFilter ? associates.filter((a) => matchesSections(a, selectedSections)) : associates;
  const href = (patch: Params) => {
    const next = new URLSearchParams();
    const merged = { agrupar: bySection ? "secao" : undefined, secao: sectionFilter, ...patch };
    if (merged.agrupar) next.set("agrupar", merged.agrupar);
    if (merged.secao) next.set("secao", merged.secao);
    return next.size ? `/configuracoes/associados?${next}` : "/configuracoes/associados";
  };
  const headClass = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";

  return <div className="shell">
    <AppHeader role={membership.role} email={user.email ?? ""} current="/configuracoes/associados" />
    <PageBody width="narrow" className="gap-4">
      <PageHeader title="Configurações" crumbs={settingsCrumbs("associados", canEdit)} tabs={<SettingsTabs current="associados" canEdit={canEdit} />}
        description="Lista usada para vincular rateios a associados. Inativos deixam de aparecer nos novos lançamentos." />
      {canEdit && <SectionCard><SectionHeader title="Novo associado"><AssociatesImport existing={associates} {...catalog} /></SectionHeader>
        <SectionBody><NewAssociate {...catalog} /></SectionBody></SectionCard>}
      <SectionCard><SectionHeader title="Cadastrados"><SectionCount>{shown.filter((a) => a.active).length} ativos de {shown.length}</SectionCount>
          <SectionTabs label="Visualização" tabs={[
            { href: href({ agrupar: undefined }), label: "Lista", active: !bySection },
            { href: href({ agrupar: "secao" }), label: "Por seção", active: bySection },
          ]} />
        </SectionHeader>
        {sections.length > 1 && <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <FilterOptionsProvider dimensions={{ secao: { label: "Seção", options: sections.map((section) => ({ value: section ?? NO_SECTION_PARAM, label: section ?? NO_SECTION })) } }}>
            <MultiFilter filterKey="secao" />
          </FilterOptionsProvider>
        </div>}
        {!associates.length ? <p className="m-0 px-4 py-4 text-center text-xs text-muted-foreground">Nenhum associado cadastrado.</p>
        : bySection ? <SectionGroups associates={shown} />
        : <div className="overflow-x-auto"><Table className="min-w-[640px]">
          <TableCaption className="sr-only">Associados do grupo</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent"><TableHead className={headClass}>Nome</TableHead><TableHead className={cn(headClass, "w-[40%]")}>Divisão</TableHead><TableHead className={cn(headClass, "w-24")}>Status</TableHead>{canEdit && <TableHead className={cn(headClass, "w-36")}><span className="sr-only">Ações</span></TableHead>}</TableRow></TableHeader>
          <TableBody>{shown.map((associate) => canEdit
            ? <AssociateRow key={associate.id} associate={associate} catalog={catalog} />
            : <TableRow key={associate.id}><TableCell className="px-3 py-1">{associate.name}</TableCell><TableCell className="px-3 py-1">{placementLabel(associate)}</TableCell><TableCell className="px-3 py-1">{associate.active ? "Ativo" : "Inativo"}</TableCell></TableRow>)}
          </TableBody>
        </Table></div>}
      </SectionCard>
      {canEdit && <SectionsManager {...catalog} counts={counts} />}
    </PageBody>
  </div>;
}

/** Visão por seção (só leitura): um bloco por seção, nomes em ordem alfabética, inativos esmaecidos. */
function SectionGroups({ associates }: { associates: AssociateItem[] }) {
  return <div className="grid gap-3 p-3">
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
